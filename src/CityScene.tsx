import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CityAssets } from './CityAssets';
import { disposeGroup } from './sceneResources';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { type Building, type PublicProject } from '../shared/types';
import { plotPosition, plotCoordinates, VIEW_RADIUS} from '../shared/world';
import { WorldTerrain } from './WorldTerrain';
import { WildNature } from './WildNature';


import type { CityLighting } from './lighting';
import { StreetLighting} from './StreetLighting';
import { neighborhoodDensity, neighborhoodScores, streetNetwork, streetDensity, roadWidth, roadShoulder, type GroundPoint } from './neighborhood';
import { CameraKeyboard } from './CameraKeyboard';
import { StreetInteraction } from './StreetInteraction';
import type { StreetInteractionState } from './streetInteractionState';
import { StreetWalk, type WalkDirection } from './StreetWalk';
import { canWalk, pickStreetStart, streetStartChoices, streetObstacles, type StreetStart, type StreetPoint } from './streetNavigation';

import { buildingForm, insetPlotPolygon } from './buildingForm';
import { clearRoadSurface, roadObstacles } from './roadClearance';
import { plotPlan } from '../shared/plots';
import type { PlotPreview } from './plotPreview';
import { tierForLevel, tierIndex} from '../shared/progression';

import { baseShopSlots, shopAttachment } from '../shared/shopAttachments';
import { OwnedNeighbors } from './OwnedNeighbors';
import { decorationModel } from './DecorationModels';
import { decorationFootprint, placementError, DECORATION_ROAD_INSET, type DecorationDraft } from '../shared/decorations';
import './tower-upgrade.css';

export interface SceneHandle { useItem:()=>void;streetChoices:()=>StreetStart[];takeItem:()=>DecorationDraft|null;focus: (b: {x:number;z:number;level?:number}) => void; reset: () => void; zoom: (amount: number) => void; walk:(direction:WalkDirection,held:boolean)=>void; streetDropPoint:(x:number,y:number)=>StreetStart|null; look:()=>void; rotateItem:()=>void; cancelItem:()=>void; }
interface Props { preserveStreetDraft?:boolean;streetDraft?:DecorationDraft|null; onStreetSave?:(draft:DecorationDraft)=>Promise<boolean>; onStreetDraftCancel?:()=>void; onStreetState?:(state:StreetInteractionState)=>void; onMouseLock?:(locked:boolean,blocked?:boolean)=>void; ownerId?:string|null; pageVisible?:boolean; streetView?:boolean; pickingStreet?:boolean; streetStart?:StreetStart|null; onStreetPick?:(start:StreetStart|null)=>void; onStreetEnter?:(start:StreetStart)=>void; decorationOwner?:string|null; decorationDraft?:DecorationDraft|null; onDecorationPosition?:(x:number,z:number)=>void; onDecorationCancel?:()=>void; navigationPaused?:boolean; onStreetExit?:()=>void; buildings: Building[]; selected: string | null; lighting: CityLighting; center: {x:number;z:number}; debugScores:boolean; lodEnabled:boolean; previews:PlotPreview[]; placementMode?:boolean; placementOrigin?:{x:number;z:number}; placementChoice?:string|null; onPlacement?:(key:string)=>void; projects:PublicProject[]; onProject:(id:string)=>void; onSelect: (id: string) => void; onPan: (x: number, z: number) => void; }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
type DetailLevel=0|1|2;
const detailForZoom=(zoom:number,enabled=true):DetailLevel=>!enabled||zoom>=.56?0:1;
interface SceneEngine {
  assets:CityAssets;nature:WildNature;streetLights:StreetLighting;owned:OwnedNeighbors;interactions:StreetInteraction;scene:THREE.Scene;renderer:THREE.WebGLRenderer;camera:THREE.OrthographicCamera;controls:OrbitControls;walk:StreetWalk;
  city:THREE.Group;planned:THREE.Group;labels:THREE.Group;celebrations:THREE.Group;outline:OutlinePass;
  focus:THREE.Vector3|null;night:boolean;decorationOverlay:THREE.Group;startPaths:THREE.Group;startMarker:THREE.Group;startRoads:ReturnType<typeof streetNetwork>['roads'];startObstacles:StreetPoint[][];resize:()=>void;invalidate:(duration?:number)=>void;shadowsDirty:boolean;
}

export const CityScene = forwardRef<SceneHandle, Props>(function CityScene({ preserveStreetDraft=false,streetDraft=null,onStreetSave,onStreetDraftCancel,onStreetState,onMouseLock,ownerId=null, pageVisible=true, streetView=false, pickingStreet=false, streetStart=null, onStreetPick,onStreetEnter, decorationOwner=null, decorationDraft=null, onDecorationPosition, onDecorationCancel, navigationPaused=false, onStreetExit, buildings, selected, lighting, center, debugScores, lodEnabled, previews, placementMode=false, placementOrigin, placementChoice=null, onPlacement, projects, onProject, onSelect, onPan }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneEngine|null>(null);
  const night=lighting.night,lightsOn=lighting.lightsOn;
  const props = useRef({ ownerId,night,lightsOn,streetDraft,onStreetSave,onStreetDraftCancel,onStreetState,onMouseLock,navigationPaused,pageVisible,buildings, selected, lighting, onSelect, onPan, onProject, placementMode, onPlacement, lodEnabled, onStreetExit, pickingStreet, onStreetPick,onStreetEnter, decorationOwner, decorationDraft, onDecorationPosition, onDecorationCancel }); props.current = { ownerId,night,lightsOn,streetDraft,onStreetSave,onStreetDraftCancel,onStreetState,onMouseLock,navigationPaused,pageVisible,buildings, selected, lighting, onSelect, onPan, onProject, placementMode, onPlacement, lodEnabled, onStreetExit, pickingStreet, onStreetPick,onStreetEnter, decorationOwner, decorationDraft, onDecorationPosition, onDecorationCancel };
  const previousLevels=useRef(new Map<string,number>());
  const [detail,setDetail]=useState<DetailLevel>(()=>detailForZoom(.83,lodEnabled));
  const detailRef=useRef(detail);detailRef.current=detail;
  const [unavailable, setUnavailable] = useState(false);
  useImperativeHandle(ref, () => ({
    focus(b) {
      const e=engine.current;if(!e)return;
      if(e.walk.enabled){e.walk.face(plotPosition(b.x,b.z));return;}
      const resident=props.current.buildings.find(t=>t.x===b.x&&t.z===b.z),position=plotPosition(b.x,b.z);
      const height=resident?buildingForm({...resident,level:b.level??resident.level}).topY:0;
      e.focus=new THREE.Vector3(position.x,height>12?height*.42:0,position.z);
      if(height>22){e.camera.zoom=Math.min(e.camera.zoom,.9);e.camera.updateProjectionMatrix();}
      e.invalidate(1600);
    },
    reset() { const e = engine.current; if (!e) return; e.focus = new THREE.Vector3(0,0,0); e.camera.position.set(38, 36, 46).multiplyScalar(4).add(e.controls.target); e.camera.zoom = .83; e.camera.updateProjectionMatrix(); e.invalidate(1600); },
    takeItem(){return engine.current?.interactions.takeDraft()??null;},
    look(){const e=engine.current;if(e){e.walk.setPaused(props.current.navigationPaused||!props.current.pageVisible);e.walk.requestMouseLook();}},
    useItem(){void engine.current?.interactions.interact();},
    rotateItem(){engine.current?.interactions.rotate();},
    cancelItem(){engine.current?.interactions.cancel();},
    walk(direction,held){engine.current?.walk.input(direction,held);},
    streetChoices(){
      const e=engine.current;if(!e)return [];
      const roads=streetNetwork(props.current.buildings,neighborhoodDensity(props.current.buildings)).roads;
      return streetStartChoices(e.controls.target,roads.values(),streetObstacles(props.current.buildings));
    },
    streetDropPoint(x,y){
      const e=engine.current;if(!e||e.walk.enabled)return null;
      const r=e.renderer.domElement.getBoundingClientRect();
      if(x<r.left||x>r.right||y<r.top||y>r.bottom||document.elementFromPoint(x,y)!==e.renderer.domElement)return null;
      // The first drag event can precede the picker effect.
      if(!props.current.pickingStreet||!e.startRoads.size){e.startRoads=streetNetwork(props.current.buildings,neighborhoodDensity(props.current.buildings)).roads;e.startObstacles=streetObstacles(props.current.buildings);}
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),e.camera);
      if(ray.intersectObjects(e.city.children,true)[0]?.object.userData.owner)return null;
      const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.11),new THREE.Vector3());
      return point?pickStreetStart(point,e.startRoads.values(),e.startObstacles):null;
    },
    zoom(amount) { const e = engine.current; if (!e||e.walk.enabled) return; e.camera.zoom = THREE.MathUtils.clamp(e.camera.zoom * amount, .4, 3.8); e.camera.updateProjectionMatrix(); e.invalidate(500); },
  }), []);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); }
    catch { setUnavailable(true); return; }
    const mobile=window.matchMedia('(max-width:760px)').matches;
    let pixelRatio=Math.min(window.devicePixelRatio,mobile?1.35:1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D city. WASD moves, Q and E rotate, Shift moves down, and Space moves up. Drag to orbit, scroll to zoom, or select a tower. Use the resident list for keyboard navigation.');
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    const streetLights=new StreetLighting(mobile);scene.add(streetLights.group);
    let lightSourcesRevision=-1;
    const terrain = new WorldTerrain(); scene.add(terrain.group);
    const nature=new WildNature();scene.add(nature.group);
    const camera = new THREE.OrthographicCamera(-32,32,24,-24,.1,5000);
    camera.zoom = .83;
    // Orthographic scale is independent of distance. Stay far enough above the ground
    // that wide zoom and low-angle orbits cannot clip the foreground at the near plane.
    camera.position.set(38,36,46).multiplyScalar(4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0,0,0); controls.enableDamping = !reducedMotion(); controls.dampingFactor = .09;
    controls.minZoom = .4; controls.maxZoom = 3.8; controls.maxPolarAngle = Math.PI / 2 - .045; controls.minPolarAngle = .25;
    controls.enablePan = true; controls.screenSpacePanning = false;
    controls.listenToKeyEvents(renderer.domElement);
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const ambient = new THREE.HemisphereLight('#f2f7ff', '#93aa80', 2.8); scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff3df', 3.1); sun.position.set(35,85,-40);
    sun.castShadow = true;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true; sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 65, bottom: -55, near: 1, far: 200 });
    sun.shadow.bias = -.00008; sun.shadow.normalBias = .015;sun.shadow.radius=1.5; scene.add(sun);
    const city = new THREE.Group(); const planned=new THREE.Group(); const labels=new THREE.Group(),celebrations=new THREE.Group(); scene.add(city, planned, labels,celebrations);
    const labelRenderer=new CSS2DRenderer();labelRenderer.domElement.className='score-label-layer';
    el.appendChild(labelRenderer.domElement);
    const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(el.clientWidth,el.clientHeight,{samples:mobile?2:4}));
    composer.setPixelRatio(pixelRatio);
    const renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
    const outline=new OutlinePass(new THREE.Vector2(el.clientWidth,el.clientHeight),scene,camera);
    outline.visibleEdgeColor.set('#ffffff');outline.hiddenEdgeColor.set('#000000');
    outline.edgeStrength=4;outline.edgeThickness=1.4;outline.edgeGlow=0;
    composer.addPass(outline);
    const output=new OutputPass();composer.addPass(output);
    const refreshShadows=()=>{renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;};
    let lastActorShadow=0;

    let idleTimer:ReturnType<typeof setTimeout>|undefined;
    let frame:number|undefined,continuousUntil=0,previousTime=performance.now(),renderSamples=0,renderAverage=0;
    function invalidate(duration=0){clearTimeout(idleTimer);idleTimer=undefined;continuousUntil=Math.max(continuousUntil,performance.now()+duration);if(frame===undefined)frame=requestAnimationFrame(animate);}
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; const view = window.innerWidth<=760?Math.max(26,19*h/w):26;
      camera.left = -view * w / h; camera.right = view * w / h; camera.top = view; camera.bottom = -view;
      camera.updateProjectionMatrix();
      if(engine.current){engine.current.walk.camera.aspect=w/h;engine.current.walk.camera.updateProjectionMatrix();}
      renderer.setSize(w,h);composer.setSize(w,h);labelRenderer.setSize(w,h);
      const bounds=el.getBoundingClientRect(),appBounds=el.closest('.app')?.getBoundingClientRect();
      el.parentElement?.style.setProperty('--street-center-x',`${bounds.left+bounds.width/2-(appBounds?.left||0)}px`);
      el.parentElement?.style.setProperty('--street-center-y',`${bounds.top+bounds.height/2-(appBounds?.top||0)}px`);
      if(engine.current)engine.current.shadowsDirty=true;
      invalidate();
    }
    const walk=new StreetWalk(renderer.domElement,()=>invalidate(250),(locked,blocked)=>props.current.onMouseLock?.(locked,blocked));
    const activeCamera=()=>walk.enabled?walk.camera:camera;
    const startPaths=new THREE.Group(),startMarker=new THREE.Group(),decorationOverlay=new THREE.Group(),owned=new OwnedNeighbors(()=>invalidate());scene.add(startPaths,startMarker,decorationOverlay,owned.group);
    const assets=new CityAssets(city);
    const interactions=new StreetInteraction(renderer.domElement,city,walk,()=>({buildings:props.current.buildings,ownerId:props.current.ownerId,lightsOn:props.current.lightsOn,paused:props.current.navigationPaused||!props.current.pageVisible,onSave:draft=>props.current.onStreetSave?.(draft)??Promise.resolve(false),onCancel:()=>props.current.onStreetDraftCancel?.(),onState:state=>props.current.onStreetState?.(state)}),()=>invalidate(300),owned.group);scene.add(interactions.group);
    engine.current = { assets,nature,streetLights,owned,interactions,scene, renderer, camera, controls, walk, decorationOverlay,startPaths,startMarker,startRoads:new Map(),startObstacles:[],city, planned, labels, celebrations, outline, focus: null, night: false, resize, invalidate, shadowsDirty:true };
    resize(); const observer = new ResizeObserver(resize); observer.observe(el);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 }; let lastPan = '0,0'; let pointerActive = false;
    const activePointers=new Set<number>();let multiTouch=false,tapMoved=false;
    const pointerDown = (e: PointerEvent) => { renderer.domElement.focus({preventScroll:true}); activePointers.add(e.pointerId);pointerActive=true;if(activePointers.size>1)multiTouch=true;else{multiTouch=false;tapMoved=false;down={x:e.clientX,y:e.clientY};}invalidate(500); };
    const pointerUp = (e: PointerEvent) => {
      if(!activePointers.has(e.pointerId))return;activePointers.delete(e.pointerId);pointerActive=activePointers.size>0;
      if(walk.enabled||multiTouch||tapMoved)return;
      if (Math.hypot(e.clientX-down.x,e.clientY-down.y)>6 || e.button !== 0) return;
      const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
      raycaster.setFromCamera(pointer,activeCamera());
      if(props.current.decorationOwner){
        const own=props.current.buildings.find(b=>b.id===props.current.decorationOwner);
        const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.115),new THREE.Vector3());
        if(own&&point){const origin=plotPosition(own.x,own.z);props.current.onDecorationPosition?.(Math.round((point.x-origin.x)*20)/20,Math.round((point.z-origin.z)*20)/20);}return;
      }
      if(props.current.pickingStreet)return;
      if(props.current.placementMode){
        const preview=raycaster.intersectObjects(planned.children,true).find(v=>v.object.userData.placement);
        if(preview)props.current.onPlacement?.(preview.object.userData.placement);
        return;
      }
      const hit = raycaster.intersectObjects(city.children,true).find(v => v.object.userData.owner||v.object.userData.project);
      if (hit?.object.userData.project) props.current.onProject(hit.object.userData.project);
      else if (hit) props.current.onSelect(hit.object.userData.owner);
    };
    const move = (e: PointerEvent) => {
      if(pointerActive&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)tapMoved=true;
      const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
      raycaster.setFromCamera(pointer,activeCamera());
      if(props.current.placementMode){
        renderer.domElement.style.cursor=raycaster.intersectObjects(planned.children,true).some(v=>v.object.userData.placement)?'pointer':'grab';
        return;
      }
      if(walk.enabled||props.current.decorationOwner){renderer.domElement.style.cursor=walk.enabled&&walk.mouseLocked?'none':'crosshair';return;}
      if(props.current.pickingStreet){
        const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.11),new THREE.Vector3()),e=engine.current;
        const visible=raycaster.intersectObjects(city.children,true)[0];
        const start=point&&e&&!visible?.object.userData.owner?pickStreetStart(point,e.startRoads.values(),e.startObstacles):null;
        renderer.domElement.style.cursor=start?'crosshair':'not-allowed';props.current.onStreetPick?.(start);return;
      }
      renderer.domElement.style.cursor = raycaster.intersectObjects(city.children,true).some(v => v.object.userData.owner||v.object.userData.project) ? 'pointer' : 'grab';
    };
    const chooseStreet=(event:MouseEvent)=>{
      if(!props.current.pickingStreet||event.button!==0||tapMoved||multiTouch)return;
      const r=renderer.domElement.getBoundingClientRect(),e=engine.current;if(!e)return;
      pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);
      const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.11),new THREE.Vector3());
      const visible=raycaster.intersectObjects(city.children,true)[0];
      const start=point&&!visible?.object.userData.owner?pickStreetStart(point,e.startRoads.values(),e.startObstacles):null;
      if(start)props.current.onStreetEnter?.(start);
    };
    const pointerCancel = (event:PointerEvent) => {activePointers.delete(event.pointerId);pointerActive=activePointers.size>0;multiTouch=true;};
    const viewDirection=new THREE.Vector3(),groundCenter=new THREE.Vector3();
    const viewedGround=()=>{
      if(walk.enabled)return groundCenter.set(walk.camera.position.x,0,walk.camera.position.z);
      viewDirection.copy(controls.target).sub(camera.position).normalize();
      return groundCenter.copy(camera.position).addScaledVector(viewDirection,-camera.position.y/viewDirection.y);
    };
    const panEnd = () => {
      const ground=viewedGround();
      const position=plotCoordinates(ground.x,ground.z);
      const x = Math.round(position.x / 4) * 4, z = Math.round(position.z / 4) * 4;
      if (`${x},${z}` !== lastPan) { lastPan = `${x},${z}`; props.current.onPan(x,z); }
    };
    const keyboard=new CameraKeyboard(camera,controls,panEnd,()=>invalidate(250));
    const keyUp = (e: KeyboardEvent) => { if(e.key.startsWith('Arrow'))panEnd(); };
    renderer.domElement.addEventListener('pointerdown',pointerDown); renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('click',chooseStreet);
    renderer.domElement.addEventListener('pointercancel',pointerCancel);
    renderer.domElement.addEventListener('keyup',keyUp);
    let controlsActive=false;
    const controlsStart=()=>{controlsActive=true;invalidate();};
    const controlsEnd=()=>{controlsActive=false;panEnd();invalidate(900);};
    renderer.domElement.addEventListener('pointermove', move);controls.addEventListener('start',controlsStart);controls.addEventListener('end',controlsEnd);
    const cameraDirection = new THREE.Vector3();
    const streetSky=new THREE.Color();
    const previousShadowGround=new THREE.Vector3(Number.POSITIVE_INFINITY,0,Number.POSITIVE_INFINITY);
    let lastKeyboardPan=0;
    function animate(now:number) {
      frame=undefined;
      const elapsed=(now-previousTime)/1000,seconds=Math.min(.05,elapsed);previousTime=now;
      const e = engine.current;
      if(document.hidden)return;
      keyboard.enabled=!walk.enabled&&!props.current.decorationOwner;
      const navigating=walk.enabled?walk.update(seconds):keyboard.update(seconds);
      if(navigating&&e)e.focus=null;
      if (e?.focus&&!walk.enabled) {
        const delta = e.focus.clone().sub(controls.target);
        const step = reducedMotion() ? 1 : .08;
        controls.target.addScaledVector(delta,step); camera.position.addScaledVector(delta,step);
        if (delta.length() < .03) { e.focus = null; panEnd(); }
      }
      const light=props.current.lighting;
      ambient.intensity = THREE.MathUtils.lerp(.8,2.1,light.daylight);
      ambient.color.set(light.ambientSky);ambient.groundColor.set(light.ambientGround);
      sun.intensity = THREE.MathUtils.lerp(.16,3.5,light.daylight);
      sun.color.set(light.sunColor);
      if(!walk.enabled&&!props.current.decorationOwner)controls.update();
      // Keep the orthographic foreground in front of the camera, even near the horizon.
      if(!walk.enabled){
        cameraDirection.copy(camera.position).sub(controls.target).normalize();
        const distance=Math.max(280,(camera.top/camera.zoom*Math.sqrt(1-cameraDirection.y**2)+2-controls.target.y)/Math.max(.04,cameraDirection.y));
        camera.position.copy(controls.target).addScaledVector(cameraDirection,distance);
        const far=Math.max(5000,distance*4);
        if(Math.abs(camera.far-far)>.1){camera.far=far;camera.updateProjectionMatrix();}
      }
      const ground=viewedGround();
      const shadowExtent=walk.enabled?18:55,shadowTop=walk.enabled?24:65;
      if(sun.shadow.camera.right!==shadowExtent){Object.assign(sun.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowTop,bottom:-shadowExtent});sun.shadow.camera.updateProjectionMatrix();if(e)e.shadowsDirty=true;}
      sun.target.position.set(ground.x,0,ground.z);sun.target.updateMatrixWorld();
      sun.position.set(ground.x-Math.cos(light.sunPhase)*45,30+light.daylight*55,ground.z-40);
      if(e&&(e.shadowsDirty||ground.distanceToSquared(previousShadowGround)>4)){
        refreshShadows();e.shadowsDirty=false;previousShadowGround.copy(ground);
      }
      if(navigating&&now-lastKeyboardPan>=250){panEnd();lastKeyboardPan=now;}
      if(props.current.placementMode){
        for(const object of planned.children){
          const active=object.userData.selectedPlacement;
          const pulse=reducedMotion()?1:active ? .72+Math.sin(now/1000*3.2)*.28 : .86+Math.sin(now/1000*2.2)*.14;
          if(object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial)object.material.uniforms.pulse.value=pulse;
          else if((object instanceof THREE.Mesh || object instanceof THREE.LineSegments) && !Array.isArray(object.material) && typeof object.userData.pulseOpacity==='number')object.material.opacity=object.userData.pulseOpacity*pulse;
        }
      }
      for(const burst of [...celebrations.children]){
        const t=(now-burst.userData.started)/2400;
        if(t>=1){burst.userData.label.element.remove();disposeGroup(burst as THREE.Group);celebrations.remove(burst);continue;}
        const fade=Math.min(1,(1-t)*2),motion=!reducedMotion();
        const ring=burst.userData.ring as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
        ring.scale.setScalar(motion?1+t*1.8:1);ring.material.opacity=.65*fade;
        const glow=burst.userData.glow as THREE.Mesh<THREE.BoxGeometry,THREE.MeshBasicMaterial>;
        glow.material.opacity=.13*fade;
        for(const particle of burst.userData.particles as THREE.Mesh<THREE.BoxGeometry,THREE.MeshBasicMaterial>[]){
          particle.material.opacity=fade;
          if(motion){particle.position.y=particle.userData.y+t*5;particle.rotation.set(t*2,particle.userData.angle+t*2,0);}
        }
      }
      if(assets.process(mobile?3:5)){refreshShadows();outline.selectedObjects=walk.enabled?[]:city.children.filter(mesh=>mesh.userData.owner===props.current.selected||mesh.userData.project===props.current.selected);}
      if(lightSourcesRevision!==city.userData.revision){streetLights.setSources(city);lightSourcesRevision=city.userData.revision;}
      for(const object of city.children){
        const owner=props.current.decorationOwner;
        object.visible=!(owner&&object.userData.owner===owner&&(!object.userData.decoration||object.userData.decoration===props.current.decorationDraft?.id))&&!(interactions.carriedId&&object.userData.decoration===interactions.carriedId);
      }
      const renderingCamera=activeCamera();
      if(props.current.pickingStreet){
        const worldPerPixel=(camera.top-camera.bottom)/camera.zoom/Math.max(1,renderer.domElement.clientHeight);
        startMarker.scale.setScalar(worldPerPixel*8/.22);
      }
      const ownedWalking=!document.hidden&&owned.update(elapsed,ground,interactions.carriedId,props.current.decorationDraft?.id);
      if(owned.shadowsDirty&&(!ownedWalking||now-lastActorShadow>=(mobile?200:100))){refreshShadows();owned.shadowsDirty=false;lastActorShadow=now;}
      planned.visible=!walk.enabled;
      interactions.update(outline);
      streetLights.update(ground,light.lightsOn,[interactions.group,decorationOverlay],seconds);
      renderPass.camera=renderingCamera;outline.renderCamera=renderingCamera;outline.enabled=!props.current.decorationOwner&&outline.selectedObjects.length>0;
      if(walk.enabled){
        streetSky.set(light.skyEdge);scene.background=streetSky;
        if(!(scene.fog instanceof THREE.Fog))scene.fog=new THREE.Fog(streetSky,65,140);
        else scene.fog.color.copy(streetSky);
      }else{scene.background=null;scene.fog=null;}
      terrain.update(renderingCamera,light.night);
      if(nature.update(ground))refreshShadows();
      streetLights.surface.bind(scene);
      const renderStarted=performance.now();composer.render(seconds);
      const renderTime=performance.now()-renderStarted;
      if(mobile&&(navigating||pointerActive||Boolean(e?.focus))){
        renderAverage=renderSamples?renderAverage*.92+renderTime*.08:renderTime;renderSamples++;
        if(renderSamples>=60){
          const next=renderAverage>22?Math.max(1,pixelRatio-.15):renderAverage<11?Math.min(Math.min(window.devicePixelRatio,1.35),pixelRatio+.1):pixelRatio;
          if(Math.abs(next-pixelRatio)>.01){pixelRatio=next;renderer.setPixelRatio(pixelRatio);composer.setPixelRatio(pixelRatio);resize();}
          renderSamples=0;renderAverage=0;
        }
      }
      if(labels.children.length||celebrations.children.length)labelRenderer.render(scene,renderingCamera);
      const nextDetail=walk.enabled?0:detailForZoom(camera.zoom,props.current.lodEnabled);
      if(nextDetail!==detailRef.current){detailRef.current=nextDetail;setDetail(nextDetail);}
      const active=Boolean(assets.pending||ownedWalking||navigating||controlsActive||e?.focus||props.current.placementMode||celebrations.children.length||now<continuousUntil);
      if(active)invalidate();else if(Number.isFinite(owned.nextUpdate))idleTimer=setTimeout(()=>invalidate(),Math.max(16,owned.nextUpdate*1000));
    }
    const visibility=()=>{if(!document.hidden){previousTime=performance.now();invalidate();}};document.addEventListener('visibilitychange',visibility);
    invalidate();
    return () => {
      document.removeEventListener('visibilitychange',visibility);
      clearTimeout(idleTimer);if(frame!==undefined)cancelAnimationFrame(frame); observer.disconnect(); keyboard.dispose(); interactions.dispose();streetLights.dispose();walk.dispose(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('click',chooseStreet);
      renderer.domElement.removeEventListener('pointercancel',pointerCancel);
      renderer.domElement.removeEventListener('keyup',keyUp);
      renderer.domElement.removeEventListener('pointermove',move);controls.removeEventListener('start',controlsStart);controls.removeEventListener('end',controlsEnd); terrain.dispose();nature.dispose();owned.dispose();disposeGroup(decorationOverlay);disposeGroup(startPaths);disposeGroup(startMarker); assets.dispose();disposeGroup(planned);celebrations.children.forEach(b=>b.userData.label.element.remove());disposeGroup(celebrations);
      outline.dispose();output.dispose();composer.dispose();renderer.dispose();
      labels.clear();labelRenderer.domElement.remove();
      renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  useEffect(()=>{const e=engine.current;if(!e)return;e.owned.rebuild(buildings);e.nature.setBuildings(buildings);e.invalidate();},[buildings]);
  useEffect(()=>{engine.current?.walk.setBuildings(buildings,engine.current?.interactions.carriedId);},[buildings]);


  useEffect(()=>{
    const e=engine.current;if(!e)return;
    if(streetView){
      if(!streetStart||!e.walk.startAt(streetStart)){props.current.onStreetExit?.();return;}
      e.focus=null;e.walk.setEnabled(true);e.controls.enabled=false;
      e.outline.selectedObjects=[];
      const position=plotCoordinates(streetStart.point.x,streetStart.point.z);
      props.current.onPan(Math.round(position.x/4)*4,Math.round(position.z/4)*4);
      e.renderer.domElement.setAttribute('aria-label','Street view. Mouse to look, WASD to walk. Click your highlighted items to pick up or place. R rotates, Escape cancels and releases the mouse.');
      e.renderer.domElement.focus({preventScroll:true});
    }else{
      e.walk.setEnabled(false);e.controls.enabled=true;
      e.outline.selectedObjects=e.city.children.filter(mesh=>mesh.userData.owner===props.current.selected||mesh.userData.project===props.current.selected);
      e.renderer.domElement.setAttribute('aria-label','Interactive 3D city. WASD moves, Q and E rotate. Drag to orbit, scroll to zoom, or select a tower.');
      const position=plotCoordinates(e.controls.target.x,e.controls.target.z);
      props.current.onPan(Math.round(position.x/4)*4,Math.round(position.z/4)*4);
    }
    e.invalidate(500);
    // Entry is intentional: selecting another resident must not respawn the walker.
  },[streetView,streetStart]);

  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.startPaths);
    e.startPaths.visible=pickingStreet;e.startMarker.visible=pickingStreet;
    if(pickingStreet){
      e.startRoads=streetNetwork(buildings,neighborhoodDensity(buildings)).roads;
      e.startObstacles=streetObstacles(buildings);
      if(streetStart&&!canWalk(streetStart.point,e.startObstacles))props.current.onStreetPick?.(null);
      drawStreetChoices(e.startPaths,e.startRoads,e.startObstacles);
      e.focus=null;e.renderer.domElement.focus({preventScroll:true});
    }
    e.invalidate();
  },[pickingStreet,buildings]);

  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.startMarker);
    if(pickingStreet&&streetStart)drawStreetStart(e.startMarker,streetStart.point);
    e.invalidate();
  },[pickingStreet,streetStart]);

  useEffect(()=>{
    if(!pickingStreet)return;
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape')props.current.onStreetExit?.();};
    window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);
  },[pickingStreet]);

  useEffect(()=>{if(streetDraft&&streetView)engine.current?.interactions.begin(streetDraft,preserveStreetDraft);},[streetDraft,streetView,preserveStreetDraft]);

  useEffect(()=>{engine.current?.walk.setPaused(navigationPaused||!pageVisible);},[navigationPaused,pageVisible]);

  useEffect(()=>{
    const e=engine.current,own=buildings.find(b=>b.id===decorationOwner);if(!e||!own)return;
    const saved={position:e.camera.position.clone(),target:e.controls.target.clone(),zoom:e.camera.zoom};
    const origin=plotPosition(own.x,own.z);e.focus=null;e.controls.enabled=false;
    const target={x:origin.x+(props.current.decorationDraft?.x??0),z:origin.z+(props.current.decorationDraft?.z??.65)};
    e.controls.target.set(target.x,0,target.z);e.camera.position.set(target.x,280,target.z+.01);e.camera.lookAt(e.controls.target);e.camera.zoom=3.8;e.camera.updateProjectionMatrix();
    e.outline.selectedObjects=[];e.shadowsDirty=true;e.invalidate(400);e.renderer.domElement.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')props.current.onDecorationCancel?.();};window.addEventListener('keydown',key);
    return()=>{
      window.removeEventListener('keydown',key);e.camera.position.copy(saved.position);e.controls.target.copy(saved.target);e.camera.zoom=saved.zoom;e.camera.lookAt(saved.target);e.camera.updateProjectionMatrix();e.controls.enabled=true;e.focus=null;e.shadowsDirty=true;e.invalidate(500);
    };
  },[decorationOwner]);

  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.decorationOverlay);
    const own=buildings.find(b=>b.id===decorationOwner);
    if(own&&decorationDraft)drawDecorationPlacement(e.decorationOverlay,own,decorationDraft,lightsOn);
    e.shadowsDirty=true;e.invalidate();
  },[decorationOwner,decorationDraft,buildings,lightsOn]);


  useEffect(()=>{
    const e=engine.current;if(!e)return;
    const nextDetail=e.walk.enabled?0:detailForZoom(e.camera.zoom,lodEnabled);
    if(nextDetail!==detailRef.current){detailRef.current=nextDetail;setDetail(nextDetail);}
    e.invalidate();
  },[lodEnabled]);

  useEffect(()=>{
    const e=engine.current;if(!e||!placementMode||!placementOrigin)return;
    const position=plotPosition(placementOrigin.x,placementOrigin.z);
    e.focus=new THREE.Vector3(position.x,0,position.z);e.invalidate(1600);
  },[placementMode,placementOrigin?.x,placementOrigin?.z]);
  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.night = night;
    e.assets.reconcile(buildings.filter(b=>Math.abs(b.x-center.x)<=VIEW_RADIUS&&Math.abs(b.z-center.z)<=VIEW_RADIUS),night,lightsOn,projects,detail,center);
    e.outline.selectedObjects=e.walk.enabled?[]:e.city.children.filter(mesh=>mesh.userData.owner===props.current.selected||mesh.userData.project===props.current.selected);
    e.shadowsDirty=true;e.invalidate();
  }, [buildings,night,lightsOn,center.x,center.z,projects,detail]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;
    const density=neighborhoodDensity(buildings);
    for(const b of buildings){
      let previous=previousLevels.current.get(b.id);previousLevels.current.set(b.id,b.level);
      if(b.id===ownerId){
        if(!pageVisible)continue;
        try{
          const key=`cities-seen-level-v1:${b.id}`,stored=localStorage.getItem(key);
          if(stored!==null&&Number.isFinite(Number(stored)))previous=Number(stored);
          localStorage.setItem(key,String(b.level));
        }catch{/* Fall back to levels observed during this visit. */}
      }
      if(!pageVisible||previous===undefined||b.level<=previous||Math.abs(b.x-center.x)>VIEW_RADIUS||Math.abs(b.z-center.z)>VIEW_RADIUS)continue;
      if(e.celebrations.children.length<5)e.celebrations.add(upgradeCelebration(b,density(b.x,b.z),previous));
    }
    if(e.celebrations.children.length)e.invalidate(2500);
  },[buildings,center.x,center.z,ownerId,pageVisible]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.planned);
    if(placementMode)drawPlacementHolograms(e.planned,previews,placementChoice);
    else if(debugScores)drawPlotPreviews(e.planned,previews,buildings);
    e.invalidate();
  },[debugScores,previews,buildings,placementMode,placementChoice]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;e.labels.clear();
    for(const project of projects){
      if(project.funded>=project.goal)continue;
      if(Math.abs(project.x-center.x)>VIEW_RADIUS||Math.abs(project.z-center.z)>VIEW_RADIUS)continue;
      const element=document.createElement('button');element.className='public-site-label';
      element.textContent=`${project.name} · ${Math.round(project.funded/project.goal*100)}%`;
      element.onclick=()=>props.current.onProject(project.id);element.setAttribute('aria-label',`Open public project ${project.name}`);
      const label=new CSS2DObject(element),position=plotPosition(project.x,project.z);label.position.set(position.x,3,position.z);e.labels.add(label);
    }
    if(!debugScores){e.invalidate();return;}
    const scoreAt=neighborhoodScores(buildings);
    for(const b of buildings){
      if(Math.abs(b.x-center.x)>VIEW_RADIUS||Math.abs(b.z-center.z)>VIEW_RADIUS)continue;
      const score=scoreAt(b.x,b.z),element=document.createElement('div');
      element.className=`building-score ${b.id===selected?'is-selected':''}`;
      element.dataset.settlement=tierForLevel(b.level).kind;
      element.textContent=`L${b.level} · T${tierIndex(b.level)+1}\n${b.xp} XP`;
      element.setAttribute('aria-label',`${b.name}: level ${b.level}, tier ${tierIndex(b.level)+1}, ${b.xp} XP, road score ${score.total.toFixed(3)}`);
      const label=new CSS2DObject(element),position=plotPosition(b.x,b.z);
      label.position.set(position.x,buildingForm(b,score.total).topY+.55,position.z);
      e.labels.add(label);
    }
    const next=previews[0];
    if(next){
      const element=document.createElement('div');element.className='building-score plot-preview-label';
      element.textContent=`Next plot · L1 ${tierForLevel(1).name}`;
      element.setAttribute('aria-label',`Next available plot ${next.plan.x}, ${next.plan.z}, ${next.plan.layout} layout, frontage ${next.plan.frontage.key}, predicted score ${next.score.total.toFixed(3)}`);
      const label=new CSS2DObject(element);label.position.set(next.plan.position.x,next.form.topY+.6,next.plan.position.z);e.labels.add(label);
    }
    e.invalidate();
  },[buildings,selected,debugScores,previews,center.x,center.z,projects]);
  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.outline.selectedObjects=e.walk.enabled?[]:e.city.children.filter(mesh=>mesh.userData.owner===selected||mesh.userData.project===selected);
    e.invalidate();
  }, [selected,buildings]);
  useEffect(()=>{const e=engine.current;if(e){e.shadowsDirty=true;e.invalidate();}},[lighting]);
  return <div className="scene" ref={host}>{unavailable && <div className="webgl-fallback"><h2>Your city needs WebGL</h2><p>Enable hardware acceleration or open a browser that supports WebGL. You can still use the resident list and building controls.</p></div>}</div>;
});

function drawDecorationPlacement(group:THREE.Group,building:Building,draft:DecorationDraft,lightsOn:boolean){
  const surface=(polygon:StreetPoint[],height:number,color:string,opacity:number)=>{
    if(polygon.length<3)return;
    const shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(p.x,-p.z))),geometry=new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:false}));mesh.position.y=height;mesh.renderOrder=2;group.add(mesh);
    const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(polygon.map(p=>new THREE.Vector3(p.x,height+.002,p.z))),new THREE.LineBasicMaterial({color}));line.renderOrder=3;group.add(line);
  };
  surface(insetPlotPolygon(plotPlan(building.x,building.z),DECORATION_ROAD_INSET),.15,'#8bbd80',.45);
  surface(buildingForm(building,1).foundationOutline,.16,'#8d9c93',1);
  if(draft.kind==='base_shop')for(const slot of baseShopSlots(building))surface(decorationFootprint(building,draft.kind,slot),slot.y+.03,placementError(building,draft.kind,slot,draft.id)?'#c88075':'#438e6c',.8);
  if(draft.x===null||draft.z===null)return;
  const position={x:draft.x,z:draft.z,rotation:draft.rotation},error=placementError(building,draft.kind,position,draft.id),color=error?'#c88075':'#438e6c';
  surface(decorationFootprint(building,draft.kind,position),.18,color,.65);
  const origin=plotPosition(building.x,building.z),preview=new THREE.Group(),attachment=draft.kind==='base_shop'?shopAttachment(building,position):null;preview.position.set(origin.x+draft.x,attachment?.y??.19,origin.z+draft.z);preview.rotation.y=attachment?.angle??draft.rotation*Math.PI/2;group.add(preview);
  const material=new THREE.MeshStandardMaterial({color,transparent:true,opacity:.7,roughness:1});
  const box=(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  decorationModel(preview,draft.kind,lightsOn,box,()=>material);
}

function drawStreetChoices(group:THREE.Group,roads:ReturnType<typeof streetNetwork>['roads'],obstacles:StreetPoint[][]){
  const segments:{x:number;z:number;length:number;angle:number}[]=[];
  for(const road of roads.values()){
    const [a,b]=road.points,length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.max(1,Math.ceil(length/.3));
    for(let i=0;i<count;i++){
      const start={x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count};
      const end={x:a.x+(b.x-a.x)*(i+1)/count,z:a.z+(b.z-a.z)*(i+1)/count};
      const middle={x:(start.x+end.x)/2,z:(start.z+end.z)/2};
      if(canWalk(start,obstacles)&&canWalk(middle,obstacles)&&canWalk(end,obstacles))segments.push({...middle,length:length/count,angle:Math.atan2(b.x-a.x,b.z-a.z)});
    }
  }
  const geometry=new THREE.BoxGeometry(.16,.008,1);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:'#258bda',transparent:true,opacity:.88,depthWrite:false}),segments.length);
  const transform=new THREE.Object3D();
  segments.forEach((segment,i)=>{transform.position.set(segment.x,.145,segment.z);transform.rotation.y=segment.angle;transform.scale.set(1,1,segment.length+.008);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
  mesh.computeBoundingSphere();group.add(mesh);
}
function drawStreetStart(group:THREE.Group,point:StreetPoint){
  group.position.set(point.x,.15,point.z);
  const material=new THREE.MeshBasicMaterial({color:'#258bda',depthTest:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.28,.39,32),material);ring.rotation.x=-Math.PI/2;ring.renderOrder=5;group.add(ring);
  const pin=new THREE.Mesh(new THREE.ConeGeometry(.24,.6,16),material);pin.rotation.z=Math.PI;pin.position.y=.6;pin.renderOrder=5;group.add(pin);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),new THREE.MeshBasicMaterial({color:'#ffd36d',depthTest:false}));head.position.y=1.1;head.renderOrder=5;group.add(head);
}

function upgradeCelebration(building:Building,density:number,previousLevel=building.level-1){
  const burst=new THREE.Group(),position=plotPosition(building.x,building.z),form=buildingForm(building,density);
  burst.position.set(position.x,0,position.z);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,1.95,48),new THREE.MeshBasicMaterial({color:'#ffd784',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.22;burst.add(ring);
  const glow=new THREE.Mesh(new THREE.BoxGeometry(form.footprint.w+.15,form.height+.1,form.footprint.d+.15),new THREE.MeshBasicMaterial({color:'#ffe4a2',transparent:true,opacity:.13,depthWrite:false}));
  glow.position.y=form.baseY+form.height/2;glow.rotation.y=plotPlan(building.x,building.z).rotation;burst.add(glow);
  const particles:THREE.Mesh<THREE.BoxGeometry,THREE.MeshBasicMaterial>[]=[];
  if(!reducedMotion())for(let i=0;i<24;i++){
    const angle=i/24*Math.PI*2,radius=2+(i%4)*.35,y=form.topY*.2+(i%7)*Math.max(.5,form.height/9);
    const particle=new THREE.Mesh(new THREE.BoxGeometry(.12,.18,.12),new THREE.MeshBasicMaterial({color:i%3?'#ffd784':'#fff4d7',transparent:true,depthWrite:false}));
    particle.position.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius);particle.userData={angle,y};burst.add(particle);particles.push(particle);
  }
  const element=document.createElement('div');element.style.pointerEvents='none';element.setAttribute('role','status');
  const caption=document.createElement('div');caption.className='tower-upgrade-label';element.appendChild(caption);
  const tier=tierForLevel(building.level);
  caption.textContent=`Level ${building.level}!${tierIndex(previousLevel)!==tierIndex(building.level) ? ` · ${tier.name}` : ''}`;
  const label=new CSS2DObject(element);label.position.y=form.topY+1.8;burst.add(label);
  burst.userData={started:performance.now(),ring,glow,particles,label};return burst;
}

function drawPlacementHolograms(group:THREE.Group,previews:PlotPreview[],selected:string|null){
  for(const {plan} of previews){
    const key=`${plan.x},${plan.z}`,active=key===selected;
    const color=active?'#238bff':'#71d5fa',height=active ? 7 : 5,bottom=.16;
    // The ground footprint and every wall follow the actual parcel boundary.
    const shape=new THREE.Shape(plan.corners.map(p=>new THREE.Vector2(p.x,-p.z)));
    const floorMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:active ? .28 : .12,depthWrite:false,side:THREE.DoubleSide});
    const floor=new THREE.Mesh(new THREE.ShapeGeometry(shape),floorMaterial);
    floor.rotation.x=-Math.PI/2;floor.position.y=bottom;
    floor.userData={placement:key,selectedPlacement:active,pulseOpacity:floorMaterial.opacity};group.add(floor);
    const vertices:number[]=[],uvs:number[]=[],boundary:number[]=[];
    plan.corners.forEach((a,i)=>{
      const b=plan.corners[(i+1)%plan.corners.length];
      vertices.push(a.x,bottom,a.z,b.x,bottom,b.z,b.x,bottom+height,b.z,
        a.x,bottom,a.z,b.x,bottom+height,b.z,a.x,bottom+height,a.z);
      uvs.push(0,0,1,0,1,1,0,0,1,1,0,1);
      boundary.push(a.x,bottom,a.z,b.x,bottom,b.z);
    });
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const wallMaterial=new THREE.ShaderMaterial({
      uniforms:{color:{value:new THREE.Color(color)},strength:{value:active ? .8 : .55},pulse:{value:1}},
      vertexShader:'varying float wallHeight; void main(){wallHeight=uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 color; uniform float strength; uniform float pulse; varying float wallHeight; void main(){float fade=pow(1.0-wallHeight,1.6); gl_FragColor=vec4(color,strength*fade*pulse);}',
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
    });
    const walls=new THREE.Mesh(geometry,wallMaterial);walls.userData={placement:key,selectedPlacement:active};group.add(walls);
    const outlineGeometry=new THREE.BufferGeometry();outlineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(boundary,3));
    const outlineMaterial=new THREE.LineBasicMaterial({color,transparent:true,opacity:active ? 1 : .75,depthWrite:false});
    const outline=new THREE.LineSegments(outlineGeometry,outlineMaterial);
    outline.userData={pulseOpacity:outlineMaterial.opacity,selectedPlacement:active};group.add(outline);
  }
}

function drawPlotPreviews(group:THREE.Group,previews:PlotPreview[],buildings:Building[]){
  const material=new THREE.LineBasicMaterial({color:'#a4d9df',transparent:true,opacity:.6,depthWrite:false});
  const vertices:number[]=[];
  const line=(a:THREE.Vector3,b:THREE.Vector3)=>vertices.push(...a.toArray(),...b.toArray());
  const densityAt=neighborhoodDensity(buildings),actual=streetNetwork(buildings,densityAt),shown=new Set<string>(),shownNodes=new Set<string>();
  const obstacles=roadObstacles(buildings,densityAt),edges=new Map<string,{a:GroundPoint;b:GroundPoint;count:number}>();
  const outlineSurface=(polygon:GroundPoint[])=>{
    for(const piece of clearRoadSurface(polygon,obstacles))piece.forEach((a,i)=>{
      const b=piece[(i+1)%piece.length],key=[`${a.x.toFixed(5)},${a.z.toFixed(5)}`,`${b.x.toFixed(5)},${b.z.toFixed(5)}`].sort().join(':');
      const previous=edges.get(key);if(previous)previous.count++;else edges.set(key,{a,b,count:1});
    });
  };
  const groundLine=(a:GroundPoint,b:GroundPoint)=>line(new THREE.Vector3(a.x,.135,a.z),new THREE.Vector3(b.x,.135,b.z));
  for(const {plan,form,streets,junctions} of previews){
    for(const road of streets){
      if(shown.has(road.key)||actual.roads.has(road.key))continue;shown.add(road.key);
      const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
      for(let step=0;step<8;step++){
        const at=(t:number,sign:number)=>{const score=streetDensity(road,t),radius=(roadWidth(score)+roadShoulder(score))/2;return {x:a.x+dx*t+nx*radius*sign,z:a.z+dz*t+nz*radius*sign};};
        outlineSurface([at(step/8,1),at(step/8,-1),at((step+1)/8,-1),at((step+1)/8,1)]);
      }
    }
    for(const node of junctions){
      if(node.cap===false||shownNodes.has(node.key)||actual.junctions.has(node.key))continue;shownNodes.add(node.key);
      const radius=(node.turnRadius||0)+(roadWidth(node.density)+roadShoulder(node.density))/2+.035;
      const points=Array.from({length:12},(_,i)=>({x:node.position.x+Math.cos(i/12*Math.PI*2)*radius,z:node.position.z+Math.sin(i/12*Math.PI*2)*radius}));
      outlineSurface(points);
    }
    const rotate=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),plan.rotation).add(new THREE.Vector3(plan.position.x,0,plan.position.z));
    const {w,d}=form.footprint;
    const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
    for(let i=0;i<4;i++){
      const [x,z]=corners[i],[nx,nz]=corners[(i+1)%4];
      line(rotate(x,form.baseY,z),rotate(nx,form.baseY,nz));
      line(rotate(x,form.baseY+form.height,z),rotate(nx,form.baseY+form.height,nz));
      line(rotate(x,form.baseY,z),rotate(x,form.baseY+form.height,z));

    }
    plan.corners.forEach((a,i)=>groundLine(a,plan.corners[(i+1)%plan.corners.length]));
    // Entrance arrow makes opposite-facing homes distinguishable in a top view.
    const end=Math.max(d/2+.4,plan.frontage.distance-.4);
    line(rotate(0,.15,d/2),rotate(0,.15,end));
    line(rotate(-.23,.15,end-.28),rotate(0,.15,end));line(rotate(.23,.15,end-.28),rotate(0,.15,end));
  }
  for(const {a,b,count} of edges.values())if(count===1)groundLine(a,b);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  group.add(new THREE.LineSegments(geometry,material));
}
