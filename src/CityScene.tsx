import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { COLORS, type Building, type PublicProject } from '../shared/types';
import { coastZ, plotPosition, worldHash, PLOT_SPACING, VIEW_RADIUS } from '../shared/world';
import { WorldTerrain } from './WorldTerrain';
import type { CityLighting } from './lighting';
import { neighborhoodDensity, neighborhoodScores, settlementType, streetNetwork, streetDensity, roadWidth, roadShoulder, roadColor, shoulderColor, lotPolygon, projectPolygon, mixGroundColor, SETTLEMENT_THRESHOLDS, type GroundPoint } from './neighborhood';
import { CameraKeyboard } from './CameraKeyboard';
import { buildingForm } from './buildingForm';
import { clearRoadSurface, inRoadObstacle, roadObstacles } from './roadClearance';
import { plotPlan } from '../shared/plots';
import type { PlotPreview } from './plotPreview';
import { tierForLevel, tierIndex } from '../shared/progression';
import { isReservedPlot } from '../shared/projects';

export interface SceneHandle { focus: (b: {x:number;z:number;level?:number}) => void; reset: () => void; zoom: (amount: number) => void; }
interface Props { buildings: Building[]; selected: string | null; lighting: CityLighting; center: {x:number;z:number}; debugScores:boolean; previews:PlotPreview[]; projects:PublicProject[]; onProject:(id:string)=>void; onSelect: (id: string) => void; onPan: (x: number, z: number) => void; }
const SPACING = PLOT_SPACING;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CityScene = forwardRef<SceneHandle, Props>(function CityScene({ buildings, selected, lighting, center, debugScores, previews, projects, onProject, onSelect, onPan }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.OrthographicCamera; controls: OrbitControls; city: THREE.Group; selection: THREE.Group; planned:THREE.Group; labels:THREE.Group; outline:OutlinePass; focus: THREE.Vector3 | null; night: boolean; resize: () => void } | null>(null);
  const props = useRef({ buildings, selected, lighting, onSelect, onPan, onProject }); props.current = { buildings, selected, lighting, onSelect, onPan, onProject };
  const night=lighting.night;
  const [unavailable, setUnavailable] = useState(false);
  useImperativeHandle(ref, () => ({
    focus(b) {
      const e=engine.current;if(!e)return;
      const resident=props.current.buildings.find(t=>t.x===b.x&&t.z===b.z),position=plotPosition(b.x,b.z);
      const height=resident?buildingForm({...resident,level:b.level??resident.level}).topY:0;
      e.focus=new THREE.Vector3(position.x,height>12?height*.42:0,position.z);
      if(height>22){e.camera.zoom=Math.min(e.camera.zoom,.9);e.camera.updateProjectionMatrix();}
    },
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
    const sun = new THREE.DirectionalLight('#fff3df', 3.1); sun.position.set(-35,85,40);
    sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 65, bottom: -55, near: 1, far: 200 });
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
      const hit = raycaster.intersectObjects(city.children,true).find(v => v.object.userData.owner||v.object.userData.project);
      if (hit?.object.userData.project) props.current.onProject(hit.object.userData.project);
      else if (hit) props.current.onSelect(hit.object.userData.owner);
    };
    const move = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(city.children,true).some(v => v.object.userData.owner||v.object.userData.project) ? 'pointer' : 'grab';
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
      sun.position.set(ground.x+Math.cos(light.sunPhase)*45,30+light.daylight*55,ground.z+40);
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
    buildCity(e.city,buildings.filter(b=>Math.abs(b.x-center.x)<=VIEW_RADIUS&&Math.abs(b.z-center.z)<=VIEW_RADIUS),night,neighborhoodDensity(buildings),projects);
    e.outline.selectedObjects=e.city.children.filter(mesh=>mesh.userData.owner===props.current.selected||mesh.userData.project===props.current.selected);
  }, [buildings,night,center.x,center.z,projects]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;disposeGroup(e.planned);
    if(debugScores)drawPlotPreviews(e.planned,previews);
  },[debugScores,previews]);
  useEffect(()=>{
    const e=engine.current;if(!e)return;e.labels.clear();
    for(const project of projects){
      if(Math.abs(project.x-center.x)>VIEW_RADIUS||Math.abs(project.z-center.z)>VIEW_RADIUS)continue;
      const element=document.createElement('button');element.className='public-site-label';
      element.textContent=`${project.name} · ${Math.round(project.funded/project.goal*100)}%`;
      element.onclick=()=>props.current.onProject(project.id);element.setAttribute('aria-label',`Open public project ${project.name}`);
      const label=new CSS2DObject(element),position=plotPosition(project.x,project.z);label.position.set(position.x,3,position.z);e.labels.add(label);
    }
    if(!debugScores)return;
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
      element.setAttribute('aria-label',`Next available plot ${next.plan.x}, ${next.plan.z}, ${next.plan.axis} frontage, predicted score ${next.score.total.toFixed(3)}`);
      const label=new CSS2DObject(element);label.position.set(next.plan.position.x,next.form.topY+.6,next.plan.position.z);e.labels.add(label);
    }
  },[buildings,selected,debugScores,previews,center.x,center.z,projects]);
  useEffect(() => {
    const e = engine.current; if (!e) return; disposeGroup(e.selection);
    e.outline.selectedObjects=e.city.children.filter(mesh=>mesh.userData.owner===selected||mesh.userData.project===selected);
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
function buildCity(group: THREE.Group, buildings: Building[], night: boolean,densityAt:(x:number,z:number)=>number,projects:PublicProject[]) {
  const materials = new Map<string,THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({
      color,flatShading:true,roughness:1,
      emissive:night&&['#f3d795','#f0daab','#90d9d8','#bcb0e9','#a4d0ad','#99cfe4'].includes(color)?color:'#000000',emissiveIntensity:.55,
    }));
    return materials.get(color)!;
  };
  const box = (parent: THREE.Group, x:number,y:number,z:number,w:number,h:number,d:number,color:string,owner?:string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); mesh.position.set(x,y,z); mesh.castShadow = h>.3; mesh.receiveShadow = true;
    if (owner) mesh.userData.owner = owner; parent.add(mesh); return mesh;
  };
  const prism=(parent:THREE.Group,points:GroundPoint[],bottom:number,height:number,color:string,owner:string)=>{
    const vertices:number[]=[],top=bottom+height;
    const vertex=(p:GroundPoint,y:number)=>vertices.push(p.x,y,p.z);
    for(let i=1;i<points.length-1;i++){
      vertex(points[0],top);vertex(points[i+1],top);vertex(points[i],top);
      vertex(points[0],bottom);vertex(points[i],bottom);vertex(points[i+1],bottom);
    }
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      vertex(a,bottom);vertex(b,top);vertex(b,bottom);
      vertex(a,bottom);vertex(a,top);vertex(b,top);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    // Match the box mesh attributes so podiums and upper walls can share a batch.
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.owner=owner;parent.add(mesh);
  };
  const taken=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const {roads,junctions}=streetNetwork(buildings,densityAt);
  const obstacles=roadObstacles(buildings,densityAt);
  const surface=(parent:THREE.Group,points:GroundPoint[],height:number,color:string,concave=false)=>{
    if(points.length<3)return;
    const vertices:number[]=[];
    if(concave){
      const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]);
      for(const [i,j,k] of triangles){
        const a=points[i],b=points[j],c=points[k],area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
        for(const point of area>0?[a,c,b]:[a,b,c])vertices.push(point.x,height,point.z);
      }
    }else for(let i=1;i<points.length-1;i++)for(const point of [points[0],points[i+1],points[i]])vertices.push(point.x,height,point.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.receiveShadow=true;parent.add(mesh);
  };
  const strip=(a:GroundPoint,b:GroundPoint,startWidth:number,endWidth:number,height:number,color:string)=>{
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    const polygon=[{x:a.x+nx*startWidth/2,z:a.z+nz*startWidth/2},{x:a.x-nx*startWidth/2,z:a.z-nz*startWidth/2},
      {x:b.x-nx*endWidth/2,z:b.z-nz*endWidth/2},{x:b.x+nx*endWidth/2,z:b.z+nz*endWidth/2}];
    for(const piece of clearRoadSurface(polygon,obstacles))surface(group,piece,height,color);
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
      if(!inRoadObstacle({x:sx,z:sz},obstacles,.16)){
        box(group,sx,.8,sz,.07,1.5,.07,'#667e81');
        box(group,sx,1.58,sz,.23,.17,.23,night?'#f0daab':'#d8d8c7');
      }
      if(worldHash(road.x,road.z+(road.horizontal?0:13))>.72&&!inRoadObstacle(middle,obstacles,.5)){
        const car=box(group,middle.x,.24,middle.z,.9,.27,.43,'#8b9cac');car.rotation.y=angle;
        const top=box(group,middle.x,.42,middle.z,.43,.17,.35,'#c0ced1');top.rotation.y=angle;
      }
    }
  }
  for(const {position,density} of junctions.values()){
    const cap=(radius:number,height:number,color:string)=>{
      const polygon=Array.from({length:12},(_,i)=>({
      x:position.x+Math.cos(i/12*Math.PI*2)*radius,z:position.z+Math.sin(i/12*Math.PI*2)*radius,
      }));
      for(const piece of clearRoadSurface(polygon,obstacles))surface(group,piece,height,color);
    };
    cap((roadWidth(density)+roadShoulder(density))/2+.035,.0555,shoulderColor(density));
    cap(roadWidth(density)/2+.025,.079,roadColor(density));
  }
  const gardens=new Set<string>();
  for(const b of buildings)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)gardens.add(`${b.x+dx},${b.z+dz}`);
  for(const garden of gardens){
    const [x,z]=garden.split(',').map(Number);
    if(taken.has(garden)||isReservedPlot(x,z))continue;
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
    const lotColor=mixGroundColor(grass,form.definition.groundColor,form.definition.paving);
    const lot=lotPolygon(b,roads).map(p=>({x:p.x-position.x,z:p.z-position.z}));
    surface(plot,lot,.085,lotColor);
    const architecture=new THREE.Group();architecture.rotation.y=plan.rotation;plot.add(architecture);
    // Rotate the rectangular building independently of its irregular ground lot.
    const soilStone=mixGroundColor(form.definition.stone,paving,urban*.2);
    const foundationColor=mixGroundColor(soilStone,color,b.style==='modern'?.12:.07);
    const padding=form.foundationPadding;
    const localOutline=(outline:GroundPoint[])=>outline.map(p=>{
      const x=p.x-position.x,z=p.z-position.z,c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);
      return {x:x*c-z*s,z:x*s+z*c};
    });
    const podium=form.podium?localOutline(form.podium):null;
    if(form.podiumFoundation){
      const outline=form.podiumFoundation.map(p=>({x:p.x-position.x,z:p.z-position.z})),band=form.tier>=6?.07:0;
      if(band)prism(plot,outline,.085,band,['#90d9d8','#bcb0e9','#a4d0ad','#99cfe4'][form.tier-6],b.id);
      prism(plot,outline,.085+band,foundationHeight-band,foundationColor,b.id);
    }
    else box(architecture,0,.085+foundationHeight/2,0,footprint.w+padding*2,foundationHeight,footprint.d+padding*2,foundationColor,b.id);
    // Only furnish the ground that remains between the growing podium and the lot edge.
    const groundSpace=(x:number,z:number,w:number,d:number,aligned=false)=>{
      const c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);
      const points=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>{
        const px=x+dx,pz=z+dz;return aligned?{x:px*c+pz*s,z:-px*s+pz*c}:{x:px,z:pz};
      });
      const local=points.map(p=>({x:p.x*c-p.z*s,z:p.x*s+p.z*c}));
      const body=podium||[{x:-footprint.w/2,z:-footprint.d/2},{x:footprint.w/2,z:footprint.d/2}];
      if(Math.max(...local.map(p=>p.x))>Math.min(...body.map(p=>p.x))-padding&&Math.min(...local.map(p=>p.x))<Math.max(...body.map(p=>p.x))+padding&&
        Math.max(...local.map(p=>p.z))>Math.min(...body.map(p=>p.z))-padding&&Math.min(...local.map(p=>p.z))<Math.max(...body.map(p=>p.z))+padding)return false;
      return points.every(p=>lot.every((a,i)=>{const b=lot[(i+1)%lot.length];return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)>=0;}));
    };
    const groundBox=(parent:THREE.Group,x:number,y:number,z:number,w:number,height:number,d:number,color:string)=>{
      if(groundSpace(x,z,w,d,parent===architecture))box(parent,x,y,z,w,height,d,color);
    };
    if(kind==='rural'&&form.tier>0){
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
      groundBox(plot,1.9,.15,-1.7,.6,.12,1.2,'#8ba374');
    }
    if(b.style==='terrace'){
      groundBox(architecture,-footprint.w/2-padding-.2,.18,1,.28,.18,.85,mixGroundColor('#a7b98c','#c6c7b6',urban));
      groundBox(architecture,-footprint.w/2-padding-.2,.28,1,.22,.09,.74,'#87a875');
    }else if(b.style==='modern'&&kind!=='rural'){
      groundBox(architecture,footprint.w/2+padding+.22,.22,-.9,.32,.25,.95,foundationColor);
      groundBox(architecture,footprint.w/2+padding+.22,.38,-.9,.25,.08,.82,'#87a875');
    }
    if(form.tier===2){
      groundBox(architecture,0,.11,-footprint.d/2-padding-.4,2.2,.045,.65,'#c8a991');
      for(const side of [-1,1])groundBox(plot,side*2.25,.25,-.4,.35,.3,1.8,'#8fab80');
    }else if(form.tier===3){
      groundBox(plot,-2.15,.24,.9,.35,.26,1.3,'#b99c7e');groundBox(plot,-2.15,.48,.9,.1,.28,1.3,'#b99c7e');
      groundBox(plot,2.15,.21,-1,.45,.23,1,'#c3c6b8');groundBox(plot,2.15,.36,-1,.36,.1,.88,'#8fab80');
    }else if(form.tier===4){
      for(const x of [-2.25,2.25])groundBox(plot,x,.096,0,.06,.015,4.4,'#9dadad');
      groundBox(plot,-2.25,1,-1.8,.07,1.8,.07,'#738b8d');groundBox(plot,-2.25,1.94,-1.8,.25,.12,.25,night?'#f0daab':'#d8d8c7');
    }else if(form.tier===5){
      for(const x of [-2.25,2.25]){
        groundBox(plot,x,.18,0,.4,.2,3.7,'#afbfc1');groundBox(plot,x,.32,0,.3,.12,3.5,'#8fab80');
        groundBox(plot,x,.45,-1.65,.16,.16,.16,night?'#f0daab':'#d8d8c7');
      }
    }
    const parts=form.sections.map(section=>({...section,polygon:localOutline(section.outline),cap:localOutline(section.cornice)}));
    const win=night?'#f3d795':'#627e8a',concrete='#e3e2d7',metal='#708a89',timber='#b39a78';
    // Early models use punched windows in substantial walls. Glazing grows
    // with the building's overall tier, including when glass details are chosen.
    const glazing=[
      {bay:1.15,width:.26,height:.30,ratio:.38},
      {bay:1.10,width:.30,height:.34,ratio:.43},
      {bay:.98,width:.34,height:.40,ratio:.50},
      {bay:.90,width:.38,height:.46,ratio:.56},
      {bay:.78,width:.43,height:.53,ratio:.64},
      {bay:.70,width:.46,height:.59,ratio:.69},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
    ][form.tier];
    const edgeBeam=(a:GroundPoint,end:GroundPoint,y:number,width:number,height:number,color:string,inset=0)=>{
      const dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz);
      const mesh=box(architecture,(a.x+end.x)/2-dz/length*inset,y,(a.z+end.z)/2+dx/length*inset,length,height,width,color,b.id);
      mesh.rotation.y=-Math.atan2(dz,dx);return mesh;
    };
    for(const p of parts){
      const design=form.segments[p.segment],bodyColor=mixGroundColor(COLORS[design.color].hex,concrete,form.tier>=3?.35:.08);
      const loggiaHeight=p.loggia?Math.min(.42,p.h*.18):0;
      const center={x:p.polygon.reduce((sum,v)=>sum+v.x,0)/p.polygon.length,z:p.polygon.reduce((sum,v)=>sum+v.z,0)/p.polygon.length};
      if(p.loggia){
        const recessed=p.polygon.map(v=>({x:center.x+(v.x-center.x)*.80,z:center.z+(v.z-center.z)*.80}));
        prism(architecture,recessed,p.y,loggiaHeight,'#617f80',b.id);
        // Slender perimeter columns make the shared garden floor legible and carry the rooms above.
        for(const v of p.polygon){
          const x=center.x+(v.x-center.x)*.93,z=center.z+(v.z-center.z)*.93;
          box(architecture,x,p.y+loggiaHeight/2,z,.10,loggiaHeight,.10,concrete,b.id);
        }
        prism(architecture,p.polygon,p.y+loggiaHeight,.09,concrete,b.id);
      }
      prism(architecture,p.polygon,p.y+loggiaHeight,p.h-loggiaHeight,bodyColor,b.id);
      const usable=p.h-loggiaHeight,floors=Math.max(1,Math.floor(usable/.78)),floorHeight=usable/floors;
      for(let edge=0;edge<p.polygon.length;edge++){
        const a=p.polygon[edge],end=p.polygon[(edge+1)%p.polygon.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
        if(length<.14)continue;
        // Anchor the facade bays to a building-wide datum so adjacent tiers
        // share mullion lines even when one end of the wall steps back.
        const tx=dx/length,tz=dz/length,start=a.x*tx+a.z*tz,bay=glazing.bay;
        const bays:number[]=[];
        for(let u=Math.ceil((start+.19)/bay)*bay;u<start+length-.19;u+=bay)bays.push(u-start);
        for(let i=0;i<floors;i++){
          const y=p.y+loggiaHeight+floorHeight*(i+.5),windowHeight=Math.min(glazing.height,floorHeight*glazing.ratio);
          for(const u of bays){
            const x=a.x+tx*u,z=a.z+tz*u;
            if(p.segment===0&&i===0&&nz>.9&&Math.abs(x)<.55)continue;
            const ww=Math.min(length*.35,glazing.width*(design.style==='glass'?(form.tier<4?1.12:1.20):1));
            const window=box(architecture,x+nx*.024,y,z+nz*.024,ww,windowHeight,.04,win,b.id);window.rotation.y=-Math.atan2(dz,dx);
            if(form.tier>=5||design.style==='glass'&&form.tier>=3){
              const mullion=box(architecture,x+tx*ww/2+nx*.05,y,z+tz*ww/2+nz*.05,.035,windowHeight+.04,.055,metal,b.id);mullion.rotation.y=window.rotation.y;
            }
          }
          if(form.tier>=3){
            // Recessed glazing, a continuous sill, and a quiet slab edge read as inhabited floors.
            edgeBeam(a,end,p.y+loggiaHeight+floorHeight*i+.08,.08,.055,concrete,-.025);
          }
          if(design.style==='balcony'&&length>1.2){
            const insetA={x:a.x+dx*.13,z:a.z+dz*.13},insetB={x:end.x-dx*.13,z:end.z-dz*.13};
            edgeBeam(insetA,insetB,y-windowHeight/2-.05,.28,.065,concrete,-.14);
            edgeBeam(insetA,insetB,y-windowHeight/2+.17,.035,.19,'#91aaa4',-.26);
          }
        }
        // A narrow timber bay gives each volume a warm end and a shared material language.
        if(form.tier>=3&&edge===0&&length>1.1)for(let strip=0;strip<3;strip++){
          const u=.15+strip*.10,x=a.x+tx*u,z=a.z+tz*u;
          const slat=box(architecture,x+nx*.052,p.y+loggiaHeight+usable/2,z+nz*.052,.045,usable-.12,.07,timber,b.id);slat.rotation.y=-Math.atan2(dz,dx);
        }
      }
      // Only meaningful setbacks get a projecting roof slab. Flush tiers join visually.
      if(p.terrace)prism(architecture,p.cap,p.y+p.h+.004,.065,concrete,b.id);
      const above=parts[p.segment+1]?.polygon,roofY=p.y+p.h+.07;
      const fitsRoof=(x:number,z:number,margin=.17)=>{
        const inside=p.polygon.every((a,i)=>{const end=p.polygon[(i+1)%p.polygon.length];return ((end.x-a.x)*(z-a.z)-(end.z-a.z)*(x-a.x))/Math.hypot(end.x-a.x,end.z-a.z)>margin;});
        return inside&&!(above&&inRoadObstacle({x,z},[above],margin+.08));
      };
      if(p.terrace&&form.tier>=3){
        for(let edge=0;edge<p.polygon.length;edge++){
          const a=p.polygon[edge],end=p.polygon[(edge+1)%p.polygon.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
          const steps=Math.max(1,Math.floor(length/.6));
          for(let i=0;i<steps;i++){
            const t=(i+.5)/steps,x=a.x+dx*t+nx*.29,z=a.z+dz*t+nz*.29;
            if(!fitsRoof(x,z,.19))continue;
            const planter=box(architecture,x,roofY+.12,z,length/steps*.73,.22,.25,concrete,b.id);planter.rotation.y=-Math.atan2(dz,dx);
            const foliage=box(architecture,x,roofY+.25,z,length/steps*.66,.16,.21,'#799971',b.id);foliage.rotation.y=planter.rotation.y;
            const railA={x:a.x+dx*i/steps+nx*.065,z:a.z+dz*i/steps+nz*.065},railB={x:a.x+dx*(i+1)/steps+nx*.065,z:a.z+dz*(i+1)/steps+nz*.065};
            edgeBeam(railA,railB,roofY+.37,.03,.035,metal);
            box(architecture,railA.x,roofY+.20,railA.z,.035,.35,.035,metal,b.id);
          }
        }
        // A tree is placed only where an entire planter fits on a genuine terrace.
        for(const v of p.polygon){
          const x=center.x+(v.x-center.x)*.64,z=center.z+(v.z-center.z)*.64;
          if(!fitsRoof(x,z,.38))continue;
          box(architecture,x,roofY+.12,z,.48,.23,.48,timber,b.id);
          tree(architecture,x,z,.30,box,mat,roofY+.23);break;
        }
      }
    }
    const top=parts[parts.length-1],roofY=baseY+h;
    const topCenter={x:top.polygon.reduce((sum,p)=>sum+p.x,0)/top.polygon.length,z:top.polygon.reduce((sum,p)=>sum+p.z,0)/top.polygon.length};
    const roofW=Math.max(...top.polygon.map(p=>p.x))-Math.min(...top.polygon.map(p=>p.x)),roofD=Math.max(...top.polygon.map(p=>p.z))-Math.min(...top.polygon.map(p=>p.z));
    if(form.tier===0){
      const roof=box(architecture,topCenter.x,roofY+.12,topCenter.z,roofW+.16,.13,roofD+.16,'#9b8970',b.id);roof.rotation.x=.09;
      for(const sign of [-1,1])box(architecture,sign*footprint.w*.28,baseY+h/2,footprint.d/2+.03,.075,h,.055,'#b6a186',b.id);
    }else if(form.tier<=2){
      const roof=new THREE.Mesh(new THREE.ConeGeometry(1,.7,4),mat('#b98e77'));
      roof.geometry.rotateY(Math.PI/4);roof.scale.set((roofW+.1)/Math.SQRT2,1,(roofD+.1)/Math.SQRT2);
      roof.position.set(topCenter.x,roofY+.425,topCenter.z);roof.userData.owner=b.id;roof.castShadow=true;architecture.add(roof);
    }else{
      // A small inhabited pavilion finishes the composition, leaving a roof garden around it.
      const pavilion=top.polygon.map(p=>({x:topCenter.x+(p.x-topCenter.x)*.48,z:topCenter.z+(p.z-topCenter.z)*.48}));
      const pavilionHeight=b.style==='spire'?.95:.65;
      const glazedPavilion=form.tier>=5;
      prism(architecture,pavilion,roofY+.08,pavilionHeight,glazedPavilion?'#627e8a':mixGroundColor(color,concrete,.35),b.id);
      if(!glazedPavilion)for(let i=0;i<pavilion.length;i++){
        const a=pavilion[i],end=pavilion[(i+1)%pavilion.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz);
        if(length<.45)continue;
        const window=box(architecture,(a.x+end.x)/2+dz/length*.024,roofY+.08+pavilionHeight*.55,(a.z+end.z)/2-dx/length*.024,Math.min(.38,length*.40),pavilionHeight*.43,.04,win,b.id);
        window.rotation.y=-Math.atan2(dz,dx);
      }
      const canopy=pavilion.map(p=>({x:topCenter.x+(p.x-topCenter.x)*1.14,z:topCenter.z+(p.z-topCenter.z)*1.14}));
      prism(architecture,canopy,roofY+.09+pavilionHeight,.09,concrete,b.id);
      for(const v of pavilion)box(architecture,v.x,roofY+.08+pavilionHeight/2,v.z,.055,pavilionHeight,.055,timber,b.id);
    }
    const front=podium?Math.max(...podium.map(p=>p.z)):footprint.d/2;
    box(architecture,0,baseY+.4,front+.024,.6,.8,.04,'#647b80',b.id);
    const fixture=night?'#f0daab':'#d8d8c7';
    if(podium)for(let i=0;i<podium.length;i++){
      const a=podium[i],end=podium[(i+1)%podium.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz);
      const light=box(architecture,a.x+dx*.3+dz/length*.055,baseY+.82,a.z+dz*.3-dx/length*.055,.13,.18,.08,fixture,b.id);
      light.rotation.y=-Math.atan2(dz,dx);
    }else for(const side of [-1,1]){
      box(architecture,-footprint.w*.3,baseY+.82,side*(front+.055),.13,.18,.08,fixture,b.id);
      box(architecture,side*(footprint.w/2+.055),baseY+.82,-footprint.d*.3,.08,.18,.13,fixture,b.id);
    }
    if(kind==='rural'&&form.tier>0){
      box(architecture,0,baseY+.06,front+.35,1.25,.12,.7,foundationColor,b.id);
      box(architecture,0,baseY+.98,front+.3,1.3,.1,.7,'#ece4d5',b.id);
      for(const x of [-.55,.55])box(architecture,x,baseY+.52,front+.53,.07,.92,.07,'#c6b996',b.id);
    }
    const pathColor=mixGroundColor('#c7bc9e',paving,urban);
    const frontageRoad=roads.get(`${plan.frontage.horizontal?'h':'v'}:${plan.frontage.x},${plan.frontage.z}`)!;
    const [a,boundary]=frontageRoad.points,dx=boundary.x-a.x,dz=boundary.z-a.z;
    const roadT=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz)));
    const frontageDensity=streetDensity(frontageRoad,roadT);
    const pathEnd=plan.frontage.distance-(roadWidth(frontageDensity)+roadShoulder(frontageDensity))/2;
    if(kind==='rural'&&pathEnd>front+.25){
      const count=Math.max(2,Math.ceil((pathEnd-front)/.45));
      for(let i=0;i<count;i++)box(architecture,0,.115,front+.18+(pathEnd-front-.3)*i/(count-1),.66,.05,.25,pathColor);
    }
    else if(pathEnd>front)box(architecture,0,.12,(front+pathEnd)/2,b.style==='modern'?1.05:.78,.07,pathEnd-front,pathColor);
    if(b.style==='spire'&&form.tier<5)box(architecture,0,baseY-.02,front+.24,.83,.06,.42,foundationColor);
    for(const [x,z,size] of form.tier<4?[[-2.25,-1.8,.75],[2.15,1.6,.55]]:[[2.1,1.8,.45]]){
      if(groundSpace(x,z,size*1.5,size*1.5))tree(plot,x,z,size,box,mat);
    }
    // A simple rooftop garden instead of a texture or subdivided material face.
    if(b.style==='terrace'&&kind!=='rural'&&roofW>1.3&&roofD>1.3)tree(architecture,topCenter.x+.25,topCenter.z-.2,.25,box,mat,h+baseY+.12);
  }
  const residentPositions=buildings.map(b=>plotPosition(b.x,b.z));
  for(const project of projects){
    const center=plotPosition(project.x,project.z),ratio=project.funded/project.goal;
    const boundary=projectPolygon(project.id,roads).map(p=>({x:p.x-center.x,z:p.z-center.z}));
    if(boundary.length<3)continue;
    const site=new THREE.Group();site.position.set(center.x,0,center.z);group.add(site);
    surface(site,boundary,.085,project.kind==='park'?'#afc69d':'#c6ccc1',true);
    // Choose an entrance on the road side nearest the residents, then connect inward.
    const midpoints=boundary.map((a,i)=>{const b=boundary[(i+1)%boundary.length];return {x:(a.x+b.x)/2,z:(a.z+b.z)/2};});
    const distanceToResidents=(p:GroundPoint)=>Math.min(...residentPositions.map(pos=>Math.hypot(center.x+p.x-pos.x,center.z+p.z-pos.z)));
    const entrance=midpoints.reduce((best,p)=>distanceToResidents(p)<distanceToResidents(best)?p:best);
    const path=box(site,entrance.x/2,.11,entrance.z/2,Math.hypot(entrance.x,entrance.z),.04,.95,'#d5c9ae');
    path.rotation.y=-Math.atan2(entrance.z,entrance.x);
    if(ratio<1){
      for(let i=0;i<boundary.length;i++){
        const a=boundary[i],b=boundary[(i+1)%boundary.length],mid=midpoints[i];
        if(Math.hypot(mid.x-entrance.x,mid.z-entrance.z)<1)continue;
        const fence=box(site,mid.x,.4,mid.z,Math.hypot(b.x-a.x,b.z-a.z),.6,.07,'#c4aa82');
        fence.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
      }
      // Brick stacks grow as actual contributions accumulate.
      for(let i=0;i<Math.ceil(ratio*8);i++)box(site,-4+i%4*.65,.25+Math.floor(i/4)*.3,-3,.55,.3,.4,'#b9927a');
    }
    if(ratio>=.25){tree(site,-3,-2,.9,box,mat);tree(site,3,2,.9,box,mat);}
    if(ratio>=.5)for(const x of [-2,2]){box(site,x,.3,2.5,1.5,.3,.4,'#b99d7d');box(site,x,.57,2.68,1.5,.3,.08,'#b99d7d');}
    if(ratio>=.75){box(site,0,.18,0,3.2,.2,3.2,'#d9d8c6');for(const x of [-1.3,1.3])for(const z of [-1.3,1.3])box(site,x,1.1,z,.12,1.8,.12,'#a9ada1');}
    if(ratio>=1){
      if(project.kind==='park')box(site,0,2.05,0,3.7,.3,3.7,'#9dbaa0');
      else {box(site,0,.45,0,1.8,.5,1.8,'#cad3d0');const sculpture=new THREE.Mesh(new THREE.IcosahedronGeometry(1,0),mat('#a79bc7'));sculpture.position.y=1.65;site.add(sculpture);}
    }
    site.traverse(object=>{if(object instanceof THREE.Mesh)object.userData.project=project.id;});
  }
  // Merge meshes by material and owner, preserving pickable towers while reducing draw calls.
  group.updateMatrixWorld(true);
  const batches=new Map<string,{material:THREE.Material;owner?:string;project?:string;geometries:THREE.BufferGeometry[]}>();
  const originals=new Set<THREE.BufferGeometry>();
  group.traverse(o=>{
    if(!(o instanceof THREE.Mesh) || Array.isArray(o.material))return;
    const key=`${o.material.uuid}:${o.userData.owner || ''}:${o.userData.project || ''}`;
    if(!batches.has(key))batches.set(key,{material:o.material,owner:o.userData.owner,project:o.userData.project,geometries:[]});
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
    if(batch.owner)mesh.userData.owner=batch.owner;
    if(batch.project)mesh.userData.project=batch.project;
    group.add(mesh);
  }
}
function tree(parent:THREE.Group,x:number,z:number,scale:number,box:(p:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>THREE.Mesh,mat:(c:string)=>THREE.Material,base=0){
  box(parent,x,base+.5*scale,z,.16*scale,scale,.16*scale,'#ae9172');
  const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.78*scale,0),mat('#87a875'));leaf.position.set(x,base+1.25*scale,z);leaf.scale.y=1.25;leaf.castShadow=true;parent.add(leaf);
}
