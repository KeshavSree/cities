import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { inviteLogin } from '../src/inviteLogin';
import worker from '../worker/index';

const data=new Map<string,string>();
const storage=()=>({getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}});
let login=inviteLogin('?invite=reusable',storage);
assert.equal(login.url(),'/api/auth/github?invite=reusable','Dismissal does not discard the invitation used by ordinary sign-in');
login=inviteLogin('?auth_error=The+login+expired',storage);
assert.equal(login.token,'reusable','OAuth error redirects without invite restore pending context');
assert.equal(login.url(),'/api/auth/github?invite=reusable','Retry creates a new OAuth attempt with the invite');
assert.equal(login.url(true),'/api/auth/github','Reconnect never carries signup context');
assert.equal(inviteLogin('?invite=replacement',storage).token,'replacement','A new explicit link replaces older context');
assert.equal(inviteLogin('?invite=%3Cbad%3E',storage).token,'','Malformed links clear stale context');
assert.equal(inviteLogin('',storage).token,'');
login=inviteLogin('?invite=reusable',storage);login.clear();
assert.equal(login.url(),'/api/auth/github');assert.equal(inviteLogin('',storage).token,'','Successful/invalid context stays cleared across reload');
inviteLogin('?invite=reusable',storage);
assert.equal(inviteLogin('?auth_error_code=INVALID_INVITATION',storage).token,'');
const unavailable=()=>{throw new Error('Storage disabled');};
assert.equal(inviteLogin('?invite=reusable',unavailable).url(),'/api/auth/github?invite=reusable');
assert.equal(inviteLogin('',unavailable).url(),'/api/auth/github');

// Execute the real Worker routes with real migrated SQLite, adapting only D1's API.
const db=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${file}`,'utf8'));
function prepare(sql:string){let values:any[]=[];return {
  bind(...args:any[]){values=args;return this;},
  async first(){return db.prepare(sql).get(...values)||null;},
  async all(){return {results:db.prepare(sql).all(...values)};},
  async run(){const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};},
};}
const env:any={APP_ORIGIN:'https://city.test',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',TOKEN_ENCRYPTION_KEY:btoa('x'.repeat(32)),DB:{prepare,async batch(statements:any[]){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},NEIGHBORHOODS:{idFromName:()=>'',get:()=>({fetch:async()=>new Response('{}')})}};
db.exec("INSERT INTO users(id,github_id,username,name) VALUES('host','1','host','Host'); INSERT INTO buildings(user_id,x,z) VALUES('host',0,0); INSERT INTO invitations(token,inviter_id,created_at) VALUES('reusable','host','2000-01-01')");
const ctx:any={waitUntil:(p:Promise<unknown>)=>p.catch(()=>{})};
const request=(path:string,cookie='')=>worker.fetch(new Request(env.APP_ORIGIN+path,{headers:{Cookie:cookie}}),env,ctx);
let profileId=2,exchangeFails=false,fetchCalls=0,lastExchange:any;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input:any,init:any)=>{
  fetchCalls++;
  if(String(input)==='https://github.com/login/oauth/access_token'){
    lastExchange=JSON.parse(init.body);return Response.json(exchangeFails?{error:'bad_verification_code'}:{access_token:'test-access-token'},{status:exchangeFails?400:200});
  }
  if(String(input)==='https://api.github.com/user')return Response.json({id:profileId,login:`user${profileId}`,name:`User ${profileId}`});
  return Response.json({});
};
async function start(path='/api/auth/github?invite=reusable'){
  const res=await request(path);assert.equal(res.status,302);
  const dest=new URL(res.headers.get('Location')!);assert.equal(dest.origin,'https://github.com');
  const state=dest.searchParams.get('state')!;
  const row:any=db.prepare('SELECT * FROM oauth_states WHERE state=?').get(state);
  assert(row);const remaining=row.expires_at-Math.floor(Date.now()/1000);assert(remaining>=599&&remaining<=600,'OAuth attempts expire after ten minutes');
  assert.match(res.headers.get('Set-Cookie')!,/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.code_verifier))).toString('base64url');
  assert.equal(dest.searchParams.get('code_challenge'),digest);assert.equal(dest.searchParams.get('code_challenge_method'),'S256');
  return {state,row,cookie:`cities_oauth=${state}`};
}
const callback=(a:Awaited<ReturnType<typeof start>>,cookie=a.cookie)=>request(`/api/auth/github/callback?state=${a.state}&code=test-code`,cookie);
const error=(res:Response)=>new URL(res.headers.get('Location')!).searchParams;
try{
  assert.equal((await request('/api/invites/reusable')).status,200,'Old invitations remain valid');
  assert.equal((await request('/api/invites/missing')).status,404);
  const invalid=await request('/api/auth/github?invite=missing');assert(error(invalid).has('auth_error'));
  assert.equal(db.prepare('SELECT count(*) n FROM oauth_states').get()!.n,0);
  let a=await start();const before=fetchCalls;
  assert(error(await callback(a,'cities_oauth=wrong')).has('auth_error'));assert.equal(fetchCalls,before,'Mismatched state never exchanges a token');
  assert(error(await callback(a,'')).has('auth_error'));assert.equal(fetchCalls,before,'Missing cookie never exchanges a token');
  db.prepare('UPDATE oauth_states SET expires_at=? WHERE state=?').run(Math.floor(Date.now()/1000)-1,a.state);
  const expired=await callback(a);assert(error(expired).has('auth_error'));assert.equal(fetchCalls,before,'Expired state never exchanges a token');
  login=inviteLogin('?invite=reusable',storage);
  login=inviteLogin(new URL(expired.headers.get('Location')!).search,storage);
  a=await start(login.url());assert.equal(a.row.invite,'reusable');
  exchangeFails=true;assert(error(await callback(a)).has('auth_error'));
  assert.equal(db.prepare('SELECT state FROM oauth_states WHERE state=?').get(a.state),undefined,'Failed exchange consumes state');
  exchangeFails=false;a=await start(login.url());
  const success=await callback(a);assert.equal(success.headers.get('Location'),env.APP_ORIGIN);assert.match(success.headers.get('Set-Cookie')!,/cities_session=/);
  assert.equal(lastExchange.code_verifier,a.row.code_verifier,'Exchange uses the stored PKCE verifier');
  assert.equal(db.prepare('SELECT count(*) n FROM invitation_redemptions').get()!.n,1);
  const calls=fetchCalls;assert(error(await callback(a)).has('auth_error'));assert.equal(fetchCalls,calls,'Consumed state cannot be replayed');
  a=await start('/api/auth/github');assert.equal(a.row.invite,null);assert.equal((await callback(a)).headers.get('Location'),env.APP_ORIGIN,'Existing users can sign in without invitation');
  assert.equal(db.prepare('SELECT count(*) n FROM invitation_redemptions').get()!.n,1,'Returning users do not redeem twice');
  profileId=3;a=await start();assert.equal((await callback(a)).headers.get('Location'),env.APP_ORIGIN);
  assert.equal(db.prepare('SELECT count(*) n FROM invitation_redemptions').get()!.n,2,'Same permanent invite admits a second user');
  profileId=4;a=await start('/api/auth/github');assert.equal(error(await callback(a)).get('auth_error_code'),'NOT_INVITED','New users cannot join without invitation');
  db.exec("INSERT INTO invitations(token,inviter_id) VALUES('revoked','host')");
  a=await start('/api/auth/github?invite=revoked');db.exec("DELETE FROM invitations WHERE token='revoked'");
  assert.equal(error(await callback(a)).get('auth_error_code'),'INVALID_INVITATION','Admission revalidates a revoked invite after OAuth');
  assert.equal(db.prepare("SELECT id FROM users WHERE github_id='4'").get(),undefined);
  console.log('Auth checks passed: retry context, storage failures, reusable invites, admission, existing users, timeout, state/cookie binding, PKCE, exchange failure and replay.');
}finally{globalThis.fetch=originalFetch;db.close();}
