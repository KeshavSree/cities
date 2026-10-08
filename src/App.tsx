import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, ArrowUpRight, Bug, Check, Compass, Copy, Gift, Hammer, HelpCircle, Layers, Leaf, LoaderCircle, LocateFixed, LogOut, MapPin, Minus, Plus, Search, Sparkles, Users, X } from 'lucide-react';
import type { SceneHandle } from './CityScene';
import { api } from './api';
import { COLORS, STYLES, COLOR_COST, STYLE_COST, upgradeCost, type Bootstrap, type Building, type Color, type Style } from '../shared/types';
import { VIEW_RADIUS } from '../shared/world';
import { lightingAt } from './lighting';
import { TowerDrawer } from './TowerDrawer';
import { CityMap } from './CityMap';
import { ScoreBreakdown } from './ScoreBreakdown';
import { neighborhoodScores } from './neighborhood';

type Modal = 'invite' | 'help' | 'login' | null;
const CityScene = lazy(()=>import('./CityScene').then(m=>({default:m.CityScene})));
type Invite = { token: string; created_at: string; used_by: string | null };
let initialization: Promise<Bootstrap> | null = null;
function initialize() {
  return initialization ??= (async () => {
    let snapshot = await api<Bootstrap>('/bootstrap');
    if (snapshot.demo && !snapshot.buildings.length) {
      for (let batch = 0; batch < 3; batch++) await api(`/dev/start?batch=${batch}`, {});
      snapshot = await api<Bootstrap>('/bootstrap');
    }
    return snapshot;
  })().catch(e => { initialization = null; throw e; });
}
const compact = (n: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function App() {
  const [snapshot, setSnapshot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [lighting, setLighting] = useState(()=>lightingAt(new Date()));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'overview' | 'design'>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [center, setCenter] = useState({ x: 0, z: 0 });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState('');
  const [debugScores,setDebugScores]=useState(()=>{try{return localStorage.getItem('cities-dev-scores')==='true';}catch{return false;}});
  const [drawerOpen, setDrawerOpen] = useState(()=>window.innerWidth>760);
  const scene = useRef<SceneHandle>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestCenter = useRef(center); latestCenter.current = center;
  const snapshotRequest = useRef(0);
  const notify = useCallback((text: string, isError = false) => {
    clearTimeout(toastTimer.current); setToast({ text, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 6500 : 3800);
  }, []);
  const load = useCallback(async () => {
    const request = ++snapshotRequest.current;
    const {x,z} = latestCenter.current;
    const value = await api<Bootstrap>(`/bootstrap?x=${x}&z=${z}`);
    if (request !== snapshotRequest.current) return;
    setSnapshot(value); setSelected(prev=>prev && value.buildings.some(b=>b.id===prev) ? prev : value.me || value.buildings[0]?.id || null);
  }, []);
  useEffect(()=>{
    let active=true;
    initialize().then(value=>{if(active){setSnapshot(value);setSelected(value.me || value.buildings[0]?.id || null);const params=new URLSearchParams(location.search);if(params.has('invite')||params.has('auth_error'))setModal('login');if(params.has('auth_error'))notify(params.get('auth_error')!,true);}}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[notify]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  useEffect(()=>{
    const refresh=()=>setLighting(lightingAt(new Date()));
    const timer=setInterval(refresh,30_000);
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{ if (snapshot) load().catch(e=>notify(e.message,true)); },[center.x,center.z,load,notify]);
  const update = useCallback((building: Building) => {
    setSnapshot(prev=>{
      if(!prev)return prev;
      const exists=prev.buildings.some(b=>b.id===building.id);
      if(!exists&&building.id!==prev.me&&(Math.abs(building.x-latestCenter.current.x)>VIEW_RADIUS||Math.abs(building.z-latestCenter.current.z)>VIEW_RADIUS))return prev;
      return {...prev,buildings:exists?prev.buildings.map(b=>b.id===building.id?building:b):[...prev.buildings,building]};
    });
  }, []);
  const ready = Boolean(snapshot);
  const roomNames=new Set<string>();
  const roomX=Math.floor(center.x/8),roomZ=Math.floor(center.z/8);
  for(let x=roomX-1;x<=roomX+1;x++)for(let z=roomZ-1;z<=roomZ+1;z++)roomNames.add(`${x},${z}`);
  for(const b of snapshot?.buildings||[])if(Math.abs(b.x-center.x)<=VIEW_RADIUS&&Math.abs(b.z-center.z)<=VIEW_RADIUS)roomNames.add(`${Math.floor(b.x/8)},${Math.floor(b.z/8)}`);
  const roomKey=[...roomNames].sort().join(';');
  useEffect(()=>{
    if (!ready) return;
    let disposed=false, open=0;
    const sockets:WebSocket[]=[]; const timers:ReturnType<typeof setTimeout>[]=[];
    // Keep nearby empty rooms and the rooms of loaded residents connected as the view expands.
    const connect=(room:string,attempt=0)=>{
      if(disposed)return;
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/live?room=${room}`); sockets.push(ws);
      let opened=false;
      ws.onopen=()=>{if(disposed){ws.close();return;}opened=true;open++;if(open===1)load().catch(()=>{});};
      ws.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.type==='building.changed'){update(msg.building);if(msg.claimedDay===new Date().toISOString().slice(0,10))setSnapshot(prev=>prev&&prev.me===msg.building.id?{...prev,claimedToday:true}:prev);}}catch{/* Keepalive is not a city event. */}};
      ws.onclose=()=>{if(disposed)return;if(opened)open--;timers.push(setTimeout(()=>connect(room,opened?0:attempt+1),Math.min(30000,1000*2**Math.min(attempt,5))));};
      ws.onerror=()=>ws.close();
    };
    for(const room of roomKey.split(';'))connect(room);
    return()=>{disposed=true;timers.forEach(clearTimeout);sockets.forEach(ws=>ws.close());};
  },[ready,roomKey,load,update]);
  useEffect(()=>{
    if(!ready)return;
    const now=new Date(),midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
    const timer=setTimeout(()=>load().catch(()=>{}),midnight-Date.now()+150);
    return()=>clearTimeout(timer);
  },[ready,snapshot?.claimedToday,load]);

  const buildings=useMemo(()=>snapshot?.buildings||[],[snapshot?.buildings]);
  const canDebug=import.meta.env.DEV||snapshot?.demo===true;
  const showScores=canDebug&&debugScores;
  const scoreAt=useMemo(()=>neighborhoodScores(buildings),[buildings]);
  const toggleScores=()=>{const next=!debugScores;setDebugScores(next);try{localStorage.setItem('cities-dev-scores',String(next));}catch{/* Dev scores work without storage. */}};
  const tower=buildings.find(b=>b.id===selected);
  const me=buildings.find(b=>b.id===snapshot?.me);
  const own=tower?.id===snapshot?.me;
  const neighbors=[...buildings].sort((a,b)=>b.level-a.level);
  const filtered=neighbors.filter(b=>`${b.name} ${b.username}`.toLowerCase().includes(query.toLowerCase()));
  const select=(b:Building)=>{setSelected(b.id);setTab('overview');setSearchOpen(false);setDrawerOpen(true);scene.current?.focus(b);};
  const focusMe=()=>{if(me)select(me);else setModal('login');};
  const action=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);try{await fn();}catch(e){notify(e instanceof Error?e.message:'Please try again.',true);}finally{setBusy('');}};
  const upgrade=()=>tower && action('upgrade',async()=>{const result=await api<{building:Building}>('/upgrade',{level:tower.level});update(result.building);notify(`A little taller. Your tower is now level ${result.building.level}.`);});
  const customize=(kind:'style'|'color',value:Style|Color)=>action(`${kind}-${value}`,async()=>{const result=await api<{building:Building}>('/customize',{kind,value});update(result.building);notify(kind==='style'?'A fresh silhouette.':'A fresh coat of color.');});
  const daily=()=>action('daily',async()=>{const result=await api<{building:Building;reward:number}>('/daily',{});update(result.building);setSnapshot(prev=>prev?{...prev,claimedToday:true}:prev);notify(`Welcome back. ${result.reward} resources added to your tower.`);});
  const showInvites=()=>{if(!me){setModal('login');return;}setModal('invite');api<{invites:Invite[]}>('/invites').then(r=>setInvites(r.invites)).catch(e=>notify(e.message,true));};
  const copy=async(token:string)=>{try{await navigator.clipboard.writeText(`${location.origin}/?invite=${token}`);setCopied(token);notify('Invitation copied.');}catch{notify('Clipboard is unavailable. Select and copy the invitation link below.',true);}};
  const createInvite=()=>action('invite',async()=>{const result=await api<{token:string}>('/invites',{});setInvites(prev=>[{token:result.token,created_at:new Date().toISOString(),used_by:null},...prev]);await copy(result.token);});
  const demoJoin=(token:string)=>action(`join-${token}`,async()=>{const result=await api<{building:Building;inviter:Building}>('/dev/join',{invite:token});update(result.building);update(result.inviter);setInvites(prev=>prev.map(i=>i.token===token?{...i,used_by:result.building.id}:i));notify('A new neighbor moved in near your tower.');setModal(null);select(result.building);});

  return <div className={`app ${lighting.night?'night':''}`} style={{background:`radial-gradient(ellipse at 40% 55%,${lighting.skyCenter} 0,${lighting.skyEdge} 100%)`}}>
    <header className="topbar">
      <button className="brand" onClick={()=>{scene.current?.reset();setCenter({x:0,z:0});}} aria-label="C.I.T.I.E.S, return to city center">
        <span className="brand-mark"><i/><i/><i/></span><span>c.i.t.i.e.s<span className="brand-period">.</span></span>
      </button>
      <nav aria-label="City controls">
        {canDebug && <button className="debug-toggle" aria-pressed={showScores} onClick={toggleScores} title="Show building connectivity scores and contributions"><Bug size={14}/>Dev scores</button>}
        <button className={`icon-button search-toggle ${searchOpen?'active':''}`} title="Find a neighbor" aria-label="Find a neighbor" aria-expanded={searchOpen} onClick={()=>setSearchOpen(!searchOpen)}><Search size={19}/></button>
        <span className="nav-divider"/>
        <button className="invite-button" onClick={showInvites}><Plus size={16}/> Invite a friend</button>
        <button className="user-button" onClick={focusMe} title="Your tower">{me?<span className="avatar tiny" style={{background:COLORS[me.color].hex}}>{initials(me.name)}</span>:<Github size={19}/>}<span>{me?'My tower':'Sign in'}</span></button>
      </nav>
    </header>

    <main>
      <Suspense fallback={<div className="scene-loading"><LoaderCircle className="spin" size={24}/><span>Drawing your little city…</span></div>}><CityScene ref={scene} buildings={buildings} selected={selected} lighting={lighting} center={center} debugScores={showScores} onSelect={id=>{const b=buildings.find(b=>b.id===id);if(b)select(b);}} onPan={(x,z)=>setCenter({x,z})}/></Suspense>
      {searchOpen && <section className="resident-search" aria-label="Find a neighbor">
        <div className="search-input"><Search size={17}/><input autoFocus placeholder="Find a name or username" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search residents"/><button className="icon-button" aria-label="Close search" onClick={()=>setSearchOpen(false)}><X size={16}/></button></div>
        <div className="resident-results">{filtered.length?filtered.map(b=><button key={b.id} className="resident-result" onClick={()=>select(b)}><span className="avatar small" style={{background:COLORS[b.color].hex}}>{initials(b.name)}</span><span><strong>{b.name}</strong><small>@{b.username}</small></span><span className="level-label">Lv. {b.level}</span></button>):<p className="empty-search">No neighbors match that name.</p>}</div>
      </section>}

      {tower && <TowerDrawer open={drawerOpen} onOpenChange={setDrawerOpen}><aside className="inspector" aria-label={`${tower.name}'s tower`}>
        <div className="inspector-heading"><span><span className="small-dot"/>{own?'Your little corner':'Meet your neighbor'}</span><div className="drawer-heading-actions"><button className="icon-button desktop-focus" title="Focus this tower" aria-label="Focus this tower" onClick={()=>scene.current?.focus(tower)}><LocateFixed size={17}/></button><button className="icon-button" aria-label="Close tower details" onClick={()=>{setDrawerOpen(false);document.querySelector<HTMLButtonElement>('.drawer-handle')?.focus();}}><X size={18}/></button></div></div>
        <div className="profile">
          <span className="avatar profile-avatar" style={{background:COLORS[tower.color].hex}}>{initials(tower.name)}<span className="profile-avatar-badge"><Hammer size={11}/></span></span>
          <div className="profile-name"><h2>{tower.name}</h2><span>@{tower.username}</span></div>
          {own && <span className="you-label">You</span>}
        </div>
        <p className="bio">{tower.bio || 'A new idea has moved into the neighborhood.'}</p>
        <div className="profile-links">
          {tower.github_url && <a href={tower.github_url} target="_blank" rel="noreferrer"><Github size={14}/>GitHub<ArrowUpRight size={12}/></a>}
          {tower.website && <a href={tower.website} target="_blank" rel="noreferrer">Website<ArrowUpRight size={12}/></a>}
          <span className={`verification ${tower.is_demo?'demo':''}`}>{tower.is_demo?<Sparkles size={12}/>:<Check size={12}/>} {tower.is_demo?'Demo resident':'GitHub connected'}</span>
        </div>
        {showScores && <ScoreBreakdown score={scoreAt(tower.x,tower.z)}/>}
        <div className="tower-stat"><div><span className="stat-icon"><Layers size={19}/></span><div><span>Tower level</span><strong>{tower.level}<small> and growing</small></strong></div></div><div className="tower-silhouette" style={{'--tower-color':COLORS[tower.color].hex} as React.CSSProperties}><i/><i/><i/></div></div>
        <div className="inspector-tabs" role="tablist" aria-label="Tower information" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=tab==='overview'?'design':'overview';setTab(next);document.getElementById(`tab-${next}`)?.focus();}}}>
          <button role="tab" id="tab-overview" aria-controls="panel-overview" aria-selected={tab==='overview'} onClick={()=>setTab('overview')}>Overview</button>
          <button role="tab" id="tab-design" aria-controls="panel-design" aria-selected={tab==='design'} onClick={()=>setTab('design')}>Architecture{!own && <span className="tab-view">View</span>}</button>
        </div>
        {tab==='overview'?<div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="overview-panel">
          <div className="section-heading"><h3>{tower.is_demo?'Sample activity':'GitHub activity'}</h3><span>{tower.is_demo?'Illustrative':'Past year'}</span></div>
          <div className="activity-grid"><div><strong>{compact(tower.commits)}</strong><span>Commits</span></div><div><strong>{compact(tower.prs)}</strong><span>Pull requests</span></div><div><strong>{compact(tower.reviews)}</strong><span>Reviews</span></div></div>
          {tower.is_demo ? <ActivityBlocks seed={tower.commits}/> : <div className="verified-activity"><Check size={15}/><span>Activity fetched directly from GitHub.<br/>Each contribution earns resources once.</span></div>}
          <div className="activity-caption"><span>{tower.is_demo?'Decorative activity preview':'Contribution counts from GitHub'}</span>{own && !tower.is_demo && <button disabled={Boolean(busy)} onClick={()=>action('sync',async()=>{const r=await api<{building:Building}>('/sync',{});update(r.building);notify('Your GitHub activity is up to date.');})}>{busy==='sync'?'Syncing…':'Sync activity'}</button>}</div>
          {own?<>
            <div className="resource-row"><span><Sparkles size={16}/> Building resources</span><strong>{tower.resources.toLocaleString()}</strong></div>
            <div className="growth-info"><span>Next up: level {tower.level+1}</span><span>{Math.min(tower.resources,upgradeCost(tower.level))} / {upgradeCost(tower.level)}</span></div>
            <div className="progress-track"><span style={{width:`${Math.min(100,tower.resources/upgradeCost(tower.level)*100)}%`}}/></div>
            <button className="primary-button upgrade-button" disabled={Boolean(busy)||tower.resources<upgradeCost(tower.level)} onClick={upgrade}>{busy==='upgrade'?<LoaderCircle className="spin" size={17}/>:<ArrowUp size={17}/>}Add a level<span>{upgradeCost(tower.level)} <Sparkles size={13}/></span></button>
            <p className="growth-footnote">Every new level takes a little more. Keep building.</p>
          </>:<div className="neighbor-note"><Leaf size={19}/><p>Good work makes good neighbors.<br/><span>Explore their corner of the skyline.</span></p></div>}
        </div>:<div id="panel-design" role="tabpanel" aria-labelledby="tab-design" className="design-panel">
          <div className="section-heading"><h3>Silhouette</h3><span>{own?`${STYLE_COST} resources`:'Current architecture'}</span></div>
          <div className="style-options">{(Object.keys(STYLES) as Style[]).map(style=><button key={style} className={`style-option ${tower.style===style?'selected':''}`} disabled={!own||Boolean(busy)||tower.style===style||tower.resources<STYLE_COST} onClick={()=>customize('style',style)}><span className={`style-mini ${style}`}><i/><i/><i/></span><span>{STYLES[style].label}</span>{tower.style===style && <Check size={12}/>}</button>)}</div>
          <p className="style-description">{STYLES[tower.style].description}</p>
          <div className="section-heading"><h3>Facade color</h3><span>{own?`${COLOR_COST} resources`:COLORS[tower.color].label}</span></div>
          <div className="color-options">{(Object.keys(COLORS) as Color[]).map(color=><button key={color} aria-label={COLORS[color].label} title={COLORS[color].label} aria-pressed={tower.color===color} style={{background:COLORS[color].hex}} disabled={!own||Boolean(busy)||tower.color===color||tower.resources<COLOR_COST} onClick={()=>customize('color',color)}>{tower.color===color && <Check size={18}/>}</button>)}</div>
          <div className="design-note"><Leaf size={17}/><p>A shape that feels like you.<br/>Your work makes it grow.</p></div>
          {own && <div className="resource-row"><span><Sparkles size={16}/> Available resources</span><strong>{tower.resources.toLocaleString()}</strong></div>}
        </div>}
        <footer className="inspector-footer"><MapPin size={13}/>Plot {tower.x}, {tower.z}<span>{STYLES[tower.style].label} tower</span>{own && <button className="account-link" onClick={()=>setModal('login')}>Account</button>}</footer>
      </aside></TowerDrawer>}

      {me && <button className={`daily-card ${snapshot?.claimedToday?'collected':''}`} disabled={Boolean(busy)||snapshot?.claimedToday} onClick={daily}>
        <span className="daily-icon">{snapshot?.claimedToday?<Check size={20}/>:<Gift size={21}/>}</span><span><strong>{snapshot?.claimedToday?'A good day to build.':'A little something for showing up.'}</strong><small>{snapshot?.claimedToday?'Today’s reward collected. See you tomorrow.':`Collect your daily ${snapshot?.dailyReward} resources`}</small></span>{!snapshot?.claimedToday && <span className="daily-action">{busy==='daily'?<LoaderCircle className="spin" size={17}/>:<Plus size={16}/>}</span>}
      </button>}
      <div className="map-controls"><div className="map-tools"><button title="Zoom in" aria-label="Zoom in" onClick={()=>scene.current?.zoom(1.2)}><Plus size={18}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>scene.current?.zoom(1/1.2)}><Minus size={18}/></button><span/><button title="Reset view" aria-label="Reset view" onClick={()=>{scene.current?.reset();setCenter({x:0,z:0});}}><Compass size={19}/></button><button title="How it works" aria-label="How it works" onClick={()=>setModal('help')}><HelpCircle size={18}/></button></div><span className="map-hint">WASD move <span>·</span> Q/E rotate <span>·</span> Space ↑ / Shift ↓</span></div>
      <CityMap buildings={buildings} selected={selected} center={center}/>
      {snapshot?.demo && <div className="demo-label"><Sparkles size={12}/>Local demo<span>Sample people. Real building mechanics.</span></div>}
      {!snapshot && <div className="loading-screen"><span className="brand-mark"><i/><i/><i/></span><h2>{error?'The city is taking a moment.':'Making room for good ideas.'}</h2><p>{error || 'Preparing your neighborhood…'}</p>{error?<button className="primary-button" onClick={()=>location.reload()}>Try again</button>:<LoaderCircle className="spin" size={22}/>}</div>}
      {snapshot && !snapshot.buildings.length && <div className="empty-city"><h2>A city starts with someone.</h2><p>Sign in with the founding GitHub account or an invitation to place the first tower.</p><button className="primary-button" onClick={()=>setModal('login')}><Github size={16}/>Join the city</button></div>}
    </main>

    {toast && <div className={`toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.error?<HelpCircle size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={15}/></button></div>}
    {modal && <Dialog onClose={()=>setModal(null)} title={modal==='invite'?'Good neighbors start with an invitation.':modal==='help'?'A city built by its people.':'Your work belongs here.'}>
      {modal==='invite' && <>
        <p className="modal-description">Invite someone who makes things. Their plot will be placed near yours, with room to make it their own.</p>
        <div className="invite-illustration"><span className="mini-house"><i/><i/><i/></span><span className="invite-road"><Plus size={16}/></span><span className="mini-house new"><i/><i/><i/></span></div>
        <button className="primary-button full-width" disabled={Boolean(busy)} onClick={createInvite}>{busy==='invite'?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>}Create an invitation</button>
        <p className="modal-small">Single-use invitations. Up to five new invitations per day.</p>
        {invites.length>0 && <div className="invitation-list"><h3>Your invitations</h3>{invites.map(i=><div className="invitation" key={i.token}><div><span>{i.used_by?'A neighbor moved in':'A plot is waiting'}</span><input readOnly aria-label="Invitation link" value={`${location.origin}/?invite=${i.token}`} onFocus={e=>e.target.select()}/></div>{i.used_by?<Check size={17}/>:<button className="icon-button" title="Copy invitation" aria-label="Copy invitation" onClick={()=>copy(i.token)}>{copied===i.token?<Check size={17}/>:<Copy size={17}/>}</button>}{snapshot?.demo && !i.used_by && <button className="demo-join" disabled={Boolean(busy)} onClick={()=>demoJoin(i.token)}>Try a demo join</button>}</div>)}</div>}
      </>}
      {modal==='help' && <><p className="modal-description">Every tower belongs to a person. Their contributions become resources, and their resources become a little piece of the skyline.</p><div className="help-item"><Github/><div><h3>Build things. Grow here.</h3><p>GitHub commits earn 1 resource, pull requests earn 8, and reviews earn 5. Counts come from GitHub’s past-year contribution totals.</p></div></div><div className="help-item"><Layers/><div><h3>There’s always another level.</h3><p>New levels cost more resources. There’s no maximum height. Tower detail stays light so the city runs smoothly.</p></div></div><div className="help-item"><Users/><div><h3>Bring your people.</h3><p>Your invitation gives someone a nearby plot. Violet links show invitation connections. More neighbors bring urban streets; sparse areas stay greener and quieter.</p></div></div><div className="help-item"><Gift/><div><h3>A little reward for returning.</h3><p>Collect 30 resources once per day. The day resets at midnight UTC.</p></div></div><div className="help-controls">Click the city to use WASD to move and Q/E to rotate.<br/>Space moves up; Shift moves down. Hold keys for continuous movement.<br/>Drag to orbit. Right-drag to pan. Scroll to zoom.<br/>Use search to select residents with your keyboard.</div>{snapshot?.demo && <p className="demo-explanation">You’re exploring a local demo. Residents and activity are samples; upgrades, rewards, invitations, and live updates use the real local backend.</p>}</>}
      {modal==='login' && <><p className="modal-description">Connect GitHub to make your own tower. New neighbors need an invitation; returning neighbors can sign in directly.</p><label className="invite-field">Invitation code<input id="invite-code" defaultValue={new URLSearchParams(location.search).get('invite') || ''} placeholder="Paste your invitation code or link"/></label><button className="primary-button full-width" disabled={!snapshot?.githubConfigured} onClick={()=>{const value=(document.getElementById('invite-code') as HTMLInputElement).value.trim();let token=value;try{token=new URL(value).searchParams.get('invite')||value;}catch{/* Plain token. */}location.href=`/api/auth/github${token?`?invite=${encodeURIComponent(token)}`:''}`;}}><Github size={18}/>Continue with GitHub</button>{!snapshot?.githubConfigured && <p className="setup-note">GitHub login needs OAuth credentials in the local server configuration. Setup instructions are in README.md.</p>}{snapshot?.demo && <button className="secondary-button full-width" disabled={Boolean(busy)} onClick={()=>action('demo',async()=>{for(let batch=0;batch<3;batch++)await api(`/dev/start?batch=${batch}`,{});await load();setModal(null);notify('Welcome to your local demo tower.');})}><Sparkles size={16}/>Explore as a demo resident</button>}{me && <button className="logout-button" disabled={Boolean(busy)} onClick={()=>action('logout',async()=>{await api('/auth/logout',{});await load();setModal(null);notify('You signed out.');})}><LogOut size={14}/>Sign out of this session</button>}</>}
    </Dialog>}
  </div>;
}
function initials(name:string){return name.split(' ').slice(0,2).map(s=>s[0]).join('');}
function Github({size=20}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2-6-2m12 5v-3.8c0-1.1-.4-1.7-.8-2.1 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.3 1.2a11.2 11.2 0 0 0-6 0C6.7 3.4 5.7 3.7 5.7 3.7a4.4 4.4 0 0 0-.1 3.2 4.7 4.7 0 0 0-1.3 3.2c0 4.7 2.8 5.7 5.5 6-.4.4-.8 1-.8 2.1V22"/></svg>;}
function ActivityBlocks({seed}:{seed:number}){
  return <div className="activity-blocks" aria-hidden="true">{Array.from({length:91},(_,i)=>{const value=Math.abs(Math.sin((i+1)*12.9898+seed)*43758.5453)%1;return <i key={i} className={`heat-${value>.83?4:value>.62?3:value>.4?2:value>.21?1:0}`}/>;})}</div>;
}
function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const panel=useRef<HTMLDivElement>(null); const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement | null;const el=panel.current!;
    const focusables=()=>[...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')];
    focusables()[0]?.focus();
    const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current();if(e.key==='Tab'){const all=focusables(),first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
  },[]);
  return <div className="modal-backdrop" onClick={onClose}><div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button><span className="modal-mark"><Leaf size={23}/></span><h2 id="modal-title">{title}</h2>{children}</div></div>;
}
