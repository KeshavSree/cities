import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Archive, Box, Grid3X3, Map as MapIcon, Move, Package, RotateCw, X } from 'lucide-react';
import type { Building } from '../shared/types';
import { DECORATIONS, decorationsOf, decorationSpace, MAX_DECORATIONS, placementError, type Decoration, type DecorationDraft, type DecorationKind } from '../shared/decorations';
import { decorationModel } from './DecorationModels';
import { disposeGroup } from './sceneResources';
import './decorations.css';

const thumbnailCache=new Map<DecorationKind,string>();
function ensureThumbnails(){
  if(thumbnailCache.size)return;
  const canvas=document.createElement('canvas');canvas.width=180;canvas.height=132;
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(180,132,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);
  for(const kind of Object.keys(DECORATIONS) as DecorationKind[]){
    const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
    const material=(color:string)=>new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0});
    const box=(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
    decorationModel(group,kind,false,box,material,undefined,false);
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,.8);
    group.position.sub(center);group.rotation.y=-.55;
    scene.add(new THREE.HemisphereLight('#ffffff','#91a683',2.5));
    const sun=new THREE.DirectionalLight('#fff0d8',3.3);sun.position.set(3,5,4);scene.add(sun);
    const camera=new THREE.PerspectiveCamera(28,180/132,.01,50);camera.position.set(span*1.7,span*1.05,span*2.15);camera.lookAt(0,0,0);
    renderer.render(scene,camera);thumbnailCache.set(kind,canvas.toDataURL('image/png'));disposeGroup(group);
  }
  renderer.forceContextLoss();renderer.dispose();
}

function DecorationThumbnail({kind}:{kind:DecorationKind}){
  const [src,setSrc]=useState(()=>thumbnailCache.get(kind)||'');
  useEffect(()=>{
    if(src)return;
    ensureThumbnails();setSrc(thumbnailCache.get(kind)||'');
  },[kind,src]);
  return src?<img src={src} alt=""/>:<span className="street-model-loading"/>;
}

interface Props {
  building:Building;draft:DecorationDraft|null;busy:boolean;
  onChoose:(kind:DecorationKind,item?:Decoration)=>void;onStore:(item:Decoration)=>void;
  onChange:(draft:DecorationDraft)=>void;onCancel:()=>void;onConfirm:()=>void;onClose:()=>void;
}

export function StreetEditor({building,draft,busy,onChoose,onStore,onChange,onCancel,onConfirm,onClose}:Props){
  const [tab,setTab]=useState<'build'|'placed'>('build');
  const owned=decorationsOf(building),definition=draft?DECORATIONS[draft.kind]:null;
  const hasPoint=Boolean(draft&&draft.x!==null&&draft.z!==null);
  const error=draft&&hasPoint?placementError(building,draft.kind,{x:draft.x!,z:draft.z!,rotation:draft.rotation},draft.id):draft?'Move your pointer across the grid.':null;
  const affordable=Boolean(draft?.id)||!definition||(building.bricks??0)>=definition.cost;
  return <section className="street-editor" aria-label="Your Streetview editor">
    <div className="street-editor-titlebar"><button data-editor-action="close" onClick={onClose} disabled={busy} aria-label="Return to city view"><MapIcon size={18}/><span>City view</span></button><strong>Your Streetview</strong><span className="street-editor-balance"><Package size={14}/>{(building.bricks??0).toLocaleString()}</span></div>
    <div className="street-editor-stage-target" aria-hidden="true"/>
    <div className="street-editor-dock">
      {draft&&definition&&<div className={`street-editor-placement-status ${error&&hasPoint?'is-invalid':''}`}>
        <button className="editor-cancel" aria-label="Cancel placement" onClick={onCancel} disabled={busy}><X size={18}/></button>
        <div><strong>{draft.id?'Move':`Place ${definition.label.toLowerCase()}`}</strong><span>{error||'Locked to the grid'}</span></div>
        {draft.kind!=='base_shop'&&<button data-editor-action="rotate" aria-label="Rotate item" onClick={()=>onChange({...draft,rotation:(draft.rotation+1)%4})} disabled={busy}><RotateCw size={18}/><span>Rotate</span></button>}
        <button data-editor-action="confirm" className="editor-place" onClick={onConfirm} disabled={busy||Boolean(error)||!affordable}><Package size={16}/><span>{busy?'Saving…':draft.id?'Place':'Buy & place'}</span></button>
      </div>}
      <div className="street-editor-tabs" role="tablist" aria-label="Streetview items"><button role="tab" aria-selected={tab==='build'} onClick={()=>setTab('build')}><Box size={16}/>Build</button><button role="tab" aria-selected={tab==='placed'} onClick={()=>setTab('placed')}><Grid3X3 size={16}/>Placed <span>{owned.length}</span></button></div>
      {tab==='build'?<div className="street-model-shelf" role="list" aria-label="Models to place">{Object.entries(DECORATIONS).map(([id,item])=>{
        const kind=id as DecorationKind,locked=kind==='base_shop'&&building.level<4;
        return <button role="listitem" data-decoration-kind={kind} className={draft?.kind===kind&&!draft.id?'is-selected':''} key={kind} disabled={busy||owned.length>=MAX_DECORATIONS||locked} onClick={()=>onChoose(kind)} aria-label={`${item.label}, ${item.cost} bricks${locked?', unlocks at level 4':''}`}><span className="street-model"><DecorationThumbnail kind={kind}/></span><strong>{item.label}</strong><small>{locked?'Level 4':<><Package size={11}/>{item.cost}</>}</small></button>;
      })}</div>:<div className="street-owned-shelf" role="list" aria-label="Your placed items">{owned.length?owned.map((item,index)=>{
        const itemDefinition=DECORATIONS[item.kind],placed=item.x!==null&&item.z!==null,needsSpace=placed&&Boolean(decorationSpace(building,item.kind,{x:item.x!,z:item.z!,rotation:item.rotation}));
        return <div role="listitem" className="street-owned-item" key={item.id}><span><DecorationThumbnail kind={item.kind}/></span><div><strong>{itemDefinition.label}</strong><small>{needsSpace?'Needs a new spot':placed?'Placed':'Stored'}</small></div><button onClick={()=>onChoose(item.kind,item)} disabled={busy} aria-label={`${placed?'Move':'Place'} ${itemDefinition.label} ${index+1}`}><Move size={16}/></button>{placed&&<button onClick={()=>onStore(item)} disabled={busy} aria-label={`Store ${itemDefinition.label} ${index+1}`}><Archive size={16}/></button>}</div>;
      }):<p>Your placed items will appear here.</p>}</div>}
    </div>
  </section>;
}
