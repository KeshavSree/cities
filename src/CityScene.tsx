import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { COLORS, type Building } from '../shared/types';
import { coastZ, plotPosition, worldHash, PLOT_SPACING, VIEW_RADIUS } from '../shared/world';
import { WorldTerrain } from './WorldTerrain';
import type { CityLighting } from './lighting';
import { neighborhoodDensity, neighborhoodScores, settlementType, streetNetwork, streetDensity, roadWidth, roadShoulder, roadColor, shoulderColor, lotPolygon, mixGroundColor, SETTLEMENT_THRESHOLDS, type GroundPoint } from './neighborhood';
import { CameraKeyboard } from './CameraKeyboard';
import { buildingForm } from './buildingForm';
import { plotPlan } from '../shared/plots';
import type { PlotPreview } from './plotPreview';

export interface SceneHandle { focus: (b: Building) => void; reset: () => void; zoom: (amount: number) => void; }
interface Props { buildings: Building[]; selected: string | null; lighting: CityLighting; center: {x:number;z:number}; debugScores:boolean; previews:PlotPreview[]; onSelect: (id: string) => void; onPan: (x: number, z: number) => void; }
const SPACING = PLOT_SPACING;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CityScene = forwardRef<SceneHandle, Props>(function CityScene({ buildings, selected, lighting, center, debugScores, previews, onSelect, onPan }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.OrthographicCamera; controls: OrbitControls; city: THREE.Group; selection: THREE.Group; planned:THREE.Group; labels:THREE.Group; outline:OutlinePass; focus: THREE.Vector3 | null; night: boolean; resize: () => void } | null>(null);
  const props = useRef({ buildings, selected, lighting, onSelect, onPan }); props.current = { buildings, selected, lighting, onSelect, onPan };
  const night=lighting.night;
  const [unavailable, setUnavailable] = useState(false);
  useImperativeHandle(ref, () => ({
    focus(b) { if (engine.current) engine.current.focus = new THREE.Vector3(plotPosition(b.x,b.z).x, 0, plotPosition(b.x,b.z).z); },
    reset() { const e = engine.current; if (!e) return; e.focus = new THREE.Vector3(0,0,0); e.camera.position.set(38, 36, 46).multiplyScalar(4).add(e.controls.target); e.camera.zoom = .83; e.camera.updateProjectionMatrix(); },
    zoom(amount) { const e = engine.current; if (!e) return; e.camera.zoom = THREE.MathUtils.clamp(e.camera.zoom * amount, .4, 3.8); e.camera.updateProjectionMatrix(); },
  }), []);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D city. WASD moves, Q and E rotate, Shift moves down, and Space moves up. Drag to orbit, scroll to zoom, or select a tower. Violet links show invitation connections. Use the resident list for keyboard navigation.');
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    const terrain = new WorldTerrain(); scene.add(terrain.group);
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
    const sun = new THREE.DirectionalLight('#fff3df', 3.1); sun.position.set(-20,40,25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 120 });
    sun.shadow.bias = -.001; sun.shadow.normalBias = .06; scene.add(sun);
    const city = new THREE.Group(); const selection = new THREE.Group(); const planned=new THREE.Group(); const labels=new THREE.Group(); scene.add(city, selection, planned, labels);
    const labelRenderer=new CSS2DRenderer();labelRenderer.domElement.className='score-label-layer';
    el.appendChild(labelRenderer.domElement);
    const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(el.clientWidth,el.clientHeight,{samples:4}));
    composer.addPass(new RenderPass(scene,camera));
    const outline=new OutlinePass(new THREE.Vector2(el.clientWidth,el.clientHeight),scene,camera);
    outline.visibleEdgeColor.set('#ffffff');outline.hiddenEdgeColor.set('#000000');
    outline.edgeStrength=4;outline.edgeThickness=1.4;outline.edgeGlow=0;
    composer.addPass(outline);
    const output=new OutputPass();composer.addPass(output);
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; const view = window.innerWidth < 700 ? 23 : 26;
      camera.left = -view * w / h; camera.right = view * w / h; camera.top = view; camera.bottom = -view;
      camera.updateProjectionMatrix(); renderer.setSize(w,h);composer.setSize(w,h);labelRenderer.setSize(w,h);
    }
    engine.current = { scene, renderer, camera, controls, city, selection, planned, labels, outline, focus: null, night: false, resize };
    resize(); const observer = new ResizeObserver(resize); observer.observe(el);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 }; let lastPan = '0,0'; let pointerActive = false;
    const pointerDown = (e: PointerEvent) => { renderer.domElement.focus({preventScroll:true}); pointerActive = true; down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if(!pointerActive)return;pointerActive=false;
      if (Math.hypot(e.clientX-down.x,e.clientY-down.y)>6 || e.button !== 0) return;
      const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hit = raycaster.intersectObjects(city.children,true).find(v => v.object.userData.owner);
      if (hit) props.current.onSelect(hit.object.userData.owner);
    };
    const move = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(city.children,true).some(v => v.object.userData.owner) ? 'pointer' : 'grab';
    };
    const pointerCancel = () => { pointerActive=false; };
    const viewDirection=new THREE.Vector3(),groundCenter=new THREE.Vector3();
    const viewedGround=()=>{
      viewDirection.copy(controls.target).sub(camera.position).normalize();
      return groundCenter.copy(camera.position).addScaledVector(viewDirection,-camera.position.y/viewDirection.y);
    };
    const panEnd = () => {
      const ground=viewedGround();
      const x = Math.round(ground.x / SPACING / 4) * 4, z = Math.round(ground.z / SPACING / 4) * 4;
      if (`${x},${z}` !== lastPan) { lastPan = `${x},${z}`; props.current.onPan(x,z); }
    };
    const keyboard=new CameraKeyboard(camera,controls,panEnd);
    const keyUp = (e: KeyboardEvent) => { if(e.key.startsWith('Arrow'))panEnd(); };
    renderer.domElement.addEventListener('pointerdown',pointerDown); renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointercancel',pointerCancel);
    renderer.domElement.addEventListener('keyup',keyUp);
    renderer.domElement.addEventListener('pointermove', move); controls.addEventListener('end', panEnd);
    let frame: number;
    const cameraDirection = new THREE.Vector3();
    const warmSun = new THREE.Color('#f0b17d'), middaySun = new THREE.Color('#fff3df');
    let previousTime=performance.now(),lastKeyboardPan=0;
    function animate() {
      frame = requestAnimationFrame(animate);
      const now=performance.now(),seconds=Math.min(.05,(now-previousTime)/1000);previousTime=now;
      const e = engine.current;
      const navigating=keyboard.update(seconds);
      if(navigating&&e)e.focus=null;
      if (e?.focus) {
        const delta = e.focus.clone().sub(controls.target);
        const step = reducedMotion() ? 1 : .08;
        controls.target.addScaledVector(delta,step); camera.position.addScaledVector(delta,step);
        if (delta.length() < .03) { e.focus = null; panEnd(); }
      }
      const light=props.current.lighting;
      ambient.intensity = THREE.MathUtils.lerp(.9,2.8,light.daylight);
      sun.intensity = THREE.MathUtils.lerp(.2,3.1,light.daylight);
      sun.color.copy(warmSun).lerp(middaySun,light.daylight);
      controls.update();
      // Keep the orthographic foreground in front of the camera, even near the horizon.
      cameraDirection.copy(camera.position).sub(controls.target).normalize();
      const distance=Math.max(280,(camera.top/camera.zoom*Math.sqrt(1-cameraDirection.y**2)+2-controls.target.y)/Math.max(.04,cameraDirection.y));
      camera.position.copy(controls.target).addScaledVector(cameraDirection,distance);
      const far=Math.max(5000,distance*4);
      if(Math.abs(camera.far-far)>.1){camera.far=far;camera.updateProjectionMatrix();}
      const ground=viewedGround();
      sun.target.position.set(ground.x,0,ground.z);sun.target.updateMatrixWorld();
      sun.position.set(ground.x+Math.cos(light.sunPhase)*34,12+light.daylight*38,ground.z+25);
      if(navigating&&now-lastKeyboardPan>=250){panEnd();lastKeyboardPan=now;}
      terrain.update(camera,light.night);composer.render(seconds);
      if(labels.children.length)labelRenderer.render(scene,camera);
    }
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); keyboard.dispose(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp);
      renderer.domElement.removeEventListener('pointercancel',pointerCancel);
      renderer.domElement.removeEventListener('keyup',keyUp);
      renderer.domElement.removeEventListener('pointermove',move); terrain.dispose(); disposeGroup(city); disposeGroup(selection);disposeGroup(planned);
      outline.dispose();output.dispose();composer.dispose();renderer.dispose();
      labels.clear();labelRenderer.domElement.remove();
      renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.night = night; disposeGroup(e.city);
    buildCity(e.city,buildings.filter(b=>Math.abs(b.x-center.x)<=VIEW_RADIUS&&Math.abs(b.z-center.z)<=VIEW_RADIUS),night,neighborhoodDensity(buildings));
    e.outline.selectedObjects=e.city.children.filter(mesh=>mesh.userData.owner===props.current.selected);
  }, [buildings,night,center.x,center.z]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.planned);
    if(debugScores)drawPlotPreviews(e.planned,previews);
  },[debugScores,previews]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;e.labels.clear();
    if(!debugScores)return;
    const scoreAt=neighborhoodScores(buildings);
    for(const b of buildings){
      if(Math.abs(b.x-center.x)>VIEW_RADIUS||Math.abs(b.z-center.z)>VIEW_RADIUS)continue;
      const score=scoreAt(b.x,b.z),element=document.createElement('div');
      element.className=`building-score ${b.id===selected?'is-selected':''}`;
      element.dataset.settlement=settlementType(score.total);
      element.textContent=score.total.toFixed(3);
      element.setAttribute('aria-label',`${b.name}: connectivity score ${score.total.toFixed(3)}, ${settlementType(score.total)}`);
      const label=new CSS2DObject(element),position=plotPosition(b.x,b.z);
      label.position.set(position.x,buildingForm(b,score.total).topY+.55,position.z);
      e.labels.add(label);
    }
    const next=previews[0];
    if(next){
      const element=document.createElement('div');element.className='building-score plot-preview-label';
      element.textContent=`Next plot · ${next.score.total.toFixed(3)}`;
      element.setAttribute('aria-label',`Next available plot ${next.plan.x}, ${next.plan.z}, ${next.plan.axis} frontage, predicted score ${next.score.total.toFixed(3)}`);
      const label=new CSS2DObject(element);label.position.set(next.plan.position.x,next.form.topY+.6,next.plan.position.z);e.labels.add(label);
    }
  },[buildings,selected,debugScores,previews,center.x,center.z]);
  useEffect(() => {
    const e = engine.current; if (!e) return; disposeGroup(e.selection);
    e.outline.selectedObjects=e.city.children.filter(mesh=>mesh.userData.owner===selected);
    const b = buildings.find(b=>b.id===selected); if (!b) return;
    const loaded=new Map(buildings.map(tower=>[tower.id,tower]));
    const scoreAt=neighborhoodScores(buildings);
    for(const child of buildings){
      const parent=child.invited_by?loaded.get(child.invited_by):null;
      if(!parent)continue;
      const a=plotPosition(parent.x,parent.z),end=plotPosition(child.x,child.z);
      const start=new THREE.Vector3(a.x,buildingForm(parent,scoreAt(parent.x,parent.z).total).topY+.15,a.z);
      const finish=new THREE.Vector3(end.x,buildingForm(child,scoreAt(child.x,child.z).total).topY+.15,end.z);
      const control=start.clone().add(finish).multiplyScalar(.5);control.y=Math.max(start.y,finish.y)+2;
      const connected=child.id===selected||parent.id===selected;
      const curve=new THREE.QuadraticBezierCurve3(start,control,finish);
      const link=new THREE.Mesh(new THREE.TubeGeometry(curve,16,connected?.045:.025,4,false),new THREE.MeshBasicMaterial({color:'#b6a5ee',transparent:true,opacity:connected?.7:.18,depthWrite:false}));
      e.selection.add(link);
    }
  }, [selected,buildings]);
  return <div className="scene" ref={host}>{unavailable && <div className="webgl-fallback"><h2>Your city needs WebGL</h2><p>Enable hardware acceleration or open a browser that supports WebGL. You can still use the resident list and building controls.</p></div>}</div>;
});

function drawPlotPreviews(group:THREE.Group,previews:PlotPreview[]){
  const material=new THREE.LineBasicMaterial({color:'#a4d9df',transparent:true,opacity:.6,depthWrite:false});
  const vertices:number[]=[];
  const line=(a:THREE.Vector3,b:THREE.Vector3)=>vertices.push(...a.toArray(),...b.toArray());
  for(const {plan,form} of previews){
    const rotate=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),plan.rotation).add(new THREE.Vector3(plan.position.x,0,plan.position.z));
    const {w,d}=form.footprint;
    const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
    for(let i=0;i<4;i++){
      const [x,z]=corners[i],[nx,nz]=corners[(i+1)%4];
      line(rotate(x,form.baseY,z),rotate(nx,form.baseY,nz));
      line(rotate(x,form.baseY+form.height,z),rotate(nx,form.baseY+form.height,nz));
      line(rotate(x,form.baseY,z),rotate(x,form.baseY+form.height,z));
      const a=plan.corners[i],b=plan.corners[(i+1)%4];line(new THREE.Vector3(a.x,.12,a.z),new THREE.Vector3(b.x,.12,b.z));
    }
    // Entrance arrow makes opposite-facing homes distinguishable in a top view.
    const end=Math.max(d/2+.4,plan.frontage.distance-.4);
    line(rotate(0,.15,d/2),rotate(0,.15,end));
    line(rotate(-.23,.15,end-.28),rotate(0,.15,end));line(rotate(.23,.15,end-.28),rotate(0,.15,end));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  group.add(new THREE.LineSegments(geometry,material));
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  group.traverse(o=>{ if (o instanceof THREE.Mesh||o instanceof THREE.LineSegments) { geometries.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) materials.add(m); } });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); group.clear();
}
function buildCity(group: THREE.Group, buildings: Building[], night: boolean,densityAt:(x:number,z:number)=>number) {
  const materials = new Map<string,THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({
      color,flatShading:true,roughness:1,
      emissive:night&&(color==='#f3d795'||color==='#f0daab')?color:'#000000',emissiveIntensity:.55,
    }));
    return materials.get(color)!;
  };
  const box = (parent: THREE.Group, x:number,y:number,z:number,w:number,h:number,d:number,color:string,owner?:string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); mesh.position.set(x,y,z); mesh.castShadow = h>.3; mesh.receiveShadow = true;
    if (owner) mesh.userData.owner = owner; parent.add(mesh); return mesh;
  };
  const taken=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const {roads,junctions}=streetNetwork(buildings,densityAt);
  const surface=(parent:THREE.Group,points:GroundPoint[],height:number,color:string)=>{
    if(points.length<3)return;
    const vertices:number[]=[];
    for(let i=1;i<points.length-1;i++)for(const point of [points[0],points[i+1],points[i]])vertices.push(point.x,height,point.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.receiveShadow=true;parent.add(mesh);
  };
  const strip=(a:GroundPoint,b:GroundPoint,startWidth:number,endWidth:number,height:number,color:string)=>{
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    surface(group,[{x:a.x+nx*startWidth/2,z:a.z+nz*startWidth/2},{x:a.x-nx*startWidth/2,z:a.z-nz*startWidth/2},
      {x:b.x-nx*endWidth/2,z:b.z-nz*endWidth/2},{x:b.x+nx*endWidth/2,z:b.z+nz*endWidth/2}],height,color);
  };
  for(const road of roads.values()){
    const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2},density=streetDensity(road,.5),width=roadWidth(density);
    // Taper toward the shared junction width; each small polygon has one solid color.
    for(let i=0;i<8;i++){
      const start=i/8,end=(i+1)/8,d0=streetDensity(road,start),d1=streetDensity(road,end),dm=streetDensity(road,(start+end)/2);
      const p={x:a.x+dx*start,z:a.z+dz*start},q={x:a.x+dx*end,z:a.z+dz*end};
      strip(p,q,roadWidth(d0)+roadShoulder(d0),roadWidth(d1)+roadShoulder(d1),.055,shoulderColor(dm));
      strip(p,q,roadWidth(d0),roadWidth(d1),.078,roadColor(dm));
    }
    if(settlementType(density)==='urban'){
      const angle=-Math.atan2(dz,dx),nx=-dz/length,nz=dx/length;
      const stripe=box(group,middle.x,.085,middle.z,.7,.008,.035,'#e4dfc5');stripe.rotation.y=angle;
      const sx=middle.x+nx*(width/2+.15),sz=middle.z+nz*(width/2+.15);
      box(group,sx,.8,sz,.07,1.5,.07,'#667e81');
      box(group,sx,1.58,sz,.23,.17,.23,night?'#f0daab':'#d8d8c7');
      if(worldHash(road.x,road.z+(road.horizontal?0:13))>.72){
        const car=box(group,middle.x,.24,middle.z,.9,.27,.43,'#8b9cac');car.rotation.y=angle;
        const top=box(group,middle.x,.42,middle.z,.43,.17,.35,'#c0ced1');top.rotation.y=angle;
      }
    }
  }
  for(const {position,density} of junctions.values()){
    const cap=(radius:number,height:number,color:string)=>surface(group,Array.from({length:12},(_,i)=>({
      x:position.x+Math.cos(i/12*Math.PI*2)*radius,z:position.z+Math.sin(i/12*Math.PI*2)*radius,
    })),height,color);
    cap((roadWidth(density)+roadShoulder(density))/2+.035,.0555,shoulderColor(density));
    cap(roadWidth(density)/2+.025,.079,roadColor(density));
  }
  const gardens=new Set<string>();
  for(const b of buildings)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)gardens.add(`${b.x+dx},${b.z+dz}`);
  for(const garden of gardens){
    const [x,z]=garden.split(',').map(Number);
    if(taken.has(garden))continue;
    const position=plotPosition(x,z);
    if(position.z+3>coastZ(position.x)-2.5)continue;
    const density=densityAt(x,z),kind=settlementType(density);
    const treeCount=kind==='urban'?1:kind==='suburban'?2:2+Math.floor(worldHash(x,z)*3);
    if(kind==='urban')box(group,position.x,.035,position.z,4.8,.07,4.8,'#d2d6c5');
    for(let i=0;i<treeCount;i++){
      const tx=(worldHash(x+i*7,z)-.5)*4.5,tz=(worldHash(z+i*11,x)-.5)*4.5;
      tree(group,position.x+tx,position.z+tz,.65+worldHash(x+i,z+17)*.65,box,mat);
    }
    if(kind!=='rural'&&(x+z)%3===0){
      box(group,position.x,.2,position.z+2,1.3,.25,.35,'#b49775');
      box(group,position.x,.48,position.z+2.12,1.3,.36,.13,'#b49775');
    }
  }
  for(const b of buildings){
    const plan=plotPlan(b.x,b.z),plot=new THREE.Group(),position=plan.position;
    const density=densityAt(b.x,b.z),form=buildingForm(b,density),{kind,footprint,foundationHeight,baseY}=form;
    plot.position.set(position.x,0,position.z);group.add(plot);
    const color=COLORS[b.color]?.hex || COLORS.sand.hex; const h=form.height;
    const urban=Math.min(1,density/SETTLEMENT_THRESHOLDS.urban),coastal=Math.max(0,1-(coastZ(position.x)-position.z)/15);
    const grass=mixGroundColor(night?'#637e6c':'#bfd2ae',night?'#969078':'#d4c39a',coastal*.45);
    const paving=b.style==='modern'?'#cbd2ce':b.style==='terrace'?'#d4d1bf':'#ccc7bc';
    const lotColor=mixGroundColor(grass,paving,urban**1.8*.9);
    const lot=lotPolygon(b,roads).map(p=>({x:p.x-position.x,z:p.z-position.z}));
    surface(plot,lot,.085,lotColor);
    const architecture=new THREE.Group();architecture.rotation.y=plan.rotation;plot.add(architecture);
    // Rotate the rectangular building independently of its irregular ground lot.
    const soilStone=mixGroundColor('#c5b38f',paving,urban);
    const foundationColor=mixGroundColor(soilStone,color,b.style==='modern'?.12:.07);
    const padding=.15+urban*.22+Math.min(.16,Math.sqrt(b.level)*.035);
    box(architecture,0,.085+foundationHeight/2,0,footprint.w+padding*2,foundationHeight,footprint.d+padding*2,foundationColor,b.id);
    if(kind==='rural'){
      const facing={x:Math.sin(plan.rotation),z:Math.cos(plan.rotation)};
      const frontEdge=lot.map((a,i)=>{const b=lot[(i+1)%lot.length];return ((a.x+b.x)*facing.x+(a.z+b.z)*facing.z)/2;});
      const frontage=frontEdge.indexOf(Math.max(...frontEdge));
      const fence=(a:GroundPoint,b:GroundPoint)=>{
        const length=Math.hypot(b.x-a.x,b.z-a.z);
        const rail=box(plot,(a.x+b.x)/2,.47,(a.z+b.z)/2,length,.1,.07,'#c6b996');rail.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
        for(const p of [a,b])box(plot,p.x,.33,p.z,.08,.5,.08,'#c6b996');
      };
      for(const i of [0,lot.length-1]){
        const a=lot[i],b=lot[(i+1)%lot.length];if(!a||!b)continue;
        if(i===frontage){
          const length=Math.hypot(b.x-a.x,b.z-a.z),gap=Math.min(.3,.65/length);
          const at=(t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
          fence(a,at(.5-gap));fence(at(.5+gap),b);
        }else fence(a,b);
      }
      box(plot,1.9,.15,-1.7,.6,.12,1.2,'#8ba374');
    }
    if(b.style==='terrace'){
      box(architecture,-footprint.w/2-.22,.18,1,.28,.18,.85,mixGroundColor('#a7b98c','#c6c7b6',urban));
      box(architecture,-footprint.w/2-.22,.28,1,.22,.09,.74,'#87a875');
    }else if(b.style==='modern'&&kind!=='rural'){
      box(architecture,footprint.w/2+.27,.22,-.9,.32,.25,.95,foundationColor);
      box(architecture,footprint.w/2+.27,.38,-.9,.25,.08,.82,'#87a875');
    }
    const parts: {w:number;d:number;h:number;y:number}[] = b.style==='terrace'&&kind!=='rural'
      ? [{w:footprint.w,d:footprint.d,h:h*.48,y:baseY},{w:2.65,d:2.5,h:h*.32,y:baseY+h*.48},{w:1.85,d:1.85,h:h*.2,y:baseY+h*.8}]
      : [{...footprint,h,y:baseY}];
    const win=night?'#f3d795':'#627e8a';
    for(const p of parts){
      box(architecture,0,p.y+p.h/2,0,p.w,p.h,p.d,color,b.id);
      const floors=Math.max(1,Math.min(8,Math.floor(p.h/(kind==='rural'?1.1:.65))));
      for(let i=0;i<floors;i++)for(let column=-1;column<=1;column++){
        const y=p.y+.38+i*(p.h-.5)/floors;
        if(!(i===0&&column===0&&p.y===baseY))box(architecture,column*p.w*.26,y,p.d/2+.018,.36,.29,.04,win,b.id);
        box(architecture,p.w/2+.018,y,column*p.d*.26,.04,.29,.36,win,b.id);
        box(architecture,column*p.w*.26,y,-p.d/2-.018,.36,.29,.04,win,b.id);
        box(architecture,-p.w/2-.018,y,column*p.d*.26,.04,.29,.36,win,b.id);
      }
      box(architecture,0,p.y+p.h+.06,0,p.w+.14,.12,p.d+.14,'#ece4d5',b.id);
      if(b.style==='terrace')box(architecture,-p.w*.3,p.y+p.h+.18,p.d*.27,.4,.25,.48,'#7f9d76');
    }
    if(b.style==='modern') {
      box(architecture,-footprint.w/2+.1,h/2+baseY,0,.18,h,footprint.d+.15,'#e8e9df',b.id);
      if(kind==='rural')box(architecture,.85,h+baseY+.18,-.5,.5,.2,.6,'#8a969b',b.id);
      else box(architecture,.9,h+baseY+.36,.6,.7,.6,.8,'#8a969b',b.id);
    }
    if(b.style==='spire'){
      const rural=kind==='rural',roofHeight=rural?.8:1.5;
      const roof=new THREE.Mesh(new THREE.ConeGeometry(1,roofHeight,4),mat(rural?'#b98e77':color));
      roof.geometry.rotateY(Math.PI/4);roof.scale.set((footprint.w+.15)/Math.SQRT2,1,(footprint.d+.15)/Math.SQRT2);
      roof.position.y=h+baseY+roofHeight/2+.01;roof.userData.owner=b.id; roof.castShadow=true;architecture.add(roof);
      if(rural)box(architecture,-.85,h+baseY+.85,-.5,.32,.5,.32,'#c5b5a0',b.id);
      else box(architecture,0,h+baseY+1.76,0,.07,1,.07,'#6d8188',b.id);
    }
    const front=footprint.d/2;
    box(architecture,0,baseY+.4,front+.024,.6,.8,.04,'#647b80',b.id);
    const fixture=night?'#f0daab':'#d8d8c7';
    for(const side of [-1,1]){
      box(architecture,-footprint.w*.3,baseY+.82,side*(front+.055),.13,.18,.08,fixture,b.id);
      box(architecture,side*(footprint.w/2+.055),baseY+.82,-footprint.d*.3,.08,.18,.13,fixture,b.id);
    }
    if(kind==='rural'){
      box(architecture,0,baseY+.06,front+.35,1.25,.12,.7,foundationColor,b.id);
      box(architecture,0,baseY+.98,front+.3,1.3,.1,.7,'#ece4d5',b.id);
      for(const x of [-.55,.55])box(architecture,x,baseY+.52,front+.53,.07,.92,.07,'#c6b996',b.id);
    }
    const pathColor=mixGroundColor('#c7bc9e',paving,urban);
    const frontageRoad=roads.get(`${plan.frontage.horizontal?'h':'v'}:${plan.frontage.x},${plan.frontage.z}`)!;
    const [a,boundary]=frontageRoad.points,dx=boundary.x-a.x,dz=boundary.z-a.z;
    const roadT=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz)));
    const frontageDensity=streetDensity(frontageRoad,roadT);
    const pathEnd=Math.max(front+.45,plan.frontage.distance-(roadWidth(frontageDensity)+roadShoulder(frontageDensity))/2);
    if(kind==='rural'){
      const count=Math.max(2,Math.ceil((pathEnd-front)/.45));
      for(let i=0;i<count;i++)box(architecture,0,.115,front+.18+(pathEnd-front-.3)*i/(count-1),.66,.05,.25,pathColor);
    }
    else box(architecture,0,.12,(front+pathEnd)/2,b.style==='modern'?1.05:.78,.07,pathEnd-front,pathColor);
    if(b.style==='spire')box(architecture,0,baseY-.03,front+.24,.83,.06,.42,foundationColor);
    tree(plot,-2.25,-1.8,.75,box,mat); tree(plot,2.15,1.6,.55,box,mat);
    // A simple rooftop garden instead of a texture or subdivided material face.
    if(b.style==='terrace'&&kind!=='rural') tree(architecture,.48,-.25,.38,box,mat,h+baseY+.12);
  }
  // Keep the plaza only next to inhabited plots, and leave its lot available for expansion.
  if(!taken.has('3,0')&&buildings.some(b=>Math.abs(b.x-3)+Math.abs(b.z)<=1)){
  const plaza=plotPosition(3,0);
  box(group,plaza.x,.1,plaza.z,5.2,.12,5.2,'#b1c6a0');
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.5,.25,8),mat('#e1e1d6')); fountain.position.set(plaza.x,.25,plaza.z);group.add(fountain);
  const water=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.03,8),mat('#87bcc7')); water.position.set(plaza.x,.39,plaza.z);group.add(water);
  }
  // Merge meshes by material and owner, preserving pickable towers while reducing draw calls.
  group.updateMatrixWorld(true);
  const batches=new Map<string,{material:THREE.Material;owner?:string;geometries:THREE.BufferGeometry[]}>();
  const originals=new Set<THREE.BufferGeometry>();
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh) || Array.isArray(o.material))return;
    const key=`${o.material.uuid}:${o.userData.owner || ''}`;
    if(!batches.has(key))batches.set(key,{material:o.material,owner:o.userData.owner,geometries:[]});
    const clone=o.geometry.clone(); const geometry=clone.index?clone.toNonIndexed():clone;
    if(geometry!==clone)clone.dispose();
    geometry.applyMatrix4(o.matrixWorld);batches.get(key)!.geometries.push(geometry);originals.add(o.geometry);
  });
  group.clear();originals.forEach(g=>g.dispose());
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.geometries);
    batch.geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=true;mesh.receiveShadow=true;
    if(batch.owner)mesh.userData.owner=batch.owner;group.add(mesh);
  }
}
function tree(parent:THREE.Group,x:number,z:number,scale:number,box:(p:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>THREE.Mesh,mat:(c:string)=>THREE.Material,base=0){
  box(parent,x,base+.5*scale,z,.16*scale,scale,.16*scale,'#ae9172');
  const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.78*scale,0),mat('#87a875'));leaf.position.set(x,base+1.25*scale,z);leaf.scale.y=1.25;leaf.castShadow=true;parent.add(leaf);
}
