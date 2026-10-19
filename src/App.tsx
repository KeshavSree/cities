import { nearestShopSlot } from '../shared/shopAttachments';
import { flushSync } from 'react-dom';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Clock3, Footprints, Heart, Hammer, Landmark, Bug, Check, Compass, Copy, Gift, HelpCircle, Layers, Leaf, LoaderCircle, LocateFixed, LogOut, Minus, Package, Plus, Settings, Sparkles, Users, X } from 'lucide-react';
import type { SceneHandle } from './CityScene';
import { persistDecoration } from './decorationPersistence';
import { emptyStreetInteraction, type StreetInteractionState } from './streetInteractionState';
import { StreetControls } from './StreetControls';
import { useMobileStreetUI } from './MobileStreetControls';
import { DECORATIONS, decorationsOf, placementError, suggestedDecorationPosition, type DecorationDraft, type DecorationKind, type Decoration } from '../shared/decorations';
import type { StreetStart } from './streetNavigation';
import { api, ApiError, uploadAvatar, readSnapshot, refreshPersonal } from './api';
import { type Bootstrap, type Building, type Color } from '../shared/types';
import { VIEW_RADIUS } from '../shared/world';
import { lightingAt, type TimeOfDay } from './lighting';
import { TowerDrawer } from './TowerDrawer';
import { useViewport } from './useViewport';
import { ChangelogPane } from './Changelog';
import { Onboarding } from './Onboarding';
import { NeighborhoodGuide, hasSeenNeighborhoodGuide, rememberNeighborhoodGuide } from './NeighborhoodGuide';
import { InvitationPane } from './InvitationPane';
import { InviteWelcomeSteps } from './InviteWelcomeSteps';
import { ProfileLinks } from './ProfileLinks';
import { ResidentSearch } from './ResidentSearch';
import { ScoreBreakdown } from './ScoreBreakdown';
import { neighborhoodScores } from './neighborhood';
import { cityLayoutKey } from './cityRevisions';
import { upcomingPlotPreviews } from './plotPreview';
import { LevelProgress } from './ProgressionPanel';
import { SegmentEditor } from './SegmentEditor';
import { ProjectDetails } from './ProjectDetails';
import { ResidentProfile, ProfileAvatar } from './ResidentProfile';
import { GitHubCalendar } from './GitHubCalendar';
import { BrickRewardBurst, type RewardFlight } from './BrickRewardBurst';
import { MAX_LEVEL, LEVELS_PER_TIER, TIERS, REWARDS, GITHUB_DAILY_COMMIT_LIMIT, BUILDING_THEMES, type BuildingTheme, type SegmentStyle } from '../shared/progression';
import './progression.css';
import './tower-like.css';
import './topbar-bricks.css';
import './placement-preview.css';
import './daily-bonus.css';
import './xp-reward.css';
import './settings-pane.css';

const LIGHTING_PREVIEW_HOURS:Record<TimeOfDay,number>={morning:7,day:12,evening:19,night:23};
type Modal = 'changelog' | 'invite' | 'help' | 'login' | 'not-invited' | 'auth-error' | null;
const CityScene = lazy(()=>import('./CityScene').then(m=>({default:m.CityScene})));
const StreetEditor = lazy(()=>import('./StreetEditor').then(m=>({default:m.StreetEditor})));
type Invite = { token: string; created_at: string; use_count:number };
const brickBalanceKey=(id:string)=>`cities-seen-bricks:${id}`;
const rememberBrickBalance=(id:string,bricks:number)=>{try{localStorage.setItem(brickBalanceKey(id),String(bricks));}catch{/* Catch-up animation works from the next available stored balance. */}};
const readBrickBalance=(id:string)=>{try{const value=localStorage.getItem(brickBalanceKey(id));return value===null?null:Number(value);}catch{return null;}};
let initialization: Promise<Bootstrap> | null = null;
function initialize() {
  return initialization ??= (async () => {
    let snapshot = await readSnapshot();
    if (snapshot.demo && (!snapshot.me||!snapshot.buildings.length)) {
      for (let batch = 0; batch < 3; batch++) await api(`/dev/start?batch=${batch}`, {});
      snapshot = await readSnapshot();
    }
    return snapshot;
  })().catch(e => { initialization = null; throw e; });
}

export default function App() {
  const viewport=useViewport();
  const mobileStreetUI=useMobileStreetUI();
  useEffect(()=>{
    const root=document.documentElement;root.style.setProperty('--visible-height',`${viewport.height}px`);root.dataset.keyboardOpen=String(viewport.keyboardOpen);
    return()=>{root.style.removeProperty('--visible-height');delete root.dataset.keyboardOpen;};
  },[viewport.height,viewport.keyboardOpen]);
  const [snapshot, setSnapshot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [pageVisible,setPageVisible]=useState(()=>!document.hidden);
  const [xpReward,setXpReward]=useState<{id:number;amount:number}|null>(null);
  const [reconnectOpen,setReconnectOpen]=useState(false);
  const reconnectPrompted=useRef(false);
  const openingSync=useRef<string|null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [clockLighting,setClockLighting]=useState(()=>lightingAt(new Date()));
  const [lightingOverride,setLightingOverride]=useState<TimeOfDay|'auto'>('auto');
  const previewLighting=useMemo(()=>{
    if(!import.meta.env.DEV||lightingOverride==='auto')return null;
    const time=new Date();time.setHours(LIGHTING_PREVIEW_HOURS[lightingOverride],0,0,0);return lightingAt(time);
  },[lightingOverride]);
  const lighting=previewLighting??clockLighting;
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [inviteToken] = useState(()=>new URLSearchParams(location.search).get('invite') || '');
  const [inviterName, setInviterName] = useState('');
  const [inviteError, setInviteError] = useState('');
  useEffect(()=>{
    if(!inviteToken)return;
    let active=true;
    api<{name:string}>(`/invites/${encodeURIComponent(inviteToken)}`)
      .then(value=>{if(active)setInviterName(value.name);})
      .catch(e=>{if(active)setInviteError(e.message);});
    return()=>{active=false;};
  },[inviteToken]);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [likePulse,setLikePulse]=useState<string|null>(null);
  useEffect(()=>{if(!likePulse)return;const timer=setTimeout(()=>setLikePulse(null),450);return()=>clearTimeout(timer);},[likePulse]);
  const [rewardFlight,setRewardFlight]=useState<RewardFlight|null>(null);
  const dailyButton=useRef<HTMLButtonElement>(null);
  const brickCounter=useRef<HTMLSpanElement>(null);

  const finishRewardFlight=useCallback(()=>setRewardFlight(null),[]);
  const launchBrickFlight=useCallback((origin:{x:number;y:number},amount:number,catchUp=false)=>{
    const destination=brickCounter.current?.querySelector('svg')?.getBoundingClientRect();
    if(!destination)return;
    setRewardFlight({
      id:Date.now(),origin,target:{x:destination.left+destination.width/2,y:destination.top+destination.height/2},
      count:Math.min(20,Math.max(8,Math.ceil(amount/3))),staggerMs:catchUp?100:120,hoverMs:catchUp?240:180,
    });
  },[]);
  const [center, setCenter] = useState({ x: 0, z: 0 });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [placementMode,setPlacementMode]=useState(false);
  const [placementChoice,setPlacementChoice]=useState<string|null>(null);
  const [previewLocation,setPreviewLocation]=useState<{x:number;z:number;inviter_x:number;inviter_z:number;invited_by:string}|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [streetView,setStreetView]=useState(false);
  const [streetEditorOpen,setStreetEditorOpen]=useState(false);
  const [decorationDraft,setDecorationDraft]=useState<DecorationDraft|null>(null);
  const [preserveStreetDraft,setPreserveStreetDraft]=useState(false);
  const [streetDraft,setStreetDraft]=useState<DecorationDraft|null>(null);
  const [streetInteraction,setStreetInteraction]=useState<StreetInteractionState>(emptyStreetInteraction);
  const [mouseLocked,setMouseLocked]=useState(false);
  const [mouseCaptureBlocked,setMouseCaptureBlocked]=useState(false);
  const [pickingStreet,setPickingStreet]=useState(false);
  const [streetStart,setStreetStart]=useState<StreetStart|null>(null);
  const [streetTutorialTarget,setStreetTutorialTarget]=useState<{x:number;y:number;start:StreetStart}|null>(null);
  const [onboardingOpen,setOnboardingOpen]=useState(false);
  const [neighborhoodGuideOpen,setNeighborhoodGuideOpen]=useState(false);
  const [neighborhoodGuidePending,setNeighborhoodGuidePending]=useState(false);
  const neighborhoodGuideStarted=useRef<string|null>(null);
  const ownTowerPaneWasOpen=useRef(false);
  const guideOpen=onboardingOpen||neighborhoodGuideOpen;
  const onboardingStarted=useRef<string|null>(null);
  const onboardingClaim=useRef(false);
  const [lodEnabled,setLodEnabled]=useState(()=>{try{return localStorage.getItem('cities-lod')!=='false';}catch{return true;}});
  const [debugScores,setDebugScores]=useState(()=>{try{return localStorage.getItem('cities-dev-scores')==='true';}catch{return false;}});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scene = useRef<SceneHandle>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestCenter = useRef(center); latestCenter.current = center;
  const snapshotRequest = useRef(0);
  const currentSnapshot=useRef(snapshot);currentSnapshot.current=snapshot;
  const liveSocket=useRef<WebSocket|null>(null);
  const notify = useCallback((text: string, isError = false) => {
    clearTimeout(toastTimer.current); setToast({ text, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 6500 : 3800);
  }, []);
  const load = useCallback(async (personal=true) => {
    const request = ++snapshotRequest.current;
    const {x,z} = latestCenter.current;
    const value = await readSnapshot(x,z,personal?undefined:currentSnapshot.current||undefined);
    if (request !== snapshotRequest.current) return;
    setSnapshot(value); setSelected(prev=>prev && (prev==='projects'||value.projects.some(p=>p.id===prev)||value.buildings.some(b=>b.id===prev)) ? prev : value.me || null);
  }, []);
  useEffect(()=>{
    let active=true;
    initialize().then(value=>{if(active){setSnapshot(value);setSelected(value.me || null);setDrawerOpen(Boolean(value.me)&&window.innerWidth>760);const params=new URLSearchParams(location.search);if(params.has('auth_error'))setModal(params.get('auth_error_code')==='NOT_INVITED'?'not-invited':'auth-error');else if(params.has('invite'))setModal('login');}}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[notify]);
  useEffect(()=>{
    if(modal!=='invite')return;
    let active=true;
    const timer=setInterval(()=>api<{invites:Invite[]}>('/invites').then(r=>{if(active)setInvites(r.invites);}).catch(()=>{}),30_000);
    return()=>{active=false;clearInterval(timer);};
  },[modal]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  useEffect(()=>{
    const refresh=()=>setClockLighting(lightingAt(new Date()));
    const timer=setInterval(refresh,30_000);
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};
  },[]);
  const snapshotCellX=Math.floor(center.x/8),snapshotCellZ=Math.floor(center.z/8);
  useEffect(()=>{ if (currentSnapshot.current) load(false).catch(e=>notify(e.message,true)); },[snapshotCellX,snapshotCellZ,load,notify]);
  const update = useCallback((building: Building) => {
    setSnapshot(prev=>{
      if(!prev)return prev;
      const exists=prev.buildings.some(b=>b.id===building.id);
      if(!exists&&building.id!==prev.me&&(Math.abs(building.x-latestCenter.current.x)>VIEW_RADIUS||Math.abs(building.z-latestCenter.current.z)>VIEW_RADIUS))return prev;
      return {...prev,buildings:exists?prev.buildings.map(b=>b.id===building.id?{...building,bricks:building.bricks??b.bricks}:b):[...prev.buildings,building]};
    });
  }, []);
  const handleSyncError=useCallback((e:unknown)=>{
    if(e instanceof ApiError&&e.code==='GITHUB_RECONNECT_REQUIRED'){
      setSnapshot(prev=>prev?{...prev,githubReconnectRequired:true}:prev);
      reconnectPrompted.current=true;setReconnectOpen(true);return;
    }
    notify(e instanceof Error?e.message:'Activity sync failed. Try again later.',true);
  },[notify]);
  useEffect(()=>{
    if(snapshot?.githubReconnectRequired&&!reconnectPrompted.current){
      reconnectPrompted.current=true;setReconnectOpen(true);
    }
  },[snapshot?.githubReconnectRequired]);
  useEffect(()=>{
    if(!snapshot?.me||snapshot.pendingPlacement||openingSync.current===snapshot.me)return;
    const resident=snapshot.buildings.find(b=>b.id===snapshot.me);
    if(!resident||resident.is_demo)return;
    openingSync.current=snapshot.me;
    if(snapshot.githubReconnectRequired)return;
    api<{building:Building}>('/sync',{automatic:true}).then(r=>{update(r.building);}).catch(handleSyncError);
  },[snapshot,update,load,handleSyncError]);
  useEffect(()=>{
    const resume=()=>{
      const value=currentSnapshot.current;
      if(!value?.me||value.pendingPlacement||value.githubReconnectRequired)return;
      if(value.buildings.find(b=>b.id===value.me)?.is_demo)return;
      api<{building:Building}>('/sync',{automatic:true}).then(r=>update(r.building)).catch(handleSyncError);
    };
    const visibility=()=>{setPageVisible(!document.hidden);if(!document.hidden)resume();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',resume);
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',resume);};
  },[update,handleSyncError]);
  useEffect(()=>{
    if(!xpReward)return;
    const timer=setTimeout(()=>setXpReward(null),2600);return()=>clearTimeout(timer);
  },[xpReward]);
  const ready = Boolean(snapshot);
  useEffect(()=>{
    const ws=liveSocket.current;
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'subscribe',x:center.x,z:center.z}));
  },[center.x,center.z]);
  useEffect(()=>{
    if(!ready)return;
    let disposed=false,attempt=0,hasConnected=false,timer:ReturnType<typeof setTimeout>|undefined;
    const connect=()=>{
      if(disposed)return;
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/live`);
      liveSocket.current=ws;
      ws.onopen=()=>{
        if(disposed){ws.close();return;}
        ws.send(JSON.stringify({type:'subscribe',...latestCenter.current}));
        // Catch up after a disconnected interval; ordinary events never reload the neighborhood.
        load(hasConnected).catch(()=>{});hasConnected=true;attempt=0;
      };
      ws.onmessage=e=>{try{
        const msg=JSON.parse(e.data);
        if(msg.type==='project.changed'){
          const prior=currentSnapshot.current?.projects.find(p=>p.id===msg.project.id);
          if(msg.project.funded===msg.project.goal&&prior&&prior.funded<prior.goal&&prior.myContribution>=25)api<{building:Building}>('/me').then(r=>update(r.building)).catch(()=>{});
          setSnapshot(prev=>prev?{...prev,projects:prev.projects.map(p=>p.id===msg.project.id?{...msg.project,myContribution:p.myContribution}:p)}:prev);
        }
        if(msg.type==='building.changed'){
          if(msg.building.id===currentSnapshot.current?.me&&msg.building.invite_degree>=3&&!currentSnapshot.current?.unlockedThemes.includes('cyberpunk'))api<{unlockedThemes:string[]}>('/self').then(r=>setSnapshot(prev=>prev?{...prev,unlockedThemes:r.unlockedThemes}:prev)).catch(()=>{});
          update(msg.building);
          // Old deployments send public-only events; fetch just our tower in that case.
          if(msg.building.id===currentSnapshot.current?.me&&msg.building.bricks===null)api<{building:Building}>('/me').then(r=>update(r.building)).catch(()=>{});
          if(msg.claimedDay===new Date().toISOString().slice(0,10))setSnapshot(prev=>prev&&prev.me===msg.building.id?{...prev,claimedToday:true}:prev);
        }
      }catch{/* Ignore invalid events. */}};
      ws.onclose=()=>{if(disposed)return;timer=setTimeout(connect,Math.min(30_000,1000*2**Math.min(attempt++,5)));};
      ws.onerror=()=>ws.close();
    };
    connect();
    return()=>{disposed=true;clearTimeout(timer);liveSocket.current?.close();liveSocket.current=null;};
  },[ready,load,update,snapshot?.me]);
  useEffect(()=>{
    if(!ready)return;
    const now=new Date(),midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
    const timer=setTimeout(()=>{const previous=currentSnapshot.current;if(previous)refreshPersonal(previous).then(value=>setSnapshot(current=>current?{...current,claimedToday:value.claimedToday,githubReconnectRequired:value.githubReconnectRequired}:current)).catch(()=>{});},midnight-Date.now()+150);
    return()=>clearTimeout(timer);
  },[ready,snapshot?.claimedToday,load]);

  const buildings=useMemo(()=>(snapshot?.buildings||[]).map(b=>previewLocation && b.id===snapshot?.me ? {...b,...previewLocation} : b),[snapshot?.buildings,snapshot?.me,previewLocation]);
  const canDebug=import.meta.env.DEV;
  const showScores=canDebug&&debugScores;
  const layoutRevision=cityLayoutKey(buildings);
  const scoreAt=useMemo(()=>neighborhoodScores(buildings),[layoutRevision]);
  const toggleScores=()=>{const next=!debugScores;setDebugScores(next);try{localStorage.setItem('cities-dev-scores',String(next));}catch{/* Dev scores work without storage. */}};
  const toggleLod=()=>setLodEnabled(current=>{const next=!current;try{localStorage.setItem('cities-lod',String(next));}catch{/* LOD still works without storage. */}return next;});
  const tower=buildings.find(b=>b.id===selected);
  const project=snapshot?.projects.find(p=>p.id===selected);
  const me=buildings.find(b=>b.id===snapshot?.me);
  const meId=me?.id,brickBalance=me?.bricks,ownXp=me?.xp;
  useEffect(()=>{
    if(!pageVisible||!meId||brickBalance===null||brickBalance===undefined)return;
    const previous=readBrickBalance(meId);rememberBrickBalance(meId,brickBalance);
    if(onboardingClaim.current)return;
    if(previous!==null&&Number.isFinite(previous)&&brickBalance>previous){
      requestAnimationFrame(()=>launchBrickFlight({x:innerWidth/2,y:innerHeight/2},brickBalance-previous,true));
    }
  },[meId,brickBalance,pageVisible,launchBrickFlight]);
  useEffect(()=>{
    if(!pageVisible||!meId||ownXp===undefined)return;
    try{
      const key=`cities-seen-xp-v1:${meId}`,stored=localStorage.getItem(key),previous=stored===null?null:Number(stored);
      localStorage.setItem(key,String(ownXp));
      if(previous!==null&&Number.isFinite(previous)&&ownXp>previous)setXpReward({id:Date.now(),amount:ownXp-previous});
    }catch{/* Rewards still arrive if browser storage is unavailable. */}
  },[meId,ownXp,pageVisible]);
  const nextPlotsKey=JSON.stringify(snapshot?.nextPlots||[]);
  const previews=useMemo(()=>me?upcomingPlotPreviews(buildings,me,snapshot?.nextPlots||[]):[],[layoutRevision,me?.id,nextPlotsKey]);
  const placementActive=placementMode || Boolean(snapshot?.pendingPlacement);
  const placementOrigin=snapshot?.pendingPlacement?.origin||me;
  const placementOptions=useMemo(()=>{
    if(!placementActive || !placementOrigin)return [];
    const available=snapshot?.pendingPlacement?.options||snapshot?.nextPlots||[];
    const nearby=available.filter(p=>Math.hypot(p.x-placementOrigin.x,p.z-placementOrigin.z)<=5);
    return upcomingPlotPreviews(buildings,placementOrigin,(nearby.length?nearby:available).slice(0,8));
  },[placementActive,buildings,placementOrigin,snapshot?.nextPlots,snapshot?.pendingPlacement]);
  useEffect(()=>{
    const origin=snapshot?.pendingPlacement?.origin;
    if(origin){setDrawerOpen(false);setCenter({x:origin.x,z:origin.z});}
  },[snapshot?.pendingPlacement?.origin.id]);
  const enterPlacement=()=>{
    if(!me)return;
    setPlacementChoice(null);setPlacementMode(true);setDrawerOpen(false);setModal(null);setSearchOpen(false);
    scene.current?.focus({...me,level:1});
  };
  const choosePlacement=(key:string)=>setPlacementChoice(key);
  const confirmPlacement=()=>{
    const choice=placementOptions.find(p=>`${p.plan.x},${p.plan.z}`===placementChoice);
    if(!choice)return;
    if(snapshot?.pendingPlacement){
      void action('placement',async()=>{
        try{
          const result=await api<{building:Building}>('/placement',{x:choice.plan.x,z:choice.plan.z});
          update(result.building);
          setSnapshot(prev=>prev?{...prev,pendingPlacement:null}:prev);
          setPlacementChoice(null);setSelected(result.building.id);setDrawerOpen(true);
          scene.current?.focus(result.building);
          await load();
        }catch(error){setPlacementChoice(null);await load();throw error;}
      });
      return;
    }
    if(me)setPreviewLocation({x:choice.plan.x,z:choice.plan.z,inviter_x:me.x,inviter_z:me.z,invited_by:me.id});
    setPlacementMode(false);setDrawerOpen(true);setSelected(me?.id||null);
    scene.current?.focus({x:choice.plan.x,z:choice.plan.z,level:me?.level||1});
  };
  const own=tower?.id===snapshot?.me;
  const neighbors=[...buildings].sort((a,b)=>b.level-a.level);
  const filtered=neighbors.filter(b=>`${b.name} ${b.username}`.toLowerCase().includes(query.toLowerCase()));
  const select=(b:Building)=>{setStreetEditorOpen(false);setDecorationDraft(null);setSettingsOpen(false);setModal(prev=>prev==='invite'||prev==='changelog'?null:prev);setSelected(b.id);setSearchOpen(false);setDrawerOpen(true);scene.current?.focus(b);};
  const selectProject=(id:string)=>{setStreetEditorOpen(false);setDecorationDraft(null);setSettingsOpen(false);setModal(prev=>prev==='invite'||prev==='changelog'?null:prev);setSelected(id);setSearchOpen(false);setDrawerOpen(true);const p=snapshot?.projects.find(p=>p.id===id);if(p)scene.current?.focus(p);};
  const onboardingTower=useCallback(()=>{if(!meId)return;setSelected(meId);setDrawerOpen(true);setModal(null);setSearchOpen(false);},[meId]);
  const onboardingCloseInvite=useCallback(()=>setModal(null),[]);
  const guideUnavailable=placementActive||Boolean(busy)||streetEditorOpen||Boolean(decorationDraft)||Boolean(streetDraft)||Boolean(streetInteraction.carrying)||streetInteraction.saving;
  const openNeighborhoodGuide=useCallback(()=>{
    if(!meId)return;
    setNeighborhoodGuidePending(false);setStreetView(false);setStreetEditorOpen(false);setDecorationDraft(null);setStreetDraft(null);setDrawerOpen(true);setSelected(meId);setSettingsOpen(false);setSearchOpen(false);setModal(null);setPickingStreet(false);setNeighborhoodGuideOpen(true);
  },[meId]);
  useEffect(()=>{
    if(!meId||me?.is_demo||placementActive||snapshot?.onboardingCompleted!==false||onboardingStarted.current===meId)return;
    onboardingStarted.current=meId;setOnboardingOpen(true);onboardingTower();
  },[meId,me?.is_demo,placementActive,snapshot?.onboardingCompleted,onboardingTower]);
  useEffect(()=>{
    if(!meId||(!me?.is_demo&&snapshot?.onboardingCompleted!==true)||neighborhoodGuideStarted.current===meId)return;
    neighborhoodGuideStarted.current=meId;
    if(!hasSeenNeighborhoodGuide(meId))setNeighborhoodGuidePending(true);
  },[meId,me?.is_demo,snapshot?.onboardingCompleted]);
  useEffect(()=>{
    const ownTowerPaneOpen=Boolean(drawerOpen&&meId&&selected===meId),justOpened=ownTowerPaneOpen&&!ownTowerPaneWasOpen.current;
    ownTowerPaneWasOpen.current=ownTowerPaneOpen;
    if(!justOpened||!neighborhoodGuidePending||guideOpen||guideUnavailable||streetView||modal||settingsOpen||searchOpen)return;
    openNeighborhoodGuide();
  },[drawerOpen,meId,selected,neighborhoodGuidePending,guideOpen,guideUnavailable,streetView,modal,settingsOpen,searchOpen,openNeighborhoodGuide]);
  const onboardingGift=async(origin:{x:number;y:number})=>{
    onboardingClaim.current=true;
    try{
      const r=await api<{building:Building;awarded:number}>('/onboarding/gift',{});
      if(r.building.bricks!==null)rememberBrickBalance(r.building.id,r.building.bricks);
      update(r.building);if(r.awarded)launchBrickFlight(origin,r.awarded);
    }finally{onboardingClaim.current=false;}
  };
  const finishOnboarding=async()=>{await api('/onboarding/complete',{});setSnapshot(prev=>prev?{...prev,onboardingCompleted:true}:prev);setOnboardingOpen(false);if(meId&&!hasSeenNeighborhoodGuide(meId)){neighborhoodGuideStarted.current=meId;setNeighborhoodGuidePending(true);}};
  const closeNeighborhoodGuide=()=>{
    if(meId){neighborhoodGuideStarted.current=meId;rememberNeighborhoodGuide(meId);}
    setNeighborhoodGuidePending(false);setNeighborhoodGuideOpen(false);
  };
  const focusMe=()=>{if(snapshot?.pendingPlacement)scene.current?.focus(snapshot.pendingPlacement.origin);else if(me)select(me);else location.href='/api/auth/github';};
  const action=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);try{await fn();}catch(e){notify(e instanceof Error?e.message:'Please try again.',true);}finally{setBusy('');}};
  const daily=()=>action('daily',async()=>{
    const source=dailyButton.current?.querySelector('.daily-icon')?.getBoundingClientRect();
    const result=await api<{building:Building;reward:number}>('/daily',{});
    if(result.building.bricks!==null)rememberBrickBalance(result.building.id,result.building.bricks);
    update(result.building);setSnapshot(prev=>prev?{...prev,claimedToday:true}:prev);
    if(source)launchBrickFlight({x:source.left+source.width/2,y:source.top+source.height/2},result.reward);
    notify(`Welcome back. ${result.reward} bricks and ${REWARDS.dailyXp} XP earned.`);
  });
  const saveBio=async(bio:string)=>{
    if(busy)throw new Error('Wait for the current change to finish.');
    setBusy('profile');
    try{const r=await api<{building:Building}>('/profile',{bio});update(r.building);notify('Bio updated.');}finally{setBusy('');}
  };
  const savePhoto=async(image:Blob)=>{
    if(busy)throw new Error('Wait for the current change to finish.');
    setBusy('profile-photo');
    try{const r=await uploadAvatar<{building:Building}>(image);update(r.building);notify('Profile picture updated.');}finally{setBusy('');}
  };
  const saveSegment=(segment:number,color:Color,style:SegmentStyle,theme:BuildingTheme)=>action('segment',async()=>{const r=await api<{building:Building}>('/segments',{segment,color,style,theme});update(r.building);notify('Segment updated.');});
  const openStreetEditor=(held?:DecorationDraft)=>{
    if(!me)return;
    flushSync(()=>{setStreetView(false);setPickingStreet(false);setStreetDraft(null);setPreserveStreetDraft(false);setDecorationDraft(held??null);setDrawerOpen(false);setModal(null);setSearchOpen(false);setSettingsOpen(false);setSelected(me.id);setStreetEditorOpen(true);});
  };
  const closeStreetEditor=()=>{if(busy)return;setDecorationDraft(null);setStreetEditorOpen(false);};
  const chooseDecoration=(kind:DecorationKind,item?:Decoration)=>{
    if(!me)return;
    const rotation=item?.rotation??0,suggestion=item&&item.x!==null&&item.z!==null?{x:item.x,z:item.z,rotation}:suggestedDecorationPosition(me,kind,rotation,item?.id);
    setDecorationDraft({kind,id:item?.id,x:suggestion?.x??null,z:suggestion?.z??null,rotation:suggestion?.rotation??rotation,requestId:crypto.randomUUID()});
  };
  const returnToCity=()=>{
    if(busy||streetInteraction.saving)return;
    const held=scene.current?.takeItem()??streetDraft;
    flushSync(()=>{setStreetView(false);setPickingStreet(false);setStreetDraft(null);setPreserveStreetDraft(false);if(held){setDecorationDraft(held);setStreetEditorOpen(true);}});
  };
  const cancelDecoration=()=>{if(busy)return;setDecorationDraft(null);};
  const commitDecoration=async(draft:DecorationDraft)=>{
    if(!me)throw new Error('Sign in to place items.');
    update(await persistDecoration(me,draft,building=>{
      update(building);
      const receipt=decorationsOf(building).find(item=>item.id===(draft.id||`${me.id}:${draft.requestId}`)&&item.kind===draft.kind);
      if(receipt)setDecorationDraft(current=>current?.requestId===draft.requestId?{...current,id:receipt.id}:current);
    }));
  };
  const saveDecoration=()=>action('decoration-save',async()=>{
    if(!decorationDraft)return;await commitDecoration(decorationDraft);
    setDecorationDraft(null);notify(decorationDraft.id?'Item moved.':`${DECORATIONS[decorationDraft.kind].label} added to your neighborhood.`);
  });
  const saveStreetItem=async(draft:DecorationDraft)=>{
    if(busy)return false;setBusy('street-save');
    try{await commitDecoration(draft);setStreetDraft(null);notify(draft.id?'Item moved.':`${DECORATIONS[draft.kind].label} placed.`);return true;}
    catch(error){notify(error instanceof Error?error.message:'Could not save this spot. Try again.',true);return false;}
    finally{setBusy('');}
  };
  const storeDecoration=(item:Decoration)=>action('decoration-store',async()=>{
    const result=await api<{building:Building}>('/decorations/move',{id:item.id,x:null,z:null,rotation:item.rotation});update(result.building);notify('Decoration stored. Place it again for free.');
  });
  const unlockTheme=(theme:BuildingTheme)=>action(`theme-${theme}`,async()=>{const r=await api<{building:Building;unlockedThemes:string[]}>('/themes/unlock',{theme});update(r.building);setSnapshot(prev=>prev?{...prev,unlockedThemes:r.unlockedThemes}:prev);notify(`${BUILDING_THEMES[theme].label} unlocked.`);});
  const like=()=>tower&&action('like',async()=>{const r=await api<{building:Building}>('/like',{tower:tower.id});update(r.building);setSnapshot(prev=>prev?{...prev,likedIds:[...prev.likedIds,tower.id]}:prev);setLikePulse(tower.id);});
  const devProgression=(data:{level?:number;source?:string})=>tower&&action('dev',async()=>{const r=await api<{building:Building}>('/dev/progression',{tower:tower.id,...data});update(r.building);if(data.level)scene.current?.focus(r.building);notify(data.level?'Demo model tier updated.':'Sample reward recorded.');});
  const contribute=(project:string,amount:number)=>action('project',async()=>{const r=await api<{building:Building;project:Bootstrap['projects'][number]}>('/projects/contribute',{project,amount,requestId:crypto.randomUUID()});update(r.building);setSnapshot(prev=>prev?{...prev,projects:prev.projects.map(p=>p.id===r.project.id?r.project:p)}:prev);notify('Your bricks are building a shared place.');});
  const showInvites=()=>{if(!me){location.href='/api/auth/github';return;}if(modal==='invite'){setModal(null);return;}setStreetEditorOpen(false);setDecorationDraft(null);setSettingsOpen(false);setDrawerOpen(false);setSearchOpen(false);setModal('invite');api<{invitation:Invite}>('/invites',{}).then(r=>setInvites([r.invitation])).catch(e=>notify(e.message,true));};
  const copy=async(token:string)=>{try{await navigator.clipboard.writeText(`${location.origin}/?invite=${token}`);notify('Invitation copied.');}catch{notify('Clipboard is unavailable. Select and copy the invitation link below.',true);}};
  const createInvite=()=>action('invite',async()=>{if(invites[0])await copy(invites[0].token);});

  const enterStreet=(start:StreetStart)=>{setStreetStart(start);setPickingStreet(false);setStreetView(true);requestAnimationFrame(()=>scene.current?.look());};
  useEffect(()=>{
    if(!neighborhoodGuideOpen||!pickingStreet){setStreetTutorialTarget(null);return;}
    let frame=0,attempts=0,cancelled=false;
    const locate=()=>{
      if(cancelled)return;
      const target=scene.current?.streetGuidePoint()??null;
      if(target){setStreetTutorialTarget(target);return;}
      if(attempts++<12)frame=requestAnimationFrame(locate);
    };
    frame=requestAnimationFrame(locate);
    return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[neighborhoodGuideOpen,pickingStreet,buildings]);
  const decorationValid=Boolean(me&&decorationDraft&&decorationDraft.x!==null&&decorationDraft.z!==null&&!placementError(me,decorationDraft.kind,{x:decorationDraft.x,z:decorationDraft.z,rotation:decorationDraft.rotation},decorationDraft.id));
  return <div data-time-of-day={lighting.phase} data-streetlights={lighting.lightsOn?'on':'off'} className={`app ${lighting.night?'night':''} ${streetView&&!placementActive?'street-mode':''} ${(streetView||pickingStreet)&&!placementActive&&mobileStreetUI?'street-mobile-mode':''} ${pickingStreet&&!placementActive?'street-picking':''} ${streetEditorOpen?'street-editor-open':''} ${decorationDraft?'decoration-editing':''}`} style={{background:`radial-gradient(ellipse at 40% 55%,${lighting.skyCenter} 0,${lighting.skyEdge} 100%)`}}>
    <header className="topbar">
      <div className="brand-and-changelog"><button className="brand" disabled={Boolean(busy)||streetInteraction.saving} onClick={()=>{setStreetView(false);setStreetEditorOpen(false);setPickingStreet(false);setDecorationDraft(null);scene.current?.reset();setCenter({x:0,z:0});}} aria-label="C.I.T.I.E.S, return to city center">
        <span className="brand-mark"><i/><i/><i/></span><span>c.i.t.i.e.s<span className="brand-period">.</span></span>
      </button><button className="changelog-link" onClick={()=>{setStreetEditorOpen(false);setDecorationDraft(null);setModal(previous=>previous==='changelog'?null:'changelog');setSearchOpen(false);setSettingsOpen(false);setDrawerOpen(false);}} aria-expanded={modal==='changelog'} aria-controls="changelog-pane">Changelog</button></div>
      <nav aria-label="City controls">
        {canDebug && <button className="debug-toggle" aria-pressed={showScores} onClick={toggleScores} title="Show model tiers, XP, and road diagnostics"><Bug size={14}/>Dev mode</button>}
        <>{canDebug && <button className="debug-toggle" disabled={!me||guideUnavailable} onClick={()=>{setSettingsOpen(false);onboardingTower();setOnboardingOpen(true);}}>Test onboarding</button>}{canDebug && <button className="debug-toggle" disabled={!me} onClick={enterPlacement}>Test placement</button>}</><ResidentSearch open={searchOpen} query={query} results={filtered} onQuery={setQuery} onSelect={select} onOpenChange={open=>{if(open){setStreetEditorOpen(false);setDecorationDraft(null);setModal(prev=>prev==='invite'||prev==='changelog'?null:prev);}setSearchOpen(open);}}/>
        <span className="nav-divider"/>
        {me && <button className="invite-button" aria-label="Invite a friend" title="Invite a friend" onClick={showInvites}><Plus size={16}/> Invite a friend</button>}
        {me&&me.bricks!==null&&<span ref={brickCounter} className="topbar-bricks" aria-label={`${me.bricks.toLocaleString()} bricks`}><Package size={17} aria-hidden="true"/><span>{me.bricks.toLocaleString()}</span></span>}
        <button className="user-button" onClick={focusMe} title="Your tower">{me?<ProfileAvatar avatar={me.avatar} name={me.name} className="tiny"/>:<Github size={19}/>}<span>{snapshot?.pendingPlacement?'Choose location':me?'My tower':'Sign in'}</span></button>
      </nav>
      <span className="mobile-city-status"><i className="status-dot connected"/>{buildings.length} nearby</span>
    </header>

    <main>
      <Suspense fallback={<div className="scene-loading"><LoaderCircle className="spin" size={24}/><span>Drawing your little city…</span></div>}><CityScene ref={scene} buttonOnlyItems={mobileStreetUI} preserveStreetDraft={preserveStreetDraft} streetDraft={streetDraft} onStreetSave={saveStreetItem} onStreetDraftCancel={()=>setStreetDraft(null)} onStreetState={setStreetInteraction} onMouseLock={(locked,blocked=false)=>{setMouseLocked(locked);setMouseCaptureBlocked(blocked);}} ownerId={snapshot?.me||null} pageVisible={pageVisible} streetView={streetView&&!placementActive} pickingStreet={pickingStreet&&!placementActive} streetStart={streetStart} onStreetPick={start=>{setStreetStart(start);}} onStreetEnter={enterStreet} onStreetExit={returnToCity} navigationPaused={drawerOpen||Boolean(modal)||settingsOpen||searchOpen||onboardingOpen} buildings={buildings} selected={selected} lighting={lighting} center={center} debugScores={showScores} lodEnabled={lodEnabled} previews={placementActive?placementOptions:previews} placementMode={placementActive} placementOrigin={placementOrigin} placementChoice={placementChoice} onPlacement={choosePlacement} projects={snapshot?.projects||[]} onProject={selectProject} onSelect={id=>{const b=buildings.find(b=>b.id===id);if(b)select(b);}} decorationOwner={streetEditorOpen?me?.id:null} decorationDraft={decorationDraft} onDecorationPosition={(x,z)=>{if(busy)return;setDecorationDraft(previous=>{if(!previous)return null;const slot=previous.kind==='base_shop'&&me?nearestShopSlot(me,{x,z}):null,nextX=slot?.x??x,nextZ=slot?.z??z,nextRotation=slot?.rotation??previous.rotation;if(previous.x===nextX&&previous.z===nextZ&&previous.rotation===nextRotation)return previous;return {...previous,x:nextX,z:nextZ,rotation:nextRotation};});}} onDecorationCancel={cancelDecoration} onPan={(x,z)=>setCenter({x,z})}/></Suspense>

      {!placementActive&&!streetEditorOpen&&<StreetControls onJoystick={(side,forward)=>scene.current?.joystick(side,forward)} mobileUI={mobileStreetUI} onUseItem={()=>scene.current?.useItem()} onResume={()=>{setDrawerOpen(false);setSettingsOpen(false);setModal(null);setSearchOpen(false);}} placing={false} switchingDisabled={Boolean(busy)||streetInteraction.saving} onLightingSettings={canDebug?()=>setSettingsOpen(true):undefined} active={streetView} available={Boolean(buildings.length)&&!onboardingOpen} paused={drawerOpen||Boolean(modal)||settingsOpen||searchOpen||onboardingOpen}
        picking={pickingStreet} hasHome={Boolean(me)} mouseLocked={mouseLocked} mouseCaptureBlocked={mouseCaptureBlocked} interaction={streetInteraction} onLook={()=>scene.current?.look()} onRotate={()=>scene.current?.rotateItem()} onCancelItem={()=>scene.current?.cancelItem()} onShop={()=>{scene.current?.walk('forward',false);openStreetEditor(scene.current?.takeItem()??streetDraft??undefined);}}
        onDragPoint={(x,y)=>{const start=scene.current?.streetDropPoint(x,y)||null;setStreetStart(start);return start;}}
        onDrop={enterStreet}
        onChange={active=>{if(active){if(streetView)return;setDrawerOpen(false);setSearchOpen(false);setModal(null);setSettingsOpen(false);setStreetStart(null);setPickingStreet(true);}else returnToCity();}}
        onWalk={(direction,held)=>scene.current?.walk(direction,held)}/>}

      {neighborhoodGuideOpen&&pickingStreet&&streetTutorialTarget&&<button className="street-tutorial-point" aria-label="Choose this Streetview starting point" style={{left:streetTutorialTarget.x,top:streetTutorialTarget.y}} onClick={()=>enterStreet(streetTutorialTarget.start)}/>}

      {streetEditorOpen&&me&&<Suspense fallback={null}><StreetEditor building={me} draft={decorationDraft} busy={Boolean(busy)} onChoose={chooseDecoration} onStore={storeDecoration} onChange={setDecorationDraft} onCancel={cancelDecoration} onConfirm={saveDecoration} onClose={closeStreetEditor}/></Suspense>}

      {placementActive && <section className="placement-preview" aria-label="Tower placement preview">
        <div className="placement-message"><h2>Choose tower location</h2><p>{placementOptions.length?'Click a hologram to select it.':'No open plots found in the current preview area.'}</p></div>
        {placementChoice && <button className="placement-confirm" disabled={Boolean(busy)} onClick={confirmPlacement}><Hammer size={24} aria-hidden="true"/><span>{busy==='placement'?'Placing…':'Select location'}</span></button>}
      </section>}
      {!placementActive && drawerOpen && (tower||project||selected==='projects')&&<button className="mobile-sheet-backdrop" aria-label="Close details" onClick={()=>setDrawerOpen(false)}/>}
      {!placementActive && (project||selected==='projects')&&<TowerDrawer open={drawerOpen} onOpenChange={open=>{if(open)setModal(prev=>prev==='invite'||prev==='changelog'?null:prev);setDrawerOpen(open);}} subject="project"><ProjectDetails key={selected} project={project} projects={snapshot?.projects||[]} me={me} busy={Boolean(busy)} onSelect={selectProject} onFocus={p=>scene.current?.focus(p)} onContribute={contribute}/></TowerDrawer>}
      {!placementActive && tower && <TowerDrawer open={drawerOpen} onOpenChange={open=>{if(open)setModal(prev=>prev==='invite'||prev==='changelog'?null:prev);setDrawerOpen(open);}}><aside key={tower.id} className="inspector" aria-label={`${tower.name}'s tower`}>
        <ResidentProfile key={`profile-${tower.id}`} building={tower} own={own} busy={Boolean(busy)} onSaveBio={saveBio} onUpload={savePhoto} nameAction={<div className="tower-social"><button className={`tower-like ${likePulse===tower.id?'is-popping':''}`} aria-pressed={Boolean(snapshot?.likedIds.includes(tower.id))} aria-label={`${snapshot?.likedIds.includes(tower.id)?'Liked':'Like'} ${own?'your tower':`${tower.name}'s tower`}, ${tower.likes} likes`} title={snapshot?.likedIds.includes(tower.id)?'Liked':'Like'} disabled={!me||Boolean(busy)||snapshot?.likedIds.includes(tower.id)} onClick={like}><Heart className="tower-like-heart" size={17} aria-hidden="true" fill={snapshot?.likedIds.includes(tower.id)?'currentColor':'none'}/><span>{tower.likes}</span></button></div>} headerActions={<button className="icon-button desktop-focus" title="Focus this tower" aria-label="Focus this tower" onClick={()=>scene.current?.focus(tower)}><LocateFixed size={20}/></button>}/>
        {showScores && <ScoreBreakdown score={scoreAt(tower.x,tower.z)} building={tower} editable={Boolean(snapshot?.demo&&tower.is_demo)} busy={Boolean(busy)} onDev={devProgression}/>}
        <LevelProgress building={tower}/>
        <ProfileLinks key={`links-${tower.id}`} building={tower} own={own} busy={Boolean(busy)} onSave={async links=>{
          if(busy)throw new Error('Wait for the current change to finish.');
          setBusy('profile-links');
          try{const r=await api<{building:Building}>('/profile/links',links);update(r.building);}finally{setBusy('');}
        }}/>
        <div className="tower-panel">
          <SegmentEditor key={`segments-${tower.id}`} building={tower} own={own} active={drawerOpen} busy={Boolean(busy)} unlockedThemes={snapshot?.unlockedThemes||['contemporary']} onUnlock={unlockTheme} onSave={saveSegment} onStreetview={own?openStreetEditor:undefined}/>
          {!tower.is_demo&&<div className="section-heading"><h3>GitHub activity</h3></div>}
          <GitHubCalendar key={`calendar-${tower.id}`} building={tower}/>
          <div className="activity-caption"><span/>{own && !tower.is_demo && <button disabled={Boolean(busy)} onClick={()=>{if(snapshot?.githubReconnectRequired){setReconnectOpen(true);return;}action('sync',async()=>{try{const r=await api<{building:Building}>('/sync',{});update(r.building);notify('Your GitHub activity is up to date.');}catch(e){handleSyncError(e);}});}}>{snapshot?.githubReconnectRequired?'Reconnect GitHub':busy==='sync'?'Syncing…':'Sync activity'}</button>}</div>
        </div>
      </aside></TowerDrawer>}

      {me && !snapshot?.claimedToday && <button ref={dailyButton} className="daily-card daily-bonus" aria-label="Collect daily bonus, 30 bricks" aria-busy={busy==='daily'} disabled={Boolean(busy)} onClick={daily}>
        <strong>Daily Bonus</strong><span className="daily-bonus-reward"><span className="daily-icon"><Package size={21} aria-hidden="true"/></span><span>{snapshot?.dailyReward||30}</span></span>
      </button>}
      <aside className={`settings-pane ${settingsOpen?'is-open':''}`} aria-label="Settings" aria-hidden={!settingsOpen} inert={!settingsOpen}>
        <header><div><Settings size={18} aria-hidden="true"/><span>Settings</span></div><button title="Close settings" aria-label="Close settings" tabIndex={settingsOpen?0:-1} onClick={()=>setSettingsOpen(false)}><X size={17}/></button></header>
        <div className="settings-row" title="Your local time. Morning 6–9am, day 9am–6pm, evening 6–9pm, night 9pm–6am. Lamps turn on at 6pm."><Clock3 size={18} aria-hidden="true"/><span>Local time</span><span style={{textTransform:'capitalize'}}>{clockLighting.phase}</span></div>
        {canDebug&&<div className="dev-lighting-control"><label htmlFor="lighting-preview">Lighting preview</label><select id="lighting-preview" value={lightingOverride} onChange={event=>{const value=event.target.value as TimeOfDay|'auto';setLightingOverride(value);if(value==='auto')setClockLighting(lightingAt(new Date()));}}><option value="auto">Auto (local time)</option><option value="morning">Morning</option><option value="day">Day</option><option value="evening">Evening</option><option value="night">Night</option></select></div>}
        <div className="settings-row"><Layers size={18} aria-hidden="true"/><span>LOD</span><button className="settings-switch" type="button" role="switch" aria-label="Level of detail" aria-checked={lodEnabled} tabIndex={settingsOpen?0:-1} onClick={toggleLod}><span/></button></div>
        {me&&<button className="settings-guide-button" disabled={guideUnavailable} onClick={openNeighborhoodGuide}><HelpCircle size={18}/>Neighborhood guide</button>}
        {canDebug&&<div className="mobile-dev-tools"><button onClick={toggleScores} aria-pressed={showScores}><Bug size={18}/>Development diagnostics</button><button disabled={!me||guideUnavailable} onClick={()=>{setSettingsOpen(false);onboardingTower();setOnboardingOpen(true);}}>Test onboarding</button><button disabled={!me||guideUnavailable} onClick={openNeighborhoodGuide}><Footprints size={18}/>Test Streetview tutorial</button><button disabled={!me} onClick={()=>{setSettingsOpen(false);enterPlacement();}}>Test placement</button></div>}
      </aside>
      <div className="map-controls"><div className="map-tools"><button title="Zoom in" aria-label="Zoom in" onClick={()=>scene.current?.zoom(1.2)}><Plus size={18}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>scene.current?.zoom(1/1.2)}><Minus size={18}/></button><span/><button title="Reset view" aria-label="Reset view" onClick={()=>{setStreetView(false);setPickingStreet(false);setDecorationDraft(null);scene.current?.reset();setCenter({x:0,z:0});}}><Compass size={19}/></button><button className={settingsOpen?'active':''} title="Settings" aria-label="Settings" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(open=>!open)}><Settings size={18}/></button><button title="How it works" aria-label="How it works" onClick={()=>setModal('help')}><HelpCircle size={18}/></button></div></div>
      <nav className={`mobile-dock ${me?'':'is-guest'}`} aria-label="Mobile city navigation">
        <button className={!searchOpen&&!drawerOpen&&modal===null?'is-active':''} aria-label="Explore city" onClick={()=>{setSearchOpen(false);setDrawerOpen(false);setModal(null);setStreetView(false);setPickingStreet(false);setDecorationDraft(null);scene.current?.reset();setCenter({x:0,z:0});}}><Compass size={20}/><span>Explore</span></button>
        <button className={searchOpen?'is-active':''} aria-label="Find neighbors" aria-expanded={searchOpen} onClick={()=>{setSettingsOpen(false);setDrawerOpen(false);setModal(null);setSearchOpen(!searchOpen);}}><Users size={20}/><span>Neighbors</span></button>
        <button className={`mobile-daily ${!snapshot?.claimedToday?'has-reward':''}`} aria-label={snapshot?.claimedToday?'Daily bonus collected':'Collect daily bonus'} disabled={!me||Boolean(busy)||snapshot?.claimedToday} onClick={daily}><Gift size={20}/><span>Bonus</span></button>
        {me && <button className={modal==='invite'?'is-active':''} aria-label="Invite a friend" onClick={showInvites}><Plus size={20}/><span>Invite</span></button>}
        <button className={drawerOpen&&selected===snapshot?.me?'is-active':''} aria-label={me?'Open my tower':'Sign in'} onClick={focusMe}>{me?<ProfileAvatar avatar={me.avatar} name={me.name} className="dock-avatar"/>:<Github size={20}/>}<span>Me</span></button>
      </nav>
      {!snapshot && <div className="loading-screen"><span className="brand-mark"><i/><i/><i/></span><h2>{error?'The city is taking a moment.':'Making room for good ideas.'}</h2><p>{error || 'Preparing your neighborhood…'}</p>{error?<button className="primary-button" onClick={()=>location.reload()}>Try again</button>:<LoaderCircle className="spin" size={22}/>}</div>}
      {snapshot && !snapshot.buildings.length && <div className="empty-city"><h2>A city starts with someone.</h2><p>Sign in with the founding GitHub account or an invitation to place the first tower.</p><button className="primary-button" onClick={()=>{location.href='/api/auth/github';}}><Github size={16}/>Join the city</button></div>}
    </main>

    {reconnectOpen&&<Dialog title="Reconnect GitHub" onClose={()=>setReconnectOpen(false)}>
      <p className="modal-description">Your GitHub connection is no longer valid. Reconnect to automatically sync your commits and earn XP and bricks. Your tower and progress are saved.</p>
      <button className="primary-button full-width" onClick={()=>{location.href='/api/auth/github';}}><Github size={18}/>Reconnect GitHub</button>
    </Dialog>}
    {xpReward&&<div key={xpReward.id} className="xp-reward-pop" role="status">+{xpReward.amount.toLocaleString()} XP</div>}
    {rewardFlight&&<BrickRewardBurst key={rewardFlight.id} flight={rewardFlight} onComplete={finishRewardFlight}/>}
    {neighborhoodGuideOpen&&me&&<NeighborhoodGuide onClose={closeNeighborhoodGuide} onComplete={closeNeighborhoodGuide} editorOpen={streetEditorOpen} hasDraft={Boolean(decorationDraft)} placementValid={decorationValid} pickingStreet={pickingStreet} streetView={streetView}/>}
    {onboardingOpen&&me&&!placementActive&&<Onboarding onOpenTower={onboardingTower} onInvite={showInvites} onCloseInvite={onboardingCloseInvite} onGift={onboardingGift} onFinish={finishOnboarding} towerOpen={drawerOpen} earthenUnlocked={Boolean(snapshot?.unlockedThemes.includes('earthen'))}/>}
    {toast && <div className={`toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.error?<HelpCircle size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={15}/></button></div>}
    <InvitationPane open={Boolean(me&&modal==='invite')} onClose={()=>setModal(null)}>
        <div className="invite-illustration"><img className="invite-tower-image" src="/images/invite-level-6.svg" alt="Level 6 cottage tower"/><button className="invite-create" aria-label="Copy invitation link" title="Copy invitation link" disabled={Boolean(busy)||!invites.length} onClick={createInvite}>{busy==='invite'?<LoaderCircle className="spin" size={22}/>:<Plus size={24}/>}</button><img className="invite-tower-image" src="/images/invite-level-3.svg" alt="Level 3 shack tower"/></div>
        {invites.length>0 && <div className="invitation-list"><div className="invitation-list-heading"><h3>Your invitation</h3></div>{invites.slice(0,1).map(i=><div className="invitation" key={i.token}>
          <span className="invitation-status invitation-use-count" aria-label={`${i.use_count} people joined`} title={`${i.use_count} people joined`}>{i.use_count}</span>
          <div><input readOnly aria-label="Invitation link" onClick={e=>e.currentTarget.select()} value={`${location.origin}/?invite=${i.token}`} onFocus={e=>e.target.select()}/></div>
          <button className="icon-button" title="Copy invitation" aria-label="Copy invitation" onClick={()=>copy(i.token)}><Copy size={17}/></button>
        </div>)}</div>}
    </InvitationPane>
    <ChangelogPane open={modal==='changelog'} onClose={()=>setModal(null)}/>
    {modal && modal!=='invite' && modal!=='changelog' && <Dialog className={modal==='login' && inviteToken ? 'invite-welcome' : ''} onClose={()=>setModal(null)} showMark={!inviteToken || modal!=='login'} title={modal==='help'?'A city built by its people.':modal==='not-invited'?'You have not been invited':modal==='auth-error'?'GitHub sign-in could not be completed':'Welcome to C.I.T.I.E.S'}>
      {modal==='help' && <>{me&&<button className="secondary-button full-width" disabled={guideUnavailable} onClick={openNeighborhoodGuide}><Footprints size={18}/>Tour the neighborhood features</button>}<p className="modal-description">Earn XP to grow your tower through {MAX_LEVEL} levels and {TIERS.length} model tiers. Spend bricks to make it yours.</p><div className="help-item"><Github/><div><h3>Verified contributions.</h3><p>GitHub earns {REWARDS.commit} XP per newly credited commit, up to {GITHUB_DAILY_COMMIT_LIMIT} rewarded commits ({GITHUB_DAILY_COMMIT_LIMIT*REWARDS.commit} XP) per UTC day. Each rewarded commit also earns {REWARDS.commitBricks} bricks, capped at {GITHUB_DAILY_COMMIT_LIMIT*REWARDS.commitBricks} bricks per UTC day. Pull requests and reviews do not earn rewards.</p></div></div><div className="help-item"><Layers/><div><h3>Ten tiers. Thirty levels.</h3><p>From a shack to an arcology. Every {LEVELS_PER_TIER} levels unlock a new model, ground treatment, and editable segment. Upper sections inherit plot angles and lower alignments while making room for terraces. Permanently unlock architectural themes with bricks, then switch unlocked themes across segments for free. Each new level takes more XP.</p></div></div><div className="help-item"><Users/><div><h3>Build a community.</h3><p>Invite joins earn {REWARDS.invite} XP; likes earn {REWARDS.like}. Each nearby tower level-up, including a new tower’s first level, rewards the eight closest other residents within three plot spacings with {REWARDS.construction} XP.</p></div></div><div className="help-item"><Landmark/><div><h3>Bricks build shared places.</h3><p>Unlock permanent themes or contribute to nearby projects. Segment restyling is free after unlock. Contribute at least 25 bricks to earn {REWARDS.project} XP when a project finishes.</p></div></div><div className="help-item"><Gift/><div><h3>A little reward for returning.</h3><p>Collect {REWARDS.dailyBricks} bricks and {REWARDS.dailyXp} XP once per UTC day.</p></div></div><div className="help-controls">Drag the person onto a highlighted street, or click the person and choose a highlighted street to enter Street view. Move your mouse to look and use WASD or the walking arrows to walk. Look at your own items to highlight them; click to pick up or place. R rotates; Escape cancels a held item and releases the mouse. On touchscreens, touch and drag anywhere on the left to walk, swipe on the right to look, and use Pick up or Place. Choose City view to return.<br/>In City view, click the city to use WASD to move and Q/E to rotate.<br/>Space moves up; Shift moves down. Hold keys for continuous movement.<br/>Drag to orbit. Right-drag to pan. Scroll to zoom.<br/>Use search to select residents with your keyboard.</div>{snapshot?.demo&&<p className="demo-explanation">Local demo residents and preset XP are illustrative. Dev mode lets you preview all tiers and simulate rewards. Actual rewards and brick spending are stored by the local backend.</p>}</>}
      {modal==='not-invited'&&<p className="modal-description">Find someone to invite you!</p>}
      {modal==='auth-error'&&<><p className="modal-description">{new URLSearchParams(location.search).get('auth_error')||'Please try again.'}</p><button className="primary-button full-width" onClick={()=>{location.href='/api/auth/github';}}><Github size={18}/>Try again with GitHub</button></>}
      {modal==='login'&&<><p className="modal-description">{inviteError||(inviterName?`${inviterName} has invited you to C.I.T.I.E.S.`:'Loading your invitation…')}</p><InviteWelcomeSteps/><button className="primary-button full-width" disabled={!snapshot?.githubConfigured||!inviterName||Boolean(inviteError)} onClick={()=>{location.href=`/api/auth/github?invite=${encodeURIComponent(inviteToken)}`;}}><Github size={18}/>Continue with GitHub</button></>}

    </Dialog>}
  </div>;
}
function Github({size=20}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2-6-2m12 5v-3.8c0-1.1-.4-1.7-.8-2.1 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.3 1.2a11.2 11.2 0 0 0-6 0C6.7 3.4 5.7 3.7 5.7 3.7a4.4 4.4 0 0 0-.1 3.2 4.7 4.7 0 0 0-1.3 3.2c0 4.7 2.8 5.7 5.5 6-.4.4-.8 1-.8 2.1V22"/></svg>;}

function Dialog({title,onClose,children,showMark=true,className=''}:{title:string;onClose:()=>void;children:ReactNode;showMark?:boolean;className?:string}){
  const panel=useRef<HTMLDivElement>(null); const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement | null;const el=panel.current!;
    const focusables=()=>[...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')];
    focusables()[0]?.focus();
    const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current();if(e.key==='Tab'){const all=focusables(),first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
  },[]);
  return <div className="modal-backdrop" onClick={onClose}><div ref={panel} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button>{showMark&&<span className="modal-mark"><Leaf size={23}/></span>}<h2 id="modal-title">{title}</h2>{children}</div></div>;
}
