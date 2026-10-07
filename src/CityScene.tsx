import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, type Building } from '../shared/types';

export interface SceneHandle { focus: (b: Building) => void; reset: () => void; zoom: (amount: number) => void; }
interface Props { buildings: Building[]; selected: string | null; night: boolean; center: {x:number;z:number}; onSelect: (id: string) => void; onPan: (x: number, z: number) => void; }
const SPACING = 7;
const heightOf = (level: number) => 2.3 + Math.sqrt(level) * 1.65;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CityScene = forwardRef<SceneHandle, Props>(function CityScene({ buildings, selected, night, center, onSelect, onPan }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.OrthographicCamera; controls: OrbitControls; city: THREE.Group; selection: THREE.Group; focus: THREE.Vector3 | null; night: boolean; resize: () => void } | null>(null);
  const props = useRef({ buildings, selected, onSelect, onPan }); props.current = { buildings, selected, onSelect, onPan };
  const [unavailable, setUnavailable] = useState(false);
  useImperativeHandle(ref, () => ({
    focus(b) { if (engine.current) engine.current.focus = new THREE.Vector3(b.x * SPACING, 0, b.z * SPACING); },
    reset() { const e = engine.current; if (!e) return; e.focus = new THREE.Vector3(0,0,0); e.camera.position.set(38, 36, 46).add(e.controls.target); e.camera.zoom = .83; e.camera.updateProjectionMatrix(); },
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
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D city. Drag to orbit, scroll to zoom, or select a tower. Use the resident list for keyboard navigation.');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-32,32,24,-24,.1,5000);
    camera.zoom = .83;
    camera.position.set(38,36,46);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0,0,0); controls.enableDamping = !reducedMotion(); controls.dampingFactor = .09;
    controls.minZoom = .4; controls.maxZoom = 3.8; controls.maxPolarAngle = Math.PI / 2.55; controls.minPolarAngle = .25;
    controls.enablePan = true; controls.screenSpacePanning = false;
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
    renderer.domElement.addEventListener('pointerdown',pointerDown); renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointercancel',pointerCancel);
    renderer.domElement.addEventListener('pointermove', move); controls.addEventListener('end', panEnd);
    let frame: number;
    function animate() {
      frame = requestAnimationFrame(animate);
      const e = engine.current;
      if (e?.focus) {
        const delta = e.focus.clone().sub(controls.target);
        const step = reducedMotion() ? 1 : .08;
        controls.target.addScaledVector(delta,step); camera.position.addScaledVector(delta,step);
        if (delta.length() < .03) { e.focus = null; panEnd(); }
      }
      ambient.intensity = e?.night ? 1.1 : 2.8; sun.intensity = e?.night ? .55 : 3.1;
      controls.update(); renderer.render(scene,camera);
    }
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',pointerDown); renderer.domElement.removeEventListener('pointerup',pointerUp);
      renderer.domElement.removeEventListener('pointercancel',pointerCancel);
      renderer.domElement.removeEventListener('pointermove',move); disposeGroup(city); disposeGroup(selection); renderer.dispose();
      renderer.domElement.remove(); engine.current = null;
    };
  }, []);

  useEffect(() => {
    const e = engine.current; if (!e) return;
    e.night = night; disposeGroup(e.city);
    buildCity(e.city,buildings.filter(b=>Math.abs(b.x-center.x)<=8&&Math.abs(b.z-center.z)<=8),night,center);
  }, [buildings,night,center.x,center.z]);
  useEffect(() => {
    const e = engine.current; if (!e) return; disposeGroup(e.selection);
    const b = buildings.find(b=>b.id===selected); if (!b) return;
    const material = new THREE.MeshBasicMaterial({ color: '#7971e0', transparent: true, opacity: .85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5,2.65,4,1,Math.PI/4), material);
    ring.rotation.x = -Math.PI/2; ring.position.set(b.x*SPACING,.09,b.z*SPACING); e.selection.add(ring);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.25),new THREE.MeshBasicMaterial({ color: '#7971e0' }));
    marker.position.set(b.x*SPACING,heightOf(b.level)+2,b.z*SPACING); e.selection.add(marker);
  }, [selected,buildings]);
  return <div className="scene" ref={host}>{unavailable && <div className="webgl-fallback"><h2>Your city needs WebGL</h2><p>Enable hardware acceleration or open a browser that supports WebGL. You can still use the resident list and building controls.</p></div>}</div>;
});

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  group.traverse(o=>{ if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) materials.add(m); } });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); group.clear();
}
function buildCity(group: THREE.Group, buildings: Building[], night: boolean,center:{x:number;z:number}) {
  const materials = new Map<string,THREE.MeshStandardMaterial>();
  const mat = (color: string) => { if (!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 })); return materials.get(color)!; };
  const box = (parent: THREE.Group, x:number,y:number,z:number,w:number,h:number,d:number,color:string,owner?:string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); mesh.position.set(x,y,z); mesh.castShadow = h>.3; mesh.receiveShadow = true;
    if (owner) mesh.userData.owner = owner; parent.add(mesh); return mesh;
  };
  const xs=buildings.map(b=>b.x), zs=buildings.map(b=>b.z);
  const minX = Math.min(center.x-3,...xs)-1, maxX = Math.max(center.x+3,...xs)+1, minZ = Math.min(center.z-3,...zs)-1, maxZ = Math.max(center.z+3,...zs)+1;
  const w=(maxX-minX+1)*SPACING,d=(maxZ-minZ+1)*SPACING,cx=(maxX+minX)*SPACING/2,cz=(maxZ+minZ)*SPACING/2;
  box(group,cx,-1,cz,w+2,1.8,d+2,'#94ad91'); box(group,cx,-.12,cz,w,.18,d,night?'#5d776b':'#c2d4b0');
  box(group,cx,-1.5,cz,w+6,.4,d+6,night?'#598a9b':'#a8cdd6');
  for (let x=minX;x<=maxX;x++) {
    box(group,x*SPACING+SPACING/2,-.015,cz,1.15,.08,d,'#b9c2be');
    box(group,x*SPACING+SPACING/2,.035,cz,.69,.025,d,'#d9ded6');
    for (let z=minZ;z<=maxZ;z++) {
      box(group,x*SPACING,.005,z*SPACING+SPACING/2,SPACING,.08,1.15,'#b9c2be');
      box(group,x*SPACING,.055,z*SPACING+SPACING/2,SPACING,.025,.69,'#d9ded6');
    }
  }
  const taken=new Set(buildings.map(b=>`${b.x},${b.z}`));
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    if(taken.has(`${x},${z}`))continue;
    const treeCount = Math.abs(x*13+z*7)%3+1;
    for(let i=0;i<treeCount;i++) tree(group,x*SPACING+(i-1)*1.55,z*SPACING+Math.sin(x+z+i)*1.7,.8+Math.abs(Math.sin(x*3+z+i))*.5,box,mat);
    if((x+z)%3===0) { box(group,x*SPACING,.2,z*SPACING+2.5,1.3,.25,.35,'#b49775'); box(group,x*SPACING,.48,z*SPACING+2.62,1.3,.36,.13,'#b49775'); }
  }
  for(const b of buildings){
    const plot=new THREE.Group(); plot.position.set(b.x*SPACING,0,b.z*SPACING); group.add(plot);
    const color=COLORS[b.color]?.hex || COLORS.sand.hex; const h=heightOf(b.level);
    box(plot,0,.04,0,5.8,.12,5.8,'#b3c8a0'); box(plot,0,.14,0,4.3,.17,4.3,'#e1dfd4',b.id);
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
  // Small plaza: the neighborhood's shared patch of green.
  box(group,3*SPACING,.1,0,5.7,.12,5.7,'#b1c6a0');
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.5,.25,8),mat('#e1e1d6')); fountain.position.set(3*SPACING,.25,0);group.add(fountain);
  const water=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,.03,8),mat('#87bcc7')); water.position.set(3*SPACING,.39,0);group.add(water);
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
