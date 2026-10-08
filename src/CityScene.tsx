import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, type Building } from '../shared/types';
import { coastZ, plotPosition, worldHash, PLOT_SPACING, VIEW_RADIUS } from '../shared/world';
import { WorldTerrain } from './WorldTerrain';
import type { CityLighting } from './lighting';
import { neighborhoodDensity, settlementType, streetPoints } from './neighborhood';

export interface SceneHandle { focus: (b: Building) => void; reset: () => void; zoom: (amount: number) => void; }
interface Props { buildings: Building[]; selected: string | null; lighting: CityLighting; center: {x:number;z:number}; onSelect: (id: string) => void; onPan: (x: number, z: number) => void; }
const SPACING = PLOT_SPACING;
const heightOf = (level: number) => 2.3 + Math.sqrt(level) * 1.65;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CityScene = forwardRef<SceneHandle, Props>(function CityScene({ buildings, selected, lighting, center, onSelect, onPan }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.OrthographicCamera; controls: OrbitControls; city: THREE.Group; selection: THREE.Group; focus: THREE.Vector3 | null; night: boolean; resize: () => void } | null>(null);
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
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D city. Drag to orbit, scroll to zoom, or select a tower. Violet links show invitation connections. Use the resident list for keyboard navigation.');
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
    const city = new THREE.Group(); const selection = new THREE.Group(); scene.add(city, selection);
    function resize() {
      const w = el.clientWidth, h = el.clientHeight; const view = window.innerWidth < 700 ? 23 : 26;
      camera.left = -view * w / h; camera.right = view * w / h; camera.top = view; camera.bottom = -view;
      camera.updateProjectionMatrix(); renderer.setSize(w,h);
    }
    engine.current = { scene, renderer, camera, controls, city, selection, focus: null, night: false, resize };
    resize(); const observer = new ResizeObserver(resize); observer.observe(el);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 }; let lastPan = '0,0'; let pointerActive = false;
    const pointerDown = (e: PointerEvent) => { pointerActive = true; down = { x: e.clientX, y: e.clientY }; };
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
    const panEnd = () => {
      const x = Math.round(controls.target.x / SPACING / 4) * 4, z = Math.round(controls.target.z / SPACING / 4) * 4;
      if (`${x},${z}` !== lastPan) { lastPan = `${x},${z}`; props.current.onPan(x,z); }
    };
    const keyUp = (e: KeyboardEvent) => { if(e.key.startsWith('Arrow'))panEnd(); };
    renderer.domElement.addEventListener('pointerdown',pointerDown); renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointercancel',pointerCancel);
    renderer.domElement.addEventListener('keyup',keyUp);
    renderer.domElement.addEventListener('pointermove', move); controls.addEventListener('end', panEnd);
    let frame: number;
    const cameraDirection = new THREE.Vector3();
    const warmSun = new THREE.Color('#f0b17d'), middaySun = new THREE.Color('#fff3df');
    function animate() {
      frame = requestAnimationFrame(animate);
      const e = engine.current;
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
      sun.target.position.set(controls.target.x,0,controls.target.z);
      sun.target.updateMatrixWorld();
      sun.position.set(controls.target.x+Math.cos(light.sunPhase)*34,12+light.daylight*38,controls.target.z+25);
      controls.update();
      // Keep the orthographic foreground in front of the camera, even near the horizon.
      cameraDirection.copy(camera.position).sub(controls.target).normalize();
      const distance=Math.max(280,(camera.top/camera.zoom*Math.sqrt(1-cameraDirection.y**2)+2)/Math.max(.04,cameraDirection.y));
      camera.position.copy(controls.target).addScaledVector(cameraDirection,distance);
      const far=Math.max(5000,distance*4);
      if(Math.abs(camera.far-far)>.1){camera.far=far;camera.updateProjectionMatrix();}
      terrain.update(camera,light.night); renderer.render(scene,camera);
    }
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp);
      renderer.domElement.removeEventListener('pointercancel',pointerCancel);
      renderer.domElement.removeEventListener('keyup',keyUp);
      renderer.domElement.removeEventListener('pointermove',move); terrain.dispose(); disposeGroup(city); disposeGroup(selection); renderer.dispose();
      renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.night = night; disposeGroup(e.city);
    buildCity(e.city,buildings.filter(b=>Math.abs(b.x-center.x)<=VIEW_RADIUS&&Math.abs(b.z-center.z)<=VIEW_RADIUS),night);
  }, [buildings,night,center.x,center.z]);
  useEffect(() => {
    const e = engine.current; if (!e) return; disposeGroup(e.selection);
    const b = buildings.find(b=>b.id===selected); if (!b) return;
    const material = new THREE.MeshBasicMaterial({ color: '#7971e0', transparent: true, opacity: .85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5,2.65,4,1,Math.PI/4), material);
    ring.rotation.x = -Math.PI/2; const position=plotPosition(b.x,b.z); ring.position.set(position.x,.09,position.z); e.selection.add(ring);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.25),new THREE.MeshBasicMaterial({ color: '#7971e0' }));
    marker.position.set(position.x,heightOf(b.level)+2,position.z); e.selection.add(marker);
    const loaded=new Map(buildings.map(tower=>[tower.id,tower]));
    for(const child of buildings){
      const parent=child.invited_by?loaded.get(child.invited_by):null;
      if(!parent)continue;
      const a=plotPosition(parent.x,parent.z),end=plotPosition(child.x,child.z);
      const start=new THREE.Vector3(a.x,heightOf(parent.level)+1,a.z);
      const finish=new THREE.Vector3(end.x,heightOf(child.level)+1,end.z);
      const control=start.clone().add(finish).multiplyScalar(.5);control.y=Math.max(start.y,finish.y)+2;
      const connected=child.id===selected||parent.id===selected;
      const curve=new THREE.QuadraticBezierCurve3(start,control,finish);
      const link=new THREE.Mesh(new THREE.TubeGeometry(curve,16,connected?.045:.025,4,false),new THREE.MeshBasicMaterial({color:'#b6a5ee',transparent:true,opacity:connected?.7:.18,depthWrite:false}));
      e.selection.add(link);
    }
  }, [selected,buildings]);
  return <div className="scene" ref={host}>{unavailable && <div className="webgl-fallback"><h2>Your city needs WebGL</h2><p>Enable hardware acceleration or open a browser that supports WebGL. You can still use the resident list and building controls.</p></div>}</div>;
});

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  group.traverse(o=>{ if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) materials.add(m); } });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); group.clear();
}
function buildCity(group: THREE.Group, buildings: Building[], night: boolean) {
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
  const densityAt=neighborhoodDensity(buildings);
  const taken=new Set(buildings.map(b=>`${b.x},${b.z}`));
  const roads=new Map<string,{x:number;z:number;horizontal:boolean;density:number}>();
  const addRoad=(x:number,z:number,horizontal:boolean,density:number)=>{
    const key=`${horizontal?'h':'v'}:${x},${z}`;
    const old=roads.get(key);
    roads.set(key,{x,z,horizontal,density:Math.max(density,old?.density||0)});
  };
  for(const b of buildings){
    const density=densityAt(b.x,b.z),kind=settlementType(density);
    addRoad(b.x,b.z+1,true,density);
    addRoad(b.x,b.z,true,density);
    if(kind==='urban'||taken.has(`${b.x},${b.z+1}`)||taken.has(`${b.x},${b.z-1}`)){
      addRoad(b.x,b.z,false,density);addRoad(b.x+1,b.z,false,density);
    }
  }
  const ribbon=(points:{x:number;z:number}[],width:number,y:number,h:number,color:string)=>{
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const segment=box(group,(a.x+b.x)/2,y,(a.z+b.z)/2,Math.hypot(dx,dz)+.08,h,width,color);
      segment.rotation.y=-Math.atan2(dz,dx);
    }
  };
  for(const road of roads.values()){
    const kind=settlementType(road.density),points=streetPoints(road.x,road.z,road.horizontal);
    const width=kind==='urban'?1.35:kind==='suburban'?.85:.45;
    ribbon(points,width+.35,.025,.055,kind==='rural'?'#c4bd9f':'#dfded3');
    ribbon(points,width,.065,.024,kind==='urban'?'#849394':kind==='suburban'?'#a8b2ad':'#b3ac91');
    const a=points[0],b=points[1],middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2},angle=-Math.atan2(b.z-a.z,b.x-a.x);
    if(kind==='urban'){
      const stripe=box(group,middle.x,.083,middle.z,.7,.008,.035,'#e4dfc5');stripe.rotation.y=angle;
      const side=road.horizontal?{x:0,z:width/2+.2}:{x:width/2+.2,z:0};
      box(group,middle.x+side.x,.8,middle.z+side.z,.07,1.5,.07,'#667e81');
      box(group,middle.x+side.x,1.58,middle.z+side.z,.23,.17,.23,night?'#f0daab':'#d8d8c7');
      if(worldHash(road.x,road.z+(road.horizontal?0:13))>.72){
        const car=box(group,middle.x,.24,middle.z,.9,.27,.43,'#8b9cac');car.rotation.y=angle;
        const top=box(group,middle.x,.42,middle.z,.43,.17,.35,'#c0ced1');top.rotation.y=angle;
      }
    }
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
    const plot=new THREE.Group(),position=plotPosition(b.x,b.z);
    const density=densityAt(b.x,b.z),kind=settlementType(density);
    plot.position.set(position.x,0,position.z);group.add(plot);
    const color=COLORS[b.color]?.hex || COLORS.sand.hex; const h=heightOf(b.level);
    // The lot follows the street corners; the tower itself remains rectangular.
    const inset=kind==='urban'?.76:kind==='suburban'?.83:.89;
    const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dz])=>{
      const corner=plotPosition(b.x+dx,b.z+dz);
      return new THREE.Vector3((corner.x-position.x)*inset,.085,(corner.z-position.z)*inset);
    });
    const groundGeometry=new THREE.BufferGeometry();
    groundGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,2,1,0,3,2].flatMap(i=>corners[i].toArray()),3));
    groundGeometry.computeVertexNormals();
    const lot=new THREE.Mesh(groundGeometry,mat(kind==='urban'?'#ced2c8':kind==='suburban'?'#b3c8a0':'#b5cda3'));
    lot.receiveShadow=true;plot.add(lot);
    box(plot,0,.14,0,kind==='urban'?4.5:3.8,.17,kind==='urban'?4.5:3.8,'#e1dfd4',b.id);
    if(kind==='rural'){
      box(plot,-2.4,.36,0,.08,.55,4.6,'#c6b996');box(plot,0,.36,-2.4,4.6,.55,.08,'#c6b996');
      box(plot,1.9,.15,-1.7,.6,.12,1.2,'#8ba374');
    }
    const parts: {w:number;d:number;h:number;y:number}[] = b.style==='terrace'
      ? [{w:3.35,d:3.1,h:h*.48,y:.24},{w:2.65,d:2.5,h:h*.32,y:.24+h*.48},{w:1.85,d:1.85,h:h*.2,y:.24+h*.8}]
      : [{w:b.style==='modern'?2.9:2.5,d:b.style==='modern'?2.9:2.5,h,y:.24}];
    const win=night?'#f3d795':'#627e8a';
    for(const p of parts){
      box(plot,0,p.y+p.h/2,0,p.w,p.h,p.d,color,b.id);
      const floors=Math.max(1,Math.min(8,Math.floor(p.h/.65)));
      for(let i=0;i<floors;i++)for(let column=-1;column<=1;column++){
        const y=p.y+.38+i*(p.h-.5)/floors;
        box(plot,column*p.w*.26,y,p.d/2+.018,.36,.29,.04,win,b.id);
        box(plot,p.w/2+.018,y,column*p.d*.26,.04,.29,.36,win,b.id);
      }
      box(plot,0,p.y+p.h+.06,0,p.w+.14,.12,p.d+.14,'#ece4d5',b.id);
      if(b.style==='terrace')box(plot,-p.w*.3,p.y+p.h+.18,p.d*.27,.4,.25,.48,'#7f9d76');
    }
    if(b.style==='modern') { box(plot,-1.35,h/2+.24,0,.18,h,3.05,'#e8e9df',b.id); box(plot,.9,h+.6,.6,.7,.6,.8,'#8a969b',b.id); }
    if(b.style==='spire'){
      const roof=new THREE.Mesh(new THREE.ConeGeometry(1.82,1.5,4),mat(color)); roof.rotation.y=Math.PI/4;roof.position.y=h+1;roof.userData.owner=b.id; roof.castShadow=true;plot.add(roof);
      box(plot,0,h+2,0,.07,1,.07,'#6d8188',b.id);
    }
    box(plot,0,.5,1.6,.6,.8,.04,'#647b80',b.id);
    box(plot,0,.17,2.5,.85,.06,1.2,'#e7e7d9');
    tree(plot,-2.25,-1.8,.75,box,mat); tree(plot,2.15,1.6,.55,box,mat);
    // A simple rooftop garden instead of a texture or subdivided material face.
    if(b.style==='terrace') tree(plot,.48,-.25,.38,box,mat,h+.36);
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
