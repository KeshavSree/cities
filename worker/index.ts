import { DAILY_REWARD, STYLE_COST, COLOR_COST, STYLES, COLORS } from '../shared/types';
import type { Building, Style, Color } from '../shared/types';
import { localMockEnabled } from './localDev';
import { seedDemo, ensureDemoConnections } from './demo';
import { demoPurchasePlan,denseDemoPurchasePlan } from './demoPurchases';
import { DECORATIONS, isDecorationKind, decorationsOf, placementError, suggestedDecorationPosition } from '../shared/decorations';
import { VIEW_RADIUS } from '../shared/world';
import { availablePlotPlans, previewPlotPlans } from '../shared/plots';
import { reward, projects, processConstruction } from './economy';
import { GITHUB_DAILY_COMMIT_LIMIT, REWARDS, MAX_LEVEL, TIERS, SEGMENT_STYLES, BUILDING_THEMES, DEFAULT_UNLOCKED_THEMES, tierStartLevel, xpAtLevel, type BuildingTheme } from '../shared/progression';
import { canContributeToProject } from '../shared/projects';
import { BIO_MAX_LENGTH } from '../shared/profile';
import type { ContributionCalendar } from '../shared/github';
import { avatarResponse, saveAvatar, PhotoError } from './profile';

interface Env {
  DB: D1Database; NEIGHBORHOODS: DurableObjectNamespace; ASSETS: Fetcher;
  DEV_MODE?: string; APP_ORIGIN: string;
  GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string;
  FOUNDER_GITHUB_ID?: string; GITHUB_REPOSITORY?: string;
}
interface User { id: string; github_id: string | null; username: string; name: string; is_demo: number; github_token: string | null; }
const DAY = () => new Date().toISOString().slice(0, 10);
const NOW = () => Math.floor(Date.now() / 1000);
const QUERY = `SELECT u.id, u.username, u.name, u.bio, u.avatar, u.linkedin_url, u.github_url, u.website, u.school,
  u.is_demo, b.x, b.z, b.level, b.xp, b.bricks, b.segments, b.style, b.color, b.updated_at,b.decorations_version,
  (SELECT json_group_array(json_object('id',d.id,'kind',d.kind,'x',d.x,'z',d.z,'rotation',d.rotation)) FROM decorations d WHERE d.user_id=u.id) decorations,
  (SELECT COUNT(*) FROM tower_likes WHERE tower_id=u.id) likes,
  COALESCE(m.commits, 0) commits, COALESCE(m.prs, 0) prs, COALESCE(m.reviews, 0) reviews, m.synced_at,
  (SELECT i.inviter_id FROM invitation_redemptions r JOIN invitations i ON i.token=r.token WHERE r.user_id=u.id) invited_by,
  (SELECT parent.x FROM invitation_redemptions r JOIN invitations i ON i.token=r.token JOIN buildings parent ON parent.user_id=i.inviter_id WHERE r.user_id=u.id) inviter_x,
  (SELECT parent.z FROM invitation_redemptions r JOIN invitations i ON i.token=r.token JOIN buildings parent ON parent.user_id=i.inviter_id WHERE r.user_id=u.id) inviter_z,
  ((SELECT COUNT(*) FROM invitation_redemptions r JOIN invitations i ON i.token=r.token WHERE i.inviter_id=u.id) +
    CASE WHEN EXISTS(SELECT 1 FROM invitation_redemptions r WHERE r.user_id=u.id) THEN 1 ELSE 0 END) invite_degree
  FROM buildings b JOIN users u ON b.user_id=u.id LEFT JOIN metrics m ON m.user_id=u.id`;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
class ApiError extends Error { constructor(message: string, public status = 400, public code?:string) { super(message); } }
const cookieValue = (req: Request, name: string) => req.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
const cookie = (req: Request, name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const uuid = () => crypto.randomUUID();
const hex = (a: ArrayBuffer) => [...new Uint8Array(a)].map(v => v.toString(16).padStart(2, '0')).join('');
const hash = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const authReady = (e: Env) => Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET && e.TOKEN_ENCRYPTION_KEY);

async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = cookieValue(req, 'cities_session');
  if(token){const user=await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').bind(await hash(token),NOW()).first<User>();if(user)return user;}
  if(localMockEnabled(env.DEV_MODE,new URL(env.APP_ORIGIN).hostname))return env.DB.prepare("SELECT * FROM users WHERE id='demo-you' AND is_demo=1").first<User>();
  return null;
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
async function ensureDevPlayground(env:Env){
  if(!await env.DB.prepare("SELECT 1 FROM users u JOIN buildings b ON b.user_id=u.id WHERE u.id='demo-you' AND u.is_demo=1").first())return;
  const gift=await env.DB.prepare("INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES('dev-playground-v1','demo-you','demo',0,1500,'Local development playground bricks') RETURNING event_key").first();
  const empty=await env.DB.prepare("INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES('dev-empty-streets-v1','demo-you','demo',0,0,'Start with an empty street') RETURNING event_key").first();
  if(empty)await env.DB.prepare("UPDATE decorations SET x=NULL,z=NULL WHERE user_id='demo-you' AND cost=0 AND id IN ('demo-you:dev-starter-storefront-v1','demo-you:dev-starter-person-v1','demo-you:dev-starter-planter-v1')").run();
  if(gift||empty)await env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1')).fetch('https://neighborhood.internal/invalidate',{method:'POST'});
}
async function unlockedThemes(env:Env,id:string|null):Promise<BuildingTheme[]>{
  if(!id)return DEFAULT_UNLOCKED_THEMES;
  const rows=await env.DB.prepare('SELECT theme FROM theme_unlocks WHERE user_id=? ORDER BY created_at,theme').bind(id).all<{theme:string}>();
  const joins=await env.DB.prepare('SELECT COUNT(DISTINCT r.user_id) count FROM invitation_redemptions r JOIN invitations i ON i.token=r.token JOIN users u ON u.id=r.user_id JOIN buildings b ON b.user_id=r.user_id WHERE i.inviter_id=? AND u.is_demo=0').bind(id).first<{count:number}>();
  return [...new Set([...DEFAULT_UNLOCKED_THEMES,...((joins?.count??0)>=3?['cyberpunk' as BuildingTheme]:[]),...rows.results.map(r=>r.theme).filter((theme):theme is BuildingTheme=>Object.hasOwn(BUILDING_THEMES,theme))])];
}
// Local dev diagnostics may inspect balances. Public snapshots and events cannot.
const visibleBuilding=(env:Env,b:Building,viewer:string|null=null):Building=>
  env.DEV_MODE==='true'||b.id===viewer?b:{...b,bricks:null};
async function broadcast(env: Env, b: Building, extra: Record<string,unknown> = {}) {
  const room = env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1'));
  await room.fetch('https://neighborhood.internal/update', { method: 'POST', body: JSON.stringify({ type: 'building.changed', building:{...b,bricks:null}, ownerBuilding:b, ...extra }) });
}
async function changed(env: Env, id: string, ctx: ExecutionContext, extra: Record<string,unknown> = {}) {
  const b = await building(env, id);
  await broadcast(env,b,extra);
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
interface GithubActor { login:string; databaseId?:number|null }
interface GithubContribution {
  number:number; title:string; mergedAt:string|null; baseRefName:string;
  repository:{nameWithOwner:string}; author:GithubActor|null;
  latestOpinionatedReviews:{nodes:{state:string;author:GithubActor|null}[]};
}
// Calendar layout adapted from kdkasad/website; license in public/licenses/kasad-website.txt.
async function fetchGithubActivity(env: Env, user: User) {
  if (!user.github_token) throw new ApiError('Reconnect GitHub to load activity.',401,'GITHUB_RECONNECT_REQUIRED');
  const response = await fetch('https://api.github.com/graphql', {
    method:'POST', headers:ghHeaders(await unseal(user.github_token,env)),
    body:JSON.stringify({query:`query($login:String!) { user(login:$login) { contributionsCollection { totalCommitContributions contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`,variables:{login:user.username}}),
  });
  if(!response.ok){
    console.warn('GitHub activity request rejected',JSON.stringify({status:response.status,remaining:response.headers.get('x-ratelimit-remaining'),reset:response.headers.get('x-ratelimit-reset')}));
    if(response.status===401){
      // Only clear the rejected token; a simultaneous reconnect may already have replaced it.
      await env.DB.prepare('UPDATE users SET github_token=NULL WHERE id=? AND github_token=?').bind(user.id,user.github_token).run();
      throw new ApiError('GitHub authorization is no longer valid. Reconnect GitHub to resume activity sync.',401,'GITHUB_RECONNECT_REQUIRED');
    }
    if(response.status===429||response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after'))throw new ApiError('GitHub has rate limited activity requests. Try again later.',429);
    if(response.status===403)throw new ApiError('GitHub denied access to activity. Check your GitHub app permissions.',502);
    throw new ApiError(`GitHub activity request failed (HTTP ${response.status}). Try again later.`,502);
  }
  const result=await response.json() as {data?:{user?:{contributionsCollection:{totalCommitContributions:number;contributionCalendar:ContributionCalendar}}};errors?:unknown[]};
  const activity=result.data?.user?.contributionsCollection;
  if(result.errors?.length||!activity||!Array.isArray(activity.contributionCalendar?.weeks))throw new ApiError('GitHub could not return activity. Reconnect your account or try later.',502);
  return activity;
}
async function fetchGithubContributions(env:Env,user:User):Promise<GithubContribution[]> {
  if(!env.GITHUB_REPOSITORY||!env.FOUNDER_GITHUB_ID||!user.github_id||!user.github_token)return [];
  const [owner,name]=env.GITHUB_REPOSITORY.split('/');
  if(!owner||!name)return [];
  const response=await fetch('https://api.github.com/graphql',{
    method:'POST',headers:ghHeaders(await unseal(user.github_token,env)),
    body:JSON.stringify({query:`query($owner:String!,$name:String!,$search:String!){
      repository(owner:$owner,name:$name){defaultBranchRef{name}}
      search(query:$search,type:ISSUE,first:50){nodes{... on PullRequest{
        number title mergedAt baseRefName repository{nameWithOwner}
        author{login ... on User{databaseId}}
        latestOpinionatedReviews(first:50){nodes{state author{login ... on User{databaseId}}}}
      }}}
    }`,variables:{owner,name,search:`repo:${env.GITHUB_REPOSITORY} is:pr is:merged author:${user.username}`}}),
  });
  if(!response.ok)throw new Error(`GitHub contribution request failed (HTTP ${response.status})`);
  const result=await response.json() as {data?:{repository?:{defaultBranchRef?:{name:string}|null};search?:{nodes:(GithubContribution|null)[]}};errors?:unknown[]};
  const defaultBranch=result.data?.repository?.defaultBranchRef?.name;
  if(result.errors?.length||!defaultBranch||!Array.isArray(result.data?.search?.nodes))throw new Error('GitHub did not return contribution data');
  const founderId=Number(env.FOUNDER_GITHUB_ID);
  return result.data.search.nodes.filter((pr):pr is GithubContribution=>Boolean(
    pr&&pr.mergedAt&&pr.baseRefName===defaultBranch&&
    pr.repository.nameWithOwner.toLowerCase()===env.GITHUB_REPOSITORY!.toLowerCase()&&
    pr.author?.databaseId===Number(user.github_id)&&
    pr.latestOpinionatedReviews.nodes.some(review=>review.state==='APPROVED'&&review.author?.databaseId===founderId)
  ));
}
function calendarStatement(env: Env, id: string, calendar: ContributionCalendar) {
  return env.DB.prepare("INSERT INTO github_calendars(user_id,calendar) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET calendar=excluded.calendar,fetched_at=datetime('now')").bind(id,JSON.stringify(calendar));
}
async function syncGithub(env: Env, user: User, automatic=false) {
  if (user.is_demo) throw new ApiError('Demo activity is illustrative. Connect a real GitHub account to sync.');
  if (!user.github_token) throw new ApiError('Reconnect GitHub to resume activity sync.',401,'GITHUB_RECONNECT_REQUIRED');
  const old = await env.DB.prepare('SELECT synced_at FROM metrics WHERE user_id=?').bind(user.id).first<{ synced_at: string | null }>();
  if (old?.synced_at && Date.now() - new Date(old.synced_at.replace(' ', 'T') + 'Z').getTime() < 15 * 60_000) {if(automatic)return;throw new ApiError('Your activity is fresh. You can sync again in 15 minutes.',429);}
  const c = await fetchGithubActivity(env, user);
  const commits = c.totalCommitContributions;
  if(!Number.isSafeInteger(commits)||commits<0)throw new ApiError('GitHub returned an invalid commit count.',502);
  let contributions:GithubContribution[]=[];
  try{contributions=await fetchGithubContributions(env,user);}
  catch(error){console.warn('GitHub contribution sync failed:',String(error));}
  await env.DB.batch([
    calendarStatement(env,user.id,c.contributionCalendar),
    env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description)
      SELECT ?,user_id,'github',eligible*?,eligible*?,'Verified GitHub commits (daily cap)'
      FROM (
        SELECT user_id,MIN(?-credited_commits,MAX(0,?-(
          SELECT COALESCE(SUM(xp),0)/? FROM xp_events
          WHERE user_id=metrics.user_id AND source='github' AND date(created_at)=?
        ))) eligible
        FROM metrics WHERE user_id=? AND synced_at IS NOT NULL AND ?>credited_commits
      ) WHERE eligible>0`)
      .bind(`github-commits:${user.id}:${commits}`,REWARDS.commit,REWARDS.commitBricks,commits,GITHUB_DAILY_COMMIT_LIMIT,REWARDS.commit,DAY(),user.id,commits),
    ...contributions.map(pr=>env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description)
      VALUES(?,?,'contribution',?,0,?)`).bind(
        `github-pr:${pr.repository.nameWithOwner.toLowerCase()}:${pr.number}`,user.id,REWARDS.contribution,
        `Merged C.I.T.I.E.S contribution: #${pr.number} ${pr.title.slice(0,120)}`
      )),
    env.DB.prepare(`UPDATE metrics SET commits=?, credited_commits=MAX(credited_commits, ?),
      synced_at=datetime('now') WHERE user_id=?`).bind(commits, commits, user.id),
  ]);
}

async function join(env: Env, profile: { id: number; login: string; name?: string; bio?: string; avatar_url?: string; html_url?: string; blog?: string }, accessToken: string, invite: string | null) {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE github_id=?').bind(String(profile.id)).first<{ id: string }>();
  const encrypted = await seal(accessToken, env);
  if (existing) {
    await env.DB.prepare(`UPDATE users SET github_token=?, username=?, name=?,
      bio=CASE WHEN bio_customized=1 THEN bio ELSE ? END,
      avatar=CASE WHEN EXISTS(SELECT 1 FROM profile_photos WHERE user_id=users.id) THEN avatar ELSE ? END,
      github_url=CASE WHEN github_url_customized=1 THEN github_url ELSE ? END WHERE id=?`).bind(encrypted, profile.login, profile.name || profile.login, profile.bio || '', profile.avatar_url || null, profile.html_url || null, existing.id).run();
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
  const invitation = invite ? await env.DB.prepare("SELECT i.*, b.x, b.z FROM invitations i JOIN buildings b ON b.user_id=i.inviter_id WHERE i.token=?").bind(invite).first<{ x: number; z: number; inviter_id: string }>() : null;
  // The founding account must be explicitly configured server-side; never open public signups.
  if (!invitation) throw new ApiError(invite?'This invitation is invalid.':'You have not been invited',403,invite?'INVALID_INVITATION':'NOT_INVITED');
  const id = uuid();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id, github_id, username, name, bio, avatar, github_url, website, github_token)
        VALUES((SELECT ? WHERE EXISTS(SELECT 1 FROM invitations WHERE token=?)), ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, invite, String(profile.id), profile.login, profile.name || profile.login, profile.bio || '', profile.avatar_url || null, profile.html_url || null, /^https?:\/\//.test(profile.blog || '') ? profile.blog : null, encrypted),
      env.DB.prepare('INSERT INTO metrics(user_id) VALUES(?)').bind(id),
      env.DB.prepare('INSERT INTO pending_placements(user_id,inviter_id) VALUES(?,?)').bind(id,invitation.inviter_id),
      env.DB.prepare('INSERT INTO invitation_redemptions(token,user_id) VALUES(?,?)').bind(invite,id),
    ]);
    return id;
  } catch(error) {
    const existing=await env.DB.prepare('SELECT id FROM users WHERE github_id=?').bind(String(profile.id)).first<{id:string}>();
    if(existing)return existing.id;
    const valid=await env.DB.prepare("SELECT 1 FROM invitations WHERE token=?").bind(invite).first();
    if(!valid)throw new ApiError('This invitation is invalid. Ask for a new link.',409);
    throw error;
  }
}

async function pendingPlacement(env:Env,userId:string){
  const pending=await env.DB.prepare('SELECT inviter_id FROM pending_placements WHERE user_id=?').bind(userId).first<{inviter_id:string}>();
  if(!pending)return null;
  const origin=await building(env,pending.inviter_id);
  const occupied=new Set((await env.DB.prepare('SELECT x,z FROM buildings WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?')
    .bind(origin.x-48,origin.x+48,origin.z-48,origin.z+48).all<{x:number;z:number}>()).results.map(p=>`${p.x},${p.z}`));
  let options:{x:number;z:number}[]=[];
  for(const radius of [5,12,24,48]){
    const plans=availablePlotPlans(origin,occupied,radius,512);
    const eligible=radius===5?plans.filter(p=>Math.hypot(p.x-origin.x,p.z-origin.z)<=5):plans;
    if(eligible.length){options=eligible.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)).slice(0,8).map(({x,z})=>({x,z}));break;}
  }
  return {origin:visibleBuilding(env,origin,userId),options};
}

export class Neighborhood {
  private snapshots=new Map<string,{expires:number;value:unknown}>();
  private pending=new Map<string,Promise<unknown>>();
  private revision=0;
  constructor(private ctx:DurableObjectState,private env:Env) {}
  async fetch(req:Request){
    const url=new URL(req.url);
    if(url.pathname==='/snapshot'){
      const x=Math.floor(Number(url.searchParams.get('x')||0)/8)*8;
      const z=Math.floor(Number(url.searchParams.get('z')||0)/8)*8;
      const key=`${x},${z}`,cached=this.snapshots.get(key);
      if(cached&&cached.expires>Date.now())return json(cached.value);
      let work=this.pending.get(key);
      if(!work){
        const revision=this.revision;
        work=(async()=>{
          const r=VIEW_RADIUS+8;
          const rows=await this.env.DB.prepare(`${QUERY} WHERE b.x BETWEEN ? AND ? AND b.z BETWEEN ? AND ? ORDER BY ((b.x-?)*(b.x-?)+(b.z-?)*(b.z-?)) LIMIT 250`).bind(x-r,x+r,z-r,z+r,x,x,z,z).all<Building>();
          const value={buildings:rows.results.map(b=>({...b,bricks:null})),projects:await projects(this.env.DB,null)};
          if(this.revision===revision){
            if(this.snapshots.size>=64)this.snapshots.delete(this.snapshots.keys().next().value!);
            this.snapshots.set(key,{expires:Date.now()+30_000,value});
          }
          return value;
        })();
        this.pending.set(key,work);
        work.finally(()=>{if(this.pending.get(key)===work)this.pending.delete(key);}).catch(()=>{});
      }
      return json(await work);
    }
    if(req.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({viewer:req.headers.get('X-Cities-Viewer'),x:0,z:0});
      return new Response(null,{status:101,webSocket:pair[0]});
    }
    if(req.method==='POST'){
      if(url.pathname==='/invalidate'){this.revision++;this.snapshots.clear();this.pending.clear();return new Response('ok');}
      const event=await req.json() as {type:string;building?:Building;ownerBuilding?:Building;project?:{x:number;z:number};[key:string]:unknown};
      this.revision++;this.snapshots.clear();this.pending.clear();
      const {ownerBuilding,...publicEvent}=event;
      for(const ws of this.ctx.getWebSockets()){
        const interest=ws.deserializeAttachment() as {viewer:string|null;x:number;z:number}|null;
        const b=event.building;
        if(b&&b.id!==interest?.viewer&&(Math.abs(b.x-(interest?.x||0))>VIEW_RADIUS+8||Math.abs(b.z-(interest?.z||0))>VIEW_RADIUS+8))continue;
        const payload=b&&b.id===interest?.viewer&&ownerBuilding?{...publicEvent,building:ownerBuilding}:publicEvent;
        try{ws.send(JSON.stringify(payload));}catch{ws.close(1011,'Reconnect to refresh the city.');}
      }
    }
    return new Response('ok');
  }
  webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
    if(message==='ping'){ws.send('pong');return;}
    if(typeof message!=='string'||message.length>256)return;
    try{
      const data=JSON.parse(message);
      if(data.type!=='subscribe'||!Number.isFinite(data.x)||!Number.isFinite(data.z)||Math.abs(data.x)>1e6||Math.abs(data.z)>1e6)return;
      const prior=ws.deserializeAttachment() as {viewer:string|null};
      ws.serializeAttachment({...prior,x:data.x,z:data.z});
    }catch{/* Invalid subscriptions cannot alter identity. */}
  }
  webSocketClose(ws:WebSocket,code:number,reason:string){
    const safeCode=code===1000||code===1001||(code>=3000&&code<=4999)?code:1000;
    try{ws.close(safeCode,reason.slice(0,60));}catch{/* Already closed. */}
  }
  webSocketError(ws:WebSocket){ws.close(1011,'Reconnect to refresh the city.');}
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url), path = url.pathname;
    if(env.DEV_MODE!=='true' && url.hostname.endsWith('.workers.dev') && url.origin!==env.APP_ORIGIN){
      return Response.redirect(new URL(url.pathname+url.search,env.APP_ORIGIN).href,307);
    }
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.get('Origin');
        if (!origin || ![env.APP_ORIGIN, url.origin].includes(origin)) throw new ApiError('Open the city in its own tab before making changes.', 403);
      }
      if (path.startsWith('/api/invites/') && req.method === 'GET') {
        const token = path.slice('/api/invites/'.length);
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(token)) throw new ApiError('This invitation is invalid.', 404);
        const invitation = await env.DB.prepare("SELECT u.name FROM invitations i JOIN users u ON u.id=i.inviter_id WHERE i.token=?").bind(token).first<{name:string}>();
        if (!invitation) throw new ApiError('This invitation is invalid.', 404);
        return json({name:invitation.name});
      }
      if (path.startsWith('/api/profile/avatar/') && ['GET', 'HEAD'].includes(req.method)) {
        const id = path.slice('/api/profile/avatar/'.length);
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new ApiError('Profile picture not found.', 404);
        return await avatarResponse(req, env.DB, id);
      }
      if (path.startsWith('/api/github/calendar/') && req.method === 'GET') {
        const id=path.slice('/api/github/calendar/'.length);
        if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new ApiError('Resident not found.',404);
        const owner=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<User>();
        if(!owner||owner.is_demo)throw new ApiError('Connect a real GitHub account to see activity.',404);
        const cached=await env.DB.prepare('SELECT calendar,fetched_at FROM github_calendars WHERE user_id=?').bind(id).first<{calendar:string;fetched_at:string}>();
        // Scheduled and manual GitHub sync refresh the cached graph.
        if(cached)return json({calendar:JSON.parse(cached.calendar),syncedAt:cached.fetched_at});
        const activity=await fetchGithubActivity(env,owner);
        await calendarStatement(env,id,activity.contributionCalendar).run();
        return json({calendar:activity.contributionCalendar,syncedAt:new Date().toISOString()});
      }
      if(path==='/api/neighborhood'&&req.method==='GET'){
        const x=Number(url.searchParams.get('x')||0),z=Number(url.searchParams.get('z')||0);
        if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>1e6||Math.abs(z)>1e6)throw new ApiError('Choose a valid neighborhood.');
        return env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1')).fetch(`https://neighborhood.internal/snapshot?x=${x}&z=${z}`);
      }
      if(path==='/api/self'&&req.method==='GET'){
        if(env.DEV_MODE==='true')await ensureDemoConnections(env.DB);
        if(localMockEnabled(env.DEV_MODE,new URL(env.APP_ORIGIN).hostname))await ensureDevPlayground(env);
        const user=await currentUser(req,env),placement=user?await pendingPlacement(env,user.id):null;
        const own=user&&!placement?await building(env,user.id):null;
        let nextPlots:{x:number;z:number}[]=[];
        if(own){
          const occupied=await env.DB.prepare('SELECT x,z FROM buildings WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?').bind(own.x-12,own.x+12,own.z-12,own.z+12).all<{x:number;z:number}>();
          nextPlots=previewPlotPlans(own,new Set(occupied.results.map(b=>`${b.x},${b.z}`))).map(({x,z})=>({x,z}));
        }
        const contributions=user?(await env.DB.prepare('SELECT project_id,SUM(amount) amount FROM project_contributions WHERE user_id=? GROUP BY project_id').bind(user.id).all<{project_id:string;amount:number}>()).results:[];
        return json({onboardingCompleted:Boolean(user&&await env.DB.prepare('SELECT 1 FROM xp_events WHERE event_key=?').bind(`onboarding-complete:${user.id}`).first()),own,pendingPlacement:placement,nextPlots,projectContributions:Object.fromEntries(contributions.map(p=>[p.project_id,p.amount])),githubReconnectRequired:Boolean(user&&!user.is_demo&&!user.github_token),me:user?.id??null,demo:env.DEV_MODE==='true',githubConfigured:authReady(env),claimedToday:Boolean(user&&await env.DB.prepare('SELECT 1 FROM daily_claims WHERE user_id=? AND day=?').bind(user.id,DAY()).first()),dailyReward:DAILY_REWARD,inviteRequired:true,likedIds:user?(await env.DB.prepare('SELECT tower_id FROM tower_likes WHERE voter_id=?').bind(user.id).all<{tower_id:string}>()).results.map(l=>l.tower_id):[],unlockedThemes:await unlockedThemes(env,user?.id??null)});
      }
      if (path === '/api/bootstrap' && req.method === 'GET') {
        if(env.DEV_MODE==='true')await ensureDemoConnections(env.DB);
        settleConstruction(env,ctx);
        const user = await currentUser(req, env);
        const placement=user?await pendingPlacement(env,user.id):null;
        // A bounded snapshot of the viewed neighborhood. Client requests another on pan.
        const centerX = Math.max(-1e6, Math.min(1e6, Number(url.searchParams.get('x')) || 0));
        const centerZ = Math.max(-1e6, Math.min(1e6, Number(url.searchParams.get('z')) || 0));
        const rows = await env.DB.prepare(`${QUERY} WHERE b.x BETWEEN ? AND ? AND b.z BETWEEN ? AND ? ORDER BY ((b.x-?)*(b.x-?)+(b.z-?)*(b.z-?)) LIMIT 250`).bind(centerX - VIEW_RADIUS, centerX + VIEW_RADIUS, centerZ - VIEW_RADIUS, centerZ + VIEW_RADIUS, centerX, centerX, centerZ, centerZ).all<Building>();
        if (user && !placement && !rows.results.find(b => b.id === user.id)) rows.results.push(await building(env, user.id));
        if(placement && !rows.results.some(b=>b.id===placement.origin.id))rows.results.push(placement.origin);
        const claimed = user ? await env.DB.prepare('SELECT 1 FROM daily_claims WHERE user_id=? AND day=?').bind(user.id, DAY()).first() : null;
        const own=rows.results.find(b=>b.id===user?.id);
        let nextPlots:{x:number;z:number}[]=[];
        if(own){
          // Availability must include every occupied slot, even beyond the render limit.
          const occupied=await env.DB.prepare('SELECT x,z FROM buildings WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?')
            .bind(own.x-12,own.x+12,own.z-12,own.z+12).all<{x:number;z:number}>();
          nextPlots=previewPlotPlans(own,new Set(occupied.results.map(b=>`${b.x},${b.z}`))).map(({x,z})=>({x,z}));
        }
        return json({ githubReconnectRequired:Boolean(user&&!user.is_demo&&!user.github_token), pendingPlacement:placement, buildings: rows.results.map(b=>visibleBuilding(env,b,user?.id??null)), nextPlots, projects:await projects(env.DB,user?.id??null), likedIds:user?(await env.DB.prepare('SELECT tower_id FROM tower_likes WHERE voter_id=?').bind(user.id).all<{tower_id:string}>()).results.map(l=>l.tower_id):[], unlockedThemes:await unlockedThemes(env,user?.id??null), me: user?.id ?? null, demo: env.DEV_MODE === 'true', githubConfigured: authReady(env), claimedToday: Boolean(claimed), dailyReward: DAILY_REWARD, inviteRequired: true });
      }
      if (path === '/api/dev/start' && req.method === 'POST') {
        if (env.DEV_MODE !== 'true') throw new ApiError('Demo mode is not enabled.', 404);
        const batch = Number(url.searchParams.get('batch') ?? 0);
        if (![0, 1, 2].includes(batch)) throw new ApiError('Choose a valid demo batch.');
        const statements = await seedDemo(env.DB);
        await env.DB.batch(statements.slice(batch * 21, (batch + 1) * 21));
        if(batch===2)await ensureDemoConnections(env.DB);
        await env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1')).fetch('https://neighborhood.internal/invalidate',{method:'POST'});
        return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': await session(req, env, 'demo-you') } });
      }
      if (path === '/api/dev/join' && req.method === 'POST') {
        if (env.DEV_MODE !== 'true') throw new ApiError('Demo mode is not enabled.', 404);
        const user = await requireUser(req, env);
        const data = await body(req); const invite = typeof data.invite === 'string' ? data.invite : '';
        const invitation = await env.DB.prepare("SELECT i.*,b.x,b.z FROM invitations i JOIN buildings b ON b.user_id=i.inviter_id WHERE token=? AND inviter_id=?").bind(invite, user.id).first<{ x: number; z: number }>();
        if (!invitation) throw new ApiError('Choose an invitation you created.', 409);
        const id = `demo-${uuid()}`, username = `neighbor-${id.slice(-6)}`;
        const taken = new Set((await env.DB.prepare('SELECT x,z FROM buildings').all<{ x: number; z: number }>()).results.map(b => `${b.x},${b.z}`));
        const plannedSlots=availablePlotPlans(invitation,taken);
        for (const {x,z} of plannedSlots) {
          try {
            await env.DB.batch([
              env.DB.prepare(`INSERT INTO users(id,username,name,bio,is_demo) VALUES((SELECT ? WHERE EXISTS(SELECT 1 FROM invitations WHERE token=?)), ?, 'New neighbor', 'A new idea has moved into the neighborhood.', 1)`).bind(id, invite, username),
              env.DB.prepare('INSERT INTO buildings(user_id,x,z,bricks) VALUES(?,?,?,0)').bind(id, x, z),
              env.DB.prepare('INSERT INTO metrics(user_id) VALUES(?)').bind(id),
              env.DB.prepare('INSERT INTO invitation_redemptions(token,user_id) VALUES(?,?)').bind(invite,id),
          env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT ?,i.inviter_id,'invite',?,0,'An invited resident joined' FROM invitations i JOIN invitation_redemptions r ON r.token=i.token WHERE i.token=? AND r.user_id=?`).bind(`invite:${id}`,REWARDS.invite,invite,id),
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
        if(localMockEnabled(env.DEV_MODE,new URL(env.APP_ORIGIN).hostname)){
          const statements=await seedDemo(env.DB);await env.DB.batch(statements.slice(0,21));await ensureDevPlayground(env);
          return new Response(null,{status:302,headers:{...headers,Location:env.APP_ORIGIN,'Set-Cookie':await session(req,env,'demo-you')}});
        }
        if (!authReady(env)) throw new ApiError('GitHub login needs server credentials. See the local setup guide.', 503);
        const invite = url.searchParams.get('invite');
        if (invite && !await env.DB.prepare("SELECT token FROM invitations WHERE token=?").bind(invite).first()) throw new ApiError('This invitation is invalid.', 403);
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
        const pending=await env.DB.prepare('SELECT 1 FROM pending_placements WHERE user_id=?').bind(id).first();
        if(!pending){
          const joined=await changed(env,id,ctx);
          if(joined.invited_by)await changed(env,joined.invited_by,ctx);
          const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<User>();
          if(user)ctx.waitUntil(syncGithub(env,user).then(async()=>broadcast(env,await building(env,id))).catch(e=>console.warn('GitHub initial sync failed:',String(e))).finally(()=>settleConstruction(env,ctx)));
        }
        const h = new Headers({ Location: env.APP_ORIGIN, ...headers });
        h.append('Set-Cookie', await session(req, env, id)); h.append('Set-Cookie', cookie(req, 'cities_oauth', '', 0));
        return new Response(null, { status: 302, headers: h });
      }
      if (path === '/api/live' && req.method === 'GET') {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new ApiError('A WebSocket connection is required.', 426);
        if (![env.APP_ORIGIN, url.origin].includes(req.headers.get('Origin') || '')) throw new ApiError('Connection origin is not allowed.', 403);
        const viewer=await currentUser(req,env);
        const h=new Headers(req.headers);h.delete('X-Cities-Viewer');
        if(viewer)h.set('X-Cities-Viewer',viewer.id);
        return env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1')).fetch(new Request(req,{headers:h}));
      }
      const user = await requireUser(req, env);
      if(path==='/api/placement' && req.method==='POST'){
        const data=await body(req);
        if(!Number.isInteger(data.x)||!Number.isInteger(data.z))throw new ApiError('Select an available plot.');
        const placement=await pendingPlacement(env,user.id);
        if(!placement)return json({building:await building(env,user.id)});
        if(!placement.options.some(p=>p.x===data.x&&p.z===data.z))throw new ApiError('That plot is no longer available. Choose another hologram.',409);
        try{
          await env.DB.batch([
            env.DB.prepare('INSERT INTO buildings(user_id,x,z) SELECT user_id,?,? FROM pending_placements WHERE user_id=?').bind(data.x as number,data.z as number,user.id),
            env.DB.prepare(`INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) SELECT ?,inviter_id,'invite',?,0,'An invited resident joined' FROM pending_placements WHERE user_id=?`).bind(`invite:${user.id}`,REWARDS.invite,user.id),
            env.DB.prepare('DELETE FROM pending_placements WHERE user_id=?').bind(user.id),
          ]);
        }catch(error){
          if(String(error).includes('UNIQUE'))throw new ApiError('That plot was just taken. Choose another hologram.',409);
          throw error;
        }
        const placed=await changed(env,user.id,ctx);await changed(env,placement.origin.id,ctx);settleConstruction(env,ctx);
        ctx.waitUntil(syncGithub(env,user).then(async()=>broadcast(env,await building(env,user.id))).catch(e=>console.warn('GitHub initial sync failed:',String(e))));
        return json({building:placed});
      }
      if(await env.DB.prepare('SELECT 1 FROM pending_placements WHERE user_id=?').bind(user.id).first())throw new ApiError('Choose your tower location first.',409);
      if(path==='/api/me'&&req.method==='GET')return json({building:await building(env,user.id)});
      if (path === '/api/profile' && req.method === 'POST') {
        const data = await body(req);
        if (typeof data.bio !== 'string' || data.bio.length > BIO_MAX_LENGTH) throw new ApiError(`Keep your bio within ${BIO_MAX_LENGTH} characters.`);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET bio=?,bio_customized=1 WHERE id=?').bind(data.bio.trim(), user.id),
          env.DB.prepare("UPDATE buildings SET updated_at=datetime('now') WHERE user_id=?").bind(user.id),
        ]);
        return json({ building: await changed(env, user.id, ctx) });
      }
      if (path === '/api/profile/links' && req.method === 'POST') {
        const data = await body(req);
        const link = (key: string, host?: string) => {
          const value = data[key];
          if (typeof value !== 'string' || value.length > 2048) throw new ApiError('Enter a valid profile link.');
          if (!value.trim()) return null;
          let url: URL;
          try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); }
          catch { throw new ApiError('Enter a valid website address.'); }
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (host && url.hostname !== host && !url.hostname.endsWith(`.${host}`))) throw new ApiError(`Enter a valid ${host || 'website'} link.`);
          return url.href;
        };
        const linkedin = link('linkedin_url', 'linkedin.com'), github = link('github_url', 'github.com'), website = link('website');
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET linkedin_url=?,github_url=?,website=?,github_url_customized=1 WHERE id=?').bind(linkedin, github, website, user.id),
          env.DB.prepare("UPDATE buildings SET updated_at=datetime('now') WHERE user_id=?").bind(user.id),
        ]);
        return json({ building: await changed(env, user.id, ctx) });
      }
      if (path === '/api/profile/avatar' && req.method === 'POST') {
        await saveAvatar(req, env.DB, user.id);
        return json({ building: await changed(env, user.id, ctx) });
      }
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
      if(path==='/api/onboarding/gift'&&req.method==='POST'){
        const gift=await env.DB.prepare("INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES(?,?,'onboarding',0,100,'Welcome gift') RETURNING event_key").bind(`onboarding-gift:${user.id}`,user.id).first();
        return json({building:await changed(env,user.id,ctx),awarded:gift?100:0});
      }
      if(path==='/api/onboarding/complete'&&req.method==='POST'){
        await env.DB.prepare("INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES(?,?,'onboarding',0,0,'Onboarding completed')").bind(`onboarding-complete:${user.id}`,user.id).run();
        return json({ok:true});
      }
      if((path==='/api/decorations/purchase'||path==='/api/decorations/move')&&req.method==='POST'){
        const data=await body(req),own=await building(env,user.id),purchase=path.endsWith('/purchase');
        const requestId=typeof data.requestId==='string'?data.requestId:'';
        const id=purchase?`${user.id}:${requestId}`:typeof data.id==='string'?data.id:'';
        const existing=purchase?await env.DB.prepare('SELECT kind,request_data FROM decorations WHERE id=? AND user_id=?').bind(id,user.id).first<{kind:string;request_data:string}>():decorationsOf(own).find(item=>item.id===id);
        if(purchase&&!/^[a-zA-Z0-9-]{16,64}$/.test(requestId))throw new ApiError('Choose a valid purchase request.');
        if(!purchase&&!existing)throw new ApiError('This decoration does not belong to you.',404);
        const kind=purchase?data.kind:existing!.kind;
        if(!isDecorationKind(kind))throw new ApiError('Choose an available decoration.');
        const stored=!purchase&&data.x===null&&data.z===null;
        const rotation=data.rotation,x=data.x,z=data.z;
        if(typeof rotation!=='number'||!Number.isInteger(rotation)||rotation<0||rotation>3||!stored&&(typeof x!=='number'||typeof z!=='number'||!Number.isFinite(x)||!Number.isFinite(z)))throw new ApiError('Choose a valid decoration position.');
        const requestData=JSON.stringify({kind,x,z,rotation});
        if(purchase&&existing){
          if('request_data' in existing&&existing.request_data===requestData)return json({building:await changed(env,user.id,ctx)});
          throw new ApiError('This purchase already completed. Refresh your decorations before buying another.',409);
        }
        if(!stored){const error=placementError(own,kind,{x:x as number,z:z as number,rotation},purchase?undefined:id);if(error)throw new ApiError(error,409);}
        try{
          const guard='user_id=? AND decorations_version=? AND level=? AND x=? AND z=?';
          const result=purchase?await env.DB.prepare(`INSERT INTO decorations(id,user_id,kind,cost,request_data,x,z,rotation)
            SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM buildings WHERE ${guard}) RETURNING id`)
            .bind(id,user.id,kind,DECORATIONS[kind].cost,requestData,x,z,rotation,user.id,own.decorations_version??0,own.level,own.x,own.z).first():
            await env.DB.prepare(`UPDATE decorations SET x=?,z=?,rotation=? WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM buildings WHERE ${guard}) RETURNING id`)
            .bind(x,z,rotation,id,user.id,user.id,own.decorations_version??0,own.level,own.x,own.z).first();
          if(!result){
            const prior=purchase?await env.DB.prepare('SELECT request_data FROM decorations WHERE id=? AND user_id=?').bind(id,user.id).first<{request_data:string}>():null;
            if(prior?.request_data===requestData)return json({building:await changed(env,user.id,ctx)});
            throw new ApiError('Your garden changed while you were placing this. Try again.',409);
          }
        }catch(error){
          const message=String(error);
          if(message.includes('not enough bricks'))throw new ApiError(`You need ${DECORATIONS[kind].cost} bricks for this decoration.`,409);
          if(message.includes('decoration limit'))throw new ApiError('Your collection holds up to 24 decorations. Move or store one you already own.',409);
          if(message.includes('UNIQUE')){
            const prior=await env.DB.prepare('SELECT request_data FROM decorations WHERE id=? AND user_id=?').bind(id,user.id).first<{request_data:string}>();
            if(prior?.request_data===requestData)return json({building:await changed(env,user.id,ctx)});
            throw new ApiError('This purchase already completed. Refresh your decorations.',409);
          }
          throw error;
        }
        return json({building:await changed(env,user.id,ctx)});
      }
      if(path==='/api/themes/unlock'&&req.method==='POST'){
        const data=await body(req),theme=typeof data.theme==='string'?data.theme:'';
        if(!Object.hasOwn(BUILDING_THEMES,theme)||theme==='contemporary')throw new ApiError('Choose a purchasable architectural theme.');
        if(theme==='cyberpunk')throw new ApiError('Invite three residents to unlock Cyberpunk.',403);
        const definition=BUILDING_THEMES[theme as BuildingTheme];
        try{
          await env.DB.prepare('INSERT INTO theme_unlocks(user_id,theme,cost) VALUES(?,?,?)').bind(user.id,theme,definition.cost).run();
        }catch(e){
          const message=String(e);
          if(message.includes('UNIQUE'))throw new ApiError('You already unlocked this theme.',409);
          if(message.includes('not enough bricks'))throw new ApiError(`You need ${definition.cost} bricks to unlock ${definition.label}.`,409);
          throw e;
        }
        return json({building:await changed(env,user.id,ctx),unlockedThemes:await unlockedThemes(env,user.id)});
      }
      if(path==='/api/segments'&&req.method==='POST'){
        const data=await body(req),index=Number(data.segment);
        if(!Number.isInteger(index)||index<0||index>=TIERS.length||typeof data.color!=='string'||!Object.hasOwn(COLORS,data.color)||typeof data.style!=='string'||!Object.hasOwn(SEGMENT_STYLES,data.style))throw new ApiError('Choose a valid segment design.');
        const theme=data.theme??'contemporary';
        if(typeof theme!=='string'||!Object.hasOwn(BUILDING_THEMES,theme))throw new ApiError('Choose an available architectural theme.');
        if(!(await unlockedThemes(env,user.id)).includes(theme as BuildingTheme))throw new ApiError('Unlock this architectural theme before applying it.',403);
        const design=JSON.stringify({color:data.color,style:data.style,theme});
        const result=await env.DB.prepare(`UPDATE buildings SET segments=json_set(segments,?,json(?)),updated_at=datetime('now')
          WHERE user_id=? AND level>=? AND (COALESCE(json_extract(segments,?),color)<>?
            OR COALESCE(json_extract(segments,?),CASE WHEN style='modern' OR level>=19 THEN 'glass' ELSE 'classic' END)<>?
            OR COALESCE(json_extract(segments,?),'contemporary')<>?) RETURNING user_id`)
          .bind(`$[${index}]`,design,user.id,tierStartLevel(index),`$[${index}].color`,data.color,`$[${index}].style`,data.style,`$[${index}].theme`,theme).first();
        if(!result)throw new ApiError('That segment is locked or that design is already selected.',409);
        return json({building:await changed(env,user.id,ctx)});
      }
      if(path==='/api/like'&&req.method==='POST'){
        const data=await body(req),target=typeof data.tower==='string'?data.tower:'';
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
        const own=await building(env,user.id);
        if(!canContributeToProject(own,project))throw new ApiError('This project is outside your neighborhood.');
        const id=`${user.id}:${requestId}`;
        const receipt=await env.DB.prepare('INSERT OR IGNORE INTO project_contributions(id,project_id,user_id,amount) SELECT ?,?,?,? WHERE (SELECT bricks FROM buildings WHERE user_id=?)>=? AND (SELECT funded+?<=goal FROM public_projects WHERE id=?) RETURNING id')
          .bind(id,project.id,user.id,amount,user.id,amount,amount,project.id).first();
        if(!receipt){
          const prior=await env.DB.prepare('SELECT project_id,amount FROM project_contributions WHERE id=?').bind(id).first<{project_id:string;amount:number}>();
          if(!prior||prior.project_id!==project.id||prior.amount!==amount)throw new ApiError('Check your bricks and the project’s remaining goal.',409);
        }
        const updated=(await projects(env.DB,user.id)).find(p=>p.id===project.id)!;
        const message={type:'project.changed',project:{...updated,myContribution:0}};
        await env.NEIGHBORHOODS.get(env.NEIGHBORHOODS.idFromName('city-hub-v1')).fetch('https://neighborhood.internal/update',{method:'POST',body:JSON.stringify(message)});
        settleConstruction(env,ctx);return json({project:updated,building:await changed(env,user.id,ctx)});
      }
      // Explicit fixture action: normal bootstrap keeps every new street empty.
      if((path==='/api/dev/neighborhood-examples'||path==='/api/dev/neighborhood-populate')&&req.method==='POST'){
        if(!localMockEnabled(env.DEV_MODE,new URL(env.APP_ORIGIN).hostname)||!user.is_demo)throw new ApiError('Dev tools are local only.',404);
        const dense=path==='/api/dev/neighborhood-populate';
        const targets=dense?await env.DB.prepare(`${QUERY} WHERE u.is_demo=1 ORDER BY b.x*b.x+b.z*b.z,u.id LIMIT 24`).all<Building>():await env.DB.prepare(`${QUERY} WHERE u.is_demo=1 AND u.id<>? AND u.id<>'demo-you' AND b.level>=10 ORDER BY b.x*b.x+b.z*b.z,u.id LIMIT 4`).bind(user.id).all<Building>();
        const seeded:{id:string;name:string;items:number}[]=[];
        for(const target of targets.results){
          const marker=`${dense?'dev-dense-ground-v2':'dev-neighborhood-examples-v1'}:${target.id}`;
          if(await env.DB.prepare('SELECT 1 FROM xp_events WHERE event_key=?').bind(marker).first()){await broadcast(env,target);continue;}
          const items=dense?denseDemoPurchasePlan(target,targets.results):demoPurchasePlan(target,targets.results);
          if(!items.length)continue;
          // Credit fixture spending, then use the real purchase triggers and prices.
          await env.DB.batch([
            env.DB.prepare("INSERT OR IGNORE INTO xp_events(event_key,user_id,source,xp,bricks,description) VALUES(?,?,'demo',0,?,'Example neighborhood purchase budget')").bind(marker,target.id,items.reduce((sum,item)=>sum+DECORATIONS[item.kind].cost,0)),
            ...items.map(item=>env.DB.prepare('INSERT INTO decorations(id,user_id,kind,cost,request_data,x,z,rotation) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM decorations WHERE id=?)').bind(item.id,target.id,item.kind,DECORATIONS[item.kind].cost,JSON.stringify({kind:item.kind,x:item.x,z:item.z,rotation:item.rotation}),item.x,item.z,item.rotation,item.id)),
          ]);
          await changed(env,target.id,ctx);
          seeded.push({id:target.id,name:target.name,items:items.length});
        }
        return json({seeded,items:seeded.reduce((sum,resident)=>sum+resident.items,0)});
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
          const samples:Record<string,[number,number]>={github:[REWARDS.commit,REWARDS.commitBricks],invite:[REWARDS.invite,0],like:[REWARDS.like,0],construction:[REWARDS.construction,0],project:[REWARDS.project,0],daily:[REWARDS.dailyXp,REWARDS.dailyBricks],bricks:[0,100]};
          const sample=samples[source];if(!sample)throw new ApiError('Choose a sample reward.');
          const amount=source==='bricks'&&data.amount!==undefined?Number(data.amount):sample[1];
          if(!Number.isSafeInteger(amount)||amount<0||amount>1_000_000)throw new ApiError('Choose a valid dev brick amount.');
          const requestId=typeof data.requestId==='string'&&/^[a-zA-Z0-9-]{16,64}$/.test(data.requestId)?data.requestId:uuid();
          await reward(env.DB,`demo:${requestId}`,target,'demo',sample[0],amount,`Simulated ${source} reward`);

          settleConstruction(env,ctx);
        }
        return json({building:await changed(env,target,ctx)});
      }
      if (path === '/api/sync' && req.method === 'POST') {
        const data=await body(req);await syncGithub(env,user,data.automatic===true);settleConstruction(env,ctx); return json({ building: await changed(env, user.id, ctx) });
      }
      if (path === '/api/invites' && req.method === 'GET') {
        return json({ invites: (await env.DB.prepare("SELECT i.token,i.created_at,(SELECT COUNT(*) FROM invitation_redemptions r WHERE r.token=i.token) use_count FROM invitations i WHERE inviter_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(user.id).all()).results });
      }
      if (path === '/api/invites' && req.method === 'POST') {
        await env.DB.prepare("INSERT INTO invitations(token,inviter_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM invitations WHERE inviter_id=?)").bind(uuid(),user.id,user.id).run();
        const invitation=await env.DB.prepare('SELECT i.token,i.created_at,(SELECT COUNT(*) FROM invitation_redemptions r WHERE r.token=i.token) use_count FROM invitations i WHERE inviter_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(user.id).first<{token:string;created_at:string;use_count:number}>();
        if(!invitation)throw new ApiError('Could not create an invitation. Try again.',500);
        const token=invitation.token;
        return json({ token, invitation, url: `${env.APP_ORIGIN}/?invite=${token}` });
      }
      throw new ApiError('This route could not be found.', 404);
    } catch (e) {
      if (path === '/api/auth/github' || path === '/api/auth/github/callback') {
        const dest = new URL(env.APP_ORIGIN);
        dest.searchParams.set('auth_error', e instanceof ApiError ? e.message : 'GitHub login could not be completed. Try again.');
        if(e instanceof ApiError&&e.code)dest.searchParams.set('auth_error_code',e.code);
        return new Response(null,{status:302,headers:{Location:dest.toString(),...headers}});
      }
      if (e instanceof ApiError) return json({ error:e.message, code:e.code },e.status);
      if (e instanceof PhotoError) return json({ error:e.message },e.status);
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
    const users = await env.DB.prepare(`SELECT u.* FROM users u JOIN metrics m ON m.user_id=u.id JOIN buildings b ON b.user_id=u.id WHERE u.is_demo=0 AND u.github_token IS NOT NULL
      AND (m.synced_at IS NULL OR m.synced_at<datetime('now','-15 minutes')) ORDER BY m.synced_at`).all<User>();
    ctx.waitUntil((async()=>{
      for(let offset=0;offset<users.results.length;offset+=10){
        await Promise.all(users.results.slice(offset,offset+10).map(user=>syncGithub(env,user,true)
          .then(async()=>broadcast(env,await building(env,user.id)))
          .catch(e=>console.warn('Scheduled GitHub sync failed:',String(e)))));
      }
      settleConstruction(env,ctx);
    })());

  },
} satisfies ExportedHandler<Env>;
