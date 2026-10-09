import { DAILY_REWARD, STYLE_COST, COLOR_COST, STYLES, COLORS } from '../shared/types';
import type { Building, Style, Color } from '../shared/types';
import { seedDemo, ensureDemoConnections } from './demo';
import { VIEW_RADIUS } from '../shared/world';
import { availablePlotPlans, previewPlotPlans } from '../shared/plots';
import { reward, projects, processConstruction } from './economy';
import { REWARDS, MAX_LEVEL, TIERS, SEGMENT_COST, SEGMENT_STYLES, BUILDING_THEMES, tierStartLevel, xpAtLevel } from '../shared/progression';
import { PROJECT_RADIUS } from '../shared/projects';
import { plotPosition } from '../shared/world';

interface Env {
  DB: D1Database; NEIGHBORHOODS: DurableObjectNamespace; ASSETS: Fetcher;
  DEV_MODE?: string; APP_ORIGIN: string;
  GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string;
  FOUNDER_GITHUB_ID?: string;
}
interface User { id: string; github_id: string | null; username: string; name: string; is_demo: number; github_token: string | null; }
const DAY = () => new Date().toISOString().slice(0, 10);
const NOW = () => Math.floor(Date.now() / 1000);
const QUERY = `SELECT u.id, u.username, u.name, u.bio, u.avatar, u.github_url, u.website, u.school,
  u.is_demo, b.x, b.z, b.level, b.xp, b.bricks, b.segments, b.style, b.color, b.updated_at,
  (SELECT COUNT(*) FROM tower_likes WHERE tower_id=u.id) likes,
  COALESCE(m.commits, 0) commits, COALESCE(m.prs, 0) prs, COALESCE(m.reviews, 0) reviews, m.synced_at,
  (SELECT i.inviter_id FROM invitations i WHERE i.used_by=u.id) invited_by,
  ((SELECT COUNT(*) FROM invitations i WHERE i.inviter_id=u.id AND i.used_by IS NOT NULL) +
    CASE WHEN EXISTS(SELECT 1 FROM invitations i WHERE i.used_by=u.id) THEN 1 ELSE 0 END) invite_degree
  FROM buildings b JOIN users u ON b.user_id=u.id LEFT JOIN metrics m ON m.user_id=u.id`;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const cookieValue = (req: Request, name: string) => req.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
const cookie = (req: Request, name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const roomName = (b: { x: number; z: number }) => `${Math.floor(b.x / 8)},${Math.floor(b.z / 8)}`;
const uuid = () => crypto.randomUUID();
const hex = (a: ArrayBuffer) => [...new Uint8Array(a)].map(v => v.toString(16).padStart(2, '0')).join('');
const hash = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const authReady = (e: Env) => Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET && e.TOKEN_ENCRYPTION_KEY);

async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = cookieValue(req, 'cities_session');
  if (!token) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').bind(await hash(token), NOW()).first<User>();
}
async function requireUser(req: Request, env: Env) {
  const user = await currentUser(req, env);
  if (!user) throw new ApiError('Sign in to build your tower.', 401);
  if (user.is_demo && env.DEV_MODE !== 'true') throw new ApiError('Demo access is only available locally.', 403);
  return user;
}
async function session(req: Request, env: Env, userId: string) {
  const token = uuid() + uuid();
  await env.DB.prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)').bind(await hash(token), userId, NOW() + 60 * 60 * 24 * 30).run();
  return cookie(req, 'cities_session', token, 60 * 60 * 24 * 30);
}
async function body(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('Content-Length')) > 4096) throw new ApiError('Request is too large.', 413);
  const text = await req.text();
  if (text.length > 4096) throw new ApiError('Request is too large.', 413);
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ApiError('Send a valid JSON object.'); }
}
async function building(env: Env, id: string) {
  const row = await env.DB.prepare(`${QUERY} WHERE u.id=?`).bind(id).first<Building>();
  if (!row) throw new ApiError('This tower could not be found.', 404);
  return row;
}
// Local dev diagnostics may inspect balances. Public snapshots and events cannot.
const visibleBuilding=(env:Env,b:Building,viewer:string|null=null):Building=>
  env.DEV_MODE==='true'||b.id===viewer?b:{...b,bricks:null};
async function broadcast(env: Env, b: Building, extra: Record<string,unknown> = {}) {
  const room = env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName(roomName(b)));
  await room.fetch('https://neighborhood.internal/update', { method: 'POST', body: JSON.stringify({ type: 'building.changed', building: visibleBuilding(env,b), ...extra }) });
}
async function changed(env: Env, id: string, ctx: ExecutionContext, extra: Record<string,unknown> = {}) {
  const b = await building(env, id);
  ctx.waitUntil(broadcast(env, b, extra));
  return b;
}
function settleConstruction(env:Env,ctx:ExecutionContext){
  ctx.waitUntil(processConstruction(env.DB).then(ids=>Promise.all(ids.map(async id=>broadcast(env,await building(env,id))))).catch(e=>console.warn('Construction queue:',String(e))));
}
async function seal(token: string, env: Env) {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(env.TOKEN_ENCRYPTION_KEY!), c => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}
async function unseal(value: string, env: Env) {
  const [iv, data] = value.split('.');
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(env.TOKEN_ENCRYPTION_KEY!), c => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
  const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(data), c => c.charCodeAt(0)));
  return new TextDecoder().decode(decoded);
}
const ghHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, 'User-Agent': 'cities', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
async function syncGithub(env: Env, user: User) {
  if (user.is_demo) throw new ApiError('Demo activity is illustrative. Connect a real GitHub account to sync.');
  if (!user.github_token) throw new ApiError('Reconnect your GitHub account to sync activity.', 401);
  const old = await env.DB.prepare('SELECT synced_at FROM metrics WHERE user_id=?').bind(user.id).first<{ synced_at: string | null }>();
  if (old?.synced_at && Date.now() - new Date(old.synced_at.replace(' ', 'T') + 'Z').getTime() < 15 * 60_000) throw new ApiError('Your activity is fresh. You can sync again in 15 minutes.', 429);
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: ghHeaders(await unseal(user.github_token, env)),
    body: JSON.stringify({ query: `query($login:String!) { user(login:$login) { contributionsCollection { totalCommitContributions } } }`, variables: { login: user.username } }),
  });
  if (!response.ok) throw new ApiError('GitHub is unavailable or rate limited. Try syncing later.', 502);
  const data = await response.json() as { data?: { user?: { contributionsCollection: { totalCommitContributions: number } } }; errors?: unknown[] };
  const c = data.data?.user?.contributionsCollection;
  if (!c || data.errors?.length) throw new ApiError('GitHub could not return your contribution counts. Reconnect or try later.', 502);
  const commits = c.totalCommitContributions;
  if(!Number.isSafeInteger(commits)||commits<0)throw new ApiError('GitHub returned an invalid commit count.',502);
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description)
      SELECT ?,user_id,'github',(?-credited_commits)*?,
      CAST((?-credited_commits)*?/5 AS INTEGER),'Verified GitHub commits'
      FROM metrics WHERE user_id=? AND ?>credited_commits`)
      .bind(`github-commits:${user.id}:${commits}`,commits,REWARDS.commit,commits,REWARDS.commit,user.id,commits),
    env.DB.prepare(`UPDATE metrics SET commits=?, credited_commits=MAX(credited_commits, ?),
      synced_at=datetime('now') WHERE user_id=?`).bind(commits, commits, user.id),
  ]);
}

async function join(env: Env, profile: { id: number; login: string; name?: string; bio?: string; avatar_url?: string; html_url?: string; blog?: string }, accessToken: string, invite: string | null) {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE github_id=?').bind(String(profile.id)).first<{ id: string }>();
  const encrypted = await seal(accessToken, env);
  if (existing) {
    await env.DB.prepare('UPDATE users SET github_token=?, username=?, name=?, bio=?, avatar=?, github_url=? WHERE id=?').bind(encrypted, profile.login, profile.name || profile.login, profile.bio || '', profile.avatar_url || null, profile.html_url || null, existing.id).run();
    return existing.id;
  }
  if (env.FOUNDER_GITHUB_ID === String(profile.id)) {
    const id = uuid();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,github_id,username,name,bio,avatar,github_url,github_token) VALUES(?,?,?,?,?,?,?,?)').bind(id, String(profile.id), profile.login, profile.name || profile.login, profile.bio || '', profile.avatar_url || null, profile.html_url || null, encrypted),
      env.DB.prepare('INSERT INTO buildings(user_id,x,z) VALUES(?,0,0)').bind(id),
      env.DB.prepare('INSERT INTO metrics(user_id) VALUES(?)').bind(id),
    ]);
    return id;
  }
  const invitation = invite ? await env.DB.prepare('SELECT i.*, b.x, b.z FROM invitations i JOIN buildings b ON b.user_id=i.inviter_id WHERE i.token=? AND i.used_by IS NULL').bind(invite).first<{ x: number; z: number; inviter_id: string }>() : null;
  // The founding account must be explicitly configured server-side; never open public signups.
  if (!invitation) throw new ApiError('A valid, unused invitation is required to join this city.', 403);
  const id = uuid();
  const occupied = new Set((await env.DB.prepare('SELECT x,z FROM buildings WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?').bind(invitation.x - 12, invitation.x + 12, invitation.z - 12, invitation.z + 12).all<{ x: number; z: number }>()).results.map(p => `${p.x},${p.z}`));
  let attempts = 0;
  const plannedSlots=availablePlotPlans(invitation,occupied);
  for (const {x,z} of plannedSlots) {
    // A guard table's UNIQUE(token) is represented by the conditional claim below plus
    // a NOT NULL assertion in the insert. A competing invite redemption rolls back the batch.
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users(id, github_id, username, name, bio, avatar, github_url, website, github_token)
          VALUES((SELECT ? WHERE EXISTS(SELECT 1 FROM invitations WHERE token=? AND used_by IS NULL)), ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, invite, String(profile.id), profile.login, profile.name || profile.login, profile.bio || '', profile.avatar_url || null, profile.html_url || null, /^https?:\/\//.test(profile.blog || '') ? profile.blog : null, encrypted),
        env.DB.prepare('INSERT INTO buildings(user_id,x,z) VALUES(?,?,?)').bind(id, x, z),
        env.DB.prepare('INSERT INTO metrics(user_id) VALUES(?)').bind(id),
        env.DB.prepare('UPDATE invitations SET used_by=? WHERE token=? AND used_by IS NULL').bind(id, invite),
        env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT ?,inviter_id,'invite',?,0,'An invited resident joined' FROM invitations WHERE token=? AND used_by=?`).bind(`invite:${id}`,REWARDS.invite,invite,id),
      ]);
      return id;
    } catch (error) {
      const used = await env.DB.prepare('SELECT used_by FROM invitations WHERE token=?').bind(invite).first<{ used_by: string | null }>();
      if (used?.used_by) throw new ApiError('This invitation has already been used.', 409);
      const found = await env.DB.prepare('SELECT id FROM users WHERE github_id=?').bind(String(profile.id)).first<{ id: string }>();
      if (found) return found.id;
      if (!String(error).includes('UNIQUE') || ++attempts > 5) throw error;
      occupied.add(`${x},${z}`);
    }
  }
  throw new ApiError('This neighborhood is full. Ask for an invitation from another neighbor.', 409);
}

export class Neighborhood {
  constructor(private ctx: DurableObjectState) {}
  async fetch(req: Request) {
    if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (req.method === 'POST') {
      const text = await req.text();
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(text); } catch { ws.close(1011, 'Reconnect to refresh the city.'); } }
    }
    return new Response('ok');
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) { if (message === 'ping') ws.send('pong'); }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Abnormal-close sentinel values cannot be transmitted in a close frame.
    const safeCode = code === 1000 || code === 1001 || (code >= 3000 && code <= 4999) ? code : 1000;
    try { ws.close(safeCode, reason.slice(0,60)); } catch { /* Already closed. */ }
  }
  webSocketError(ws: WebSocket) { ws.close(1011, 'Reconnect to refresh the city.'); }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.get('Origin');
        if (!origin || ![env.APP_ORIGIN, url.origin].includes(origin)) throw new ApiError('Open the city in its own tab before making changes.', 403);
      }
      if (path === '/api/bootstrap' && req.method === 'GET') {
        if(env.DEV_MODE==='true')await ensureDemoConnections(env.DB);
        settleConstruction(env,ctx);
        const user = await currentUser(req, env);
        // A bounded snapshot of the viewed neighborhood. Client requests another on pan.
        const centerX = Math.max(-1e6, Math.min(1e6, Number(url.searchParams.get('x')) || 0));
        const centerZ = Math.max(-1e6, Math.min(1e6, Number(url.searchParams.get('z')) || 0));
        const rows = await env.DB.prepare(`${QUERY} WHERE b.x BETWEEN ? AND ? AND b.z BETWEEN ? AND ? ORDER BY ((b.x-?)*(b.x-?)+(b.z-?)*(b.z-?)) LIMIT 250`).bind(centerX - VIEW_RADIUS, centerX + VIEW_RADIUS, centerZ - VIEW_RADIUS, centerZ + VIEW_RADIUS, centerX, centerX, centerZ, centerZ).all<Building>();
        if (user && !rows.results.find(b => b.id === user.id)) rows.results.push(await building(env, user.id));
        const claimed = user ? await env.DB.prepare('SELECT 1 FROM daily_claims WHERE user_id=? AND day=?').bind(user.id, DAY()).first() : null;
        const own=rows.results.find(b=>b.id===user?.id);
        let nextPlots:{x:number;z:number}[]=[];
        if(own){
          // Availability must include every occupied slot, even beyond the render limit.
          const occupied=await env.DB.prepare('SELECT x,z FROM buildings WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?')
            .bind(own.x-12,own.x+12,own.z-12,own.z+12).all<{x:number;z:number}>();
          nextPlots=previewPlotPlans(own,new Set(occupied.results.map(b=>`${b.x},${b.z}`))).map(({x,z})=>({x,z}));
        }
        return json({ buildings: rows.results.map(b=>visibleBuilding(env,b,user?.id??null)), nextPlots, projects:await projects(env.DB,user?.id??null), likedIds:user?(await env.DB.prepare('SELECT tower_id FROM tower_likes WHERE voter_id=?').bind(user.id).all<{tower_id:string}>()).results.map(l=>l.tower_id):[], me: user?.id ?? null, demo: env.DEV_MODE === 'true', githubConfigured: authReady(env), claimedToday: Boolean(claimed), dailyReward: DAILY_REWARD, inviteRequired: true });
      }
      if (path === '/api/dev/start' && req.method === 'POST') {
        if (env.DEV_MODE !== 'true') throw new ApiError('Demo mode is not enabled.', 404);
        const batch = Number(url.searchParams.get('batch') ?? 0);
        if (![0, 1, 2].includes(batch)) throw new ApiError('Choose a valid demo batch.');
        const statements = await seedDemo(env.DB);
        await env.DB.batch(statements.slice(batch * 21, (batch + 1) * 21));
        if(batch===2)await ensureDemoConnections(env.DB);
        return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': await session(req, env, 'demo-you') } });
      }
      if (path === '/api/dev/join' && req.method === 'POST') {
        if (env.DEV_MODE !== 'true') throw new ApiError('Demo mode is not enabled.', 404);
        const user = await requireUser(req, env);
        const data = await body(req); const invite = typeof data.invite === 'string' ? data.invite : '';
        const invitation = await env.DB.prepare('SELECT i.*,b.x,b.z FROM invitations i JOIN buildings b ON b.user_id=i.inviter_id WHERE token=? AND used_by IS NULL AND inviter_id=?').bind(invite, user.id).first<{ x: number; z: number }>();
        if (!invitation) throw new ApiError('Choose an unused invitation you created.', 409);
        const id = `demo-${uuid()}`, username = `neighbor-${id.slice(-6)}`;
        const taken = new Set((await env.DB.prepare('SELECT x,z FROM buildings').all<{ x: number; z: number }>()).results.map(b => `${b.x},${b.z}`));
        const plannedSlots=availablePlotPlans(invitation,taken);
        for (const {x,z} of plannedSlots) {
          try {
            await env.DB.batch([
              env.DB.prepare(`INSERT INTO users(id,username,name,bio,is_demo) VALUES((SELECT ? WHERE EXISTS(SELECT 1 FROM invitations WHERE token=? AND used_by IS NULL)), ?, 'New neighbor', 'A new idea has moved into the neighborhood.', 1)`).bind(id, invite, username),
              env.DB.prepare('INSERT INTO buildings(user_id,x,z,bricks) VALUES(?,?,?,0)').bind(id, x, z),
              env.DB.prepare('INSERT INTO metrics(user_id) VALUES(?)').bind(id),
              env.DB.prepare('UPDATE invitations SET used_by=? WHERE token=? AND used_by IS NULL').bind(id, invite),
          env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT ?,inviter_id,'invite',?,0,'An invited resident joined' FROM invitations WHERE token=? AND used_by=?`).bind(`invite:${id}`,REWARDS.invite,invite,id),
            ]);
            const neighbor=await changed(env,id,ctx),inviter=await changed(env,user.id,ctx);settleConstruction(env,ctx);
            return json({building:neighbor,inviter});
          } catch (e) { if (!String(e).includes('UNIQUE')) throw e; }
        }
        throw new ApiError('No nearby plot is available.', 409);
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        const token = cookieValue(req, 'cities_session');
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await hash(token)).run();
        return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': cookie(req, 'cities_session', '', 0) } });
      }
      if (path === '/api/auth/github' && req.method === 'GET') {
        if (!authReady(env)) throw new ApiError('GitHub login needs server credentials. See the local setup guide.', 503);
        const invite = url.searchParams.get('invite');
        if (invite && !await env.DB.prepare('SELECT token FROM invitations WHERE token=? AND used_by IS NULL').bind(invite).first()) throw new ApiError('This invitation is invalid or has already been used.', 403);
        const state = uuid();
        const verifier = uuid().replaceAll('-', '') + uuid().replaceAll('-', '');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
        const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        await env.DB.prepare('INSERT INTO oauth_states(state,invite,code_verifier,expires_at) VALUES(?,?,?,?)').bind(state, invite, verifier, NOW() + 600).run();
        const dest = new URL('https://github.com/login/oauth/authorize');
        dest.searchParams.set('client_id', env.GITHUB_CLIENT_ID!);
        dest.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/api/auth/github/callback`);
        dest.searchParams.set('scope', 'read:user'); dest.searchParams.set('state', state);
        dest.searchParams.set('code_challenge', challenge); dest.searchParams.set('code_challenge_method', 'S256');
        return new Response(null, { status: 302, headers: { Location: dest.toString(), 'Set-Cookie': cookie(req, 'cities_oauth', state, 600) } });
      }
      if (path === '/api/auth/github/callback' && req.method === 'GET') {
        if (!authReady(env)) throw new ApiError('GitHub login is not configured.', 503);
        const state = url.searchParams.get('state'), code = url.searchParams.get('code');
        if (!state || !code || state !== cookieValue(req, 'cities_oauth')) throw new ApiError('The login expired. Return to the city and try again.', 403);
        const stored = await env.DB.prepare('DELETE FROM oauth_states WHERE state=? AND expires_at>? RETURNING invite,code_verifier').bind(state, NOW()).first<{ invite: string | null; code_verifier: string }>();
        if (!stored) throw new ApiError('The login expired. Return to the city and try again.', 403);
        const exchange = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, code_verifier: stored.code_verifier, redirect_uri: `${env.APP_ORIGIN}/api/auth/github/callback` }) });
        const token = await exchange.json() as { access_token?: string };
        if (!exchange.ok || !token.access_token) throw new ApiError('GitHub could not complete login. Try again.', 502);
        const profileResponse = await fetch('https://api.github.com/user', { headers: ghHeaders(token.access_token) });
        if (!profileResponse.ok) throw new ApiError('GitHub could not return your profile. Try again.', 502);
        const id = await join(env, await profileResponse.json(), token.access_token, stored.invite);
        const joined=await changed(env,id,ctx);
        if(joined.invited_by)await changed(env,joined.invited_by,ctx);
        const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<User>();
        if (user) ctx.waitUntil(syncGithub(env, user).then(async () => broadcast(env, await building(env, id))).catch(e => console.warn('GitHub initial sync failed:', String(e))).finally(()=>settleConstruction(env,ctx)));
        const h = new Headers({ Location: env.APP_ORIGIN, ...headers });
        h.append('Set-Cookie', await session(req, env, id)); h.append('Set-Cookie', cookie(req, 'cities_oauth', '', 0));
        return new Response(null, { status: 302, headers: h });
      }
      if (path === '/api/live' && req.method === 'GET') {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new ApiError('A WebSocket connection is required.', 426);
        if (![env.APP_ORIGIN, url.origin].includes(req.headers.get('Origin') || '')) throw new ApiError('Connection origin is not allowed.', 403);
        const room = url.searchParams.get('room') || '0,0';
        if (!/^-?\d{1,7},-?\d{1,7}$/.test(room)) throw new ApiError('Choose a valid neighborhood.');
        return env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName(room)).fetch(req);
      }
      const user = await requireUser(req, env);
      if(path==='/api/me'&&req.method==='GET')return json({building:await building(env,user.id)});
      if (path === '/api/daily' && req.method === 'POST') {
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO daily_claims(user_id,day) VALUES(?,?)').bind(user.id, DAY()),
            env.DB.prepare('INSERT INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES(?,?,?,?,?,?)')
              .bind(`daily:${user.id}:${DAY()}`,user.id,'daily',REWARDS.dailyXp,REWARDS.dailyBricks,'Daily visit'),
          ]);
        } catch (e) { if (String(e).includes('UNIQUE')) throw new ApiError('You already collected today’s reward.', 409); throw e; }
        settleConstruction(env,ctx);
        return json({ building: await changed(env, user.id, ctx, { claimedDay: DAY() }), reward: REWARDS.dailyBricks });
      }
      if (path === '/api/customize' && req.method === 'POST') {
        const data = await body(req); const kind = data.kind; const value = data.value;
        if (kind !== 'style' && kind !== 'color') throw new ApiError('Choose a style or a color.');
        if (typeof value !== 'string' || !Object.hasOwn(kind==='style'?STYLES:COLORS,value)) throw new ApiError('Choose an available design.');
        const cost = kind === 'style' ? STYLE_COST : COLOR_COST;
        const result = await env.DB.prepare(`UPDATE buildings SET ${kind}=?,bricks=bricks-?,updated_at=datetime('now') WHERE user_id=? AND bricks>=? AND ${kind}<>? RETURNING user_id`).bind(value as Style | Color, cost, user.id, cost, value).first();
        if (!result) throw new ApiError('You need more bricks, or this design is already selected.', 409);
        return json({ building: await changed(env, user.id, ctx) });
      }
      if(path==='/api/segments'&&req.method==='POST'){
        const data=await body(req),index=Number(data.segment);
        if(!Number.isInteger(index)||index<0||index>=TIERS.length||typeof data.color!=='string'||!Object.hasOwn(COLORS,data.color)||typeof data.style!=='string'||!Object.hasOwn(SEGMENT_STYLES,data.style))throw new ApiError('Choose a valid segment design.');
        const theme=data.theme??'contemporary';
        if(typeof theme!=='string'||!Object.hasOwn(BUILDING_THEMES,theme))throw new ApiError('Choose an available architectural theme.');
        const design=JSON.stringify({color:data.color,style:data.style,theme});
        const result=await env.DB.prepare(`UPDATE buildings SET segments=json_set(segments,?,json(?)),bricks=bricks-?,updated_at=datetime('now')
          WHERE user_id=? AND bricks>=? AND level>=? AND (COALESCE(json_extract(segments,?),color)<>?
            OR COALESCE(json_extract(segments,?),CASE WHEN style='modern' OR level>=19 THEN 'glass' ELSE 'classic' END)<>?
            OR COALESCE(json_extract(segments,?),'contemporary')<>?) RETURNING user_id`)
          .bind(`$[${index}]`,design,SEGMENT_COST,user.id,SEGMENT_COST,tierStartLevel(index),`$[${index}].color`,data.color,`$[${index}].style`,data.style,`$[${index}].theme`,theme).first();
        if(!result)throw new ApiError('That segment is locked, you need more bricks, or that design is already selected.',409);
        return json({building:await changed(env,user.id,ctx)});
      }
      if(path==='/api/like'&&req.method==='POST'){
        const data=await body(req),target=typeof data.tower==='string'?data.tower:'';
        if(target===user.id)throw new ApiError('Choose another resident’s tower.');
        if(!user.github_id&&!user.is_demo)throw new ApiError('Connect GitHub before liking a tower.',403);
        const owner=await building(env,target);
        if(Boolean(user.is_demo)!==Boolean(owner.is_demo))throw new ApiError('Demo and real likes are separate.',403);
        try{await env.DB.batch([
          env.DB.prepare('INSERT INTO tower_likes(voter_id,tower_id) VALUES(?,?)').bind(user.id,target),
          env.DB.prepare('INSERT INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES(?,?,?,?,0,?)')
            .bind(`like:${user.id}:${target}`,target,'like',REWARDS.like,'A resident liked your tower'),
        ]);}catch(e){if(String(e).includes('UNIQUE'))throw new ApiError('You already liked this tower.',409);throw e;}
        settleConstruction(env,ctx);return json({building:visibleBuilding(env,await changed(env,target,ctx),user.id)});
      }
      if(path==='/api/history'&&req.method==='GET')return json({events:(await env.DB.prepare('SELECT event_key,source,xp,bricks,description,created_at FROM xp_events WHERE user_id=? ORDER BY rowid DESC LIMIT 12').bind(user.id).all()).results});
      if(path==='/api/projects/contribute'&&req.method==='POST'){
        const data=await body(req),amount=Number(data.amount),requestId=typeof data.requestId==='string'?data.requestId:'';
        if(!Number.isSafeInteger(amount)||amount<1||amount>10000||!/^[a-zA-Z0-9-]{16,64}$/.test(requestId))throw new ApiError('Choose a valid brick contribution.');
        const project=(await projects(env.DB,user.id)).find(p=>p.id===data.project);
        if(!project)throw new ApiError('Project not found.',404);
        const own=await building(env,user.id),a=plotPosition(own.x,own.z),b=plotPosition(project.x,project.z);
        if(Math.hypot(a.x-b.x,a.z-b.z)>PROJECT_RADIUS)throw new ApiError('This project is outside your neighborhood.');
        const id=`${user.id}:${requestId}`;
        const receipt=await env.DB.prepare('INSERT OR IGNORE INTO project_contributions(id,project_id,user_id,amount) SELECT ?,?,?,? WHERE (SELECT bricks FROM buildings WHERE user_id=?)>=? AND (SELECT funded+?<=goal FROM public_projects WHERE id=?) RETURNING id')
          .bind(id,project.id,user.id,amount,user.id,amount,amount,project.id).first();
        if(!receipt){
          const prior=await env.DB.prepare('SELECT project_id,amount FROM project_contributions WHERE id=?').bind(id).first<{project_id:string;amount:number}>();
          if(!prior||prior.project_id!==project.id||prior.amount!==amount)throw new ApiError('Check your bricks and the project’s remaining goal.',409);
        }
        const updated=(await projects(env.DB,user.id)).find(p=>p.id===project.id)!;
        const message={type:'project.changed',project:{...updated,myContribution:0}};
        ctx.waitUntil(env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName(roomName(project))).fetch('https://neighborhood.internal/update',{method:'POST',body:JSON.stringify(message)}));
        settleConstruction(env,ctx);return json({project:updated,building:await changed(env,user.id,ctx)});
      }
      if(path==='/api/dev/progression'&&req.method==='POST'){
        if(env.DEV_MODE!=='true')throw new ApiError('Dev tools are local only.',404);
        const data=await body(req),target=typeof data.tower==='string'?data.tower:user.id;
        const demo=await building(env,target);if(!demo.is_demo)throw new ApiError('Choose a demo resident.');
        if(data.level!==undefined){
          const level=Number(data.level);if(!Number.isInteger(level)||level<1||level>MAX_LEVEL)throw new ApiError(`Choose level 1–${MAX_LEVEL}.`);
          await env.DB.prepare("UPDATE buildings SET xp=?,level=?,updated_at=datetime('now') WHERE user_id=?").bind(xpAtLevel(level),level,target).run();
          // A preview tier change is a dev edit, not a verified construction event.
          await env.DB.prepare('UPDATE construction_events SET processed=1 WHERE user_id=?').bind(target).run();
        }else{
          const source=typeof data.source==='string'?data.source:'github';
          const samples:Record<string,[number,number]>={github:[REWARDS.commit,REWARDS.commit/5],invite:[REWARDS.invite,0],like:[REWARDS.like,0],construction:[REWARDS.construction,0],project:[REWARDS.project,0],daily:[REWARDS.dailyXp,REWARDS.dailyBricks],bricks:[0,100]};
          const sample=samples[source];if(!sample)throw new ApiError('Choose a sample reward.');
          await reward(env.DB,`demo:${uuid()}`,target,'demo',sample[0],sample[1],`Simulated ${source} reward`);
          settleConstruction(env,ctx);
        }
        return json({building:await changed(env,target,ctx)});
      }
      if (path === '/api/sync' && req.method === 'POST') {
        await syncGithub(env, user);settleConstruction(env,ctx); return json({ building: await changed(env, user.id, ctx) });
      }
      if (path === '/api/invites' && req.method === 'GET') {
        return json({ invites: (await env.DB.prepare('SELECT token,created_at,used_by FROM invitations WHERE inviter_id=? ORDER BY created_at DESC LIMIT 10').bind(user.id).all()).results });
      }
      if (path === '/api/invites' && req.method === 'POST') {
        // An atomic daily allowance limits accidental or abusive plot expansion.
        const token = uuid();
        const inserted = await env.DB.prepare(`INSERT INTO invitations(token,inviter_id) SELECT ?,? WHERE
          (SELECT COUNT(*) FROM invitations WHERE inviter_id=? AND created_at>=date('now'))<5 RETURNING token`).bind(token, user.id, user.id).first();
        if (!inserted) throw new ApiError('You can create five invitations per day. Try again tomorrow.', 429);
        return json({ token, url: `${env.APP_ORIGIN}/?invite=${token}` });
      }
      throw new ApiError('This route could not be found.', 404);
    } catch (e) {
      if (path === '/api/auth/github' || path === '/api/auth/github/callback') {
        const dest = new URL(env.APP_ORIGIN);
        dest.searchParams.set('auth_error', e instanceof ApiError ? e.message : 'GitHub login could not be completed. Try again.');
        return new Response(null,{status:302,headers:{Location:dest.toString(),...headers}});
      }
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      console.error('Worker request failed:', String(e));
      return json({ error: 'The city could not complete that request. Try again in a moment.' }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(NOW()),
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(NOW()),
    ]);
    if (!authReady(env)){settleConstruction(env,ctx);return;}
    const users = await env.DB.prepare(`SELECT u.* FROM users u JOIN metrics m ON m.user_id=u.id WHERE u.is_demo=0 AND u.github_token IS NOT NULL
      AND (m.synced_at IS NULL OR m.synced_at<datetime('now','-1 day')) ORDER BY m.synced_at LIMIT 3`).all<User>();
    ctx.waitUntil(Promise.all(users.results.map(user=>syncGithub(env,user).then(async()=>broadcast(env,await building(env,user.id)))
      .catch(e=>console.warn('Scheduled GitHub sync failed:',String(e))))).then(()=>settleConstruction(env,ctx)));

  },
} satisfies ExportedHandler<Env>;
