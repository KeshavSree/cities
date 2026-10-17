import { shopAttachment } from '../shared/shopAttachments';
import * as THREE from 'three';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { DECORATIONS, decorationsOf, placementError, type DecorationDraft } from '../shared/decorations';
import type { Building } from '../shared/types';
import { plotPosition } from '../shared/world';
import { decorationModel } from './DecorationModels';
import { streetPlacement } from './streetPlacement';
import { SpatialIndex } from './SpatialIndex';
import type { StreetWalk } from './StreetWalk';

import { emptyStreetInteraction, type StreetInteractionState } from './streetInteractionState';
interface Options {buildings:Building[];ownerId:string|null;lightsOn:boolean;paused:boolean;onState:(state:StreetInteractionState)=>void;onSave:(draft:DecorationDraft)=>Promise<boolean>;onCancel:()=>void;}

/** Reticle picking and carried previews stay in the render loop, outside React. */
export class StreetInteraction {
  readonly group=new THREE.Group();
  private held:DecorationDraft|null=null;
  private targetId:string|null=null;
  private saving=false;
  private alive=true;
  private lastState='';
  private lastTouch=-Infinity;
  private mouseDownCanInteract=false;
  private preview:ReturnType<typeof streetPlacement>|null=null;
  private ray=new THREE.Raycaster();
  private direction=new THREE.Vector3();
  private boundsKey='';
  private bounds=new Map<string,THREE.Box3>();
  private tintValid:boolean|null=null;
  private ghostLightsOn=false;
  private spatial=new SpatialIndex<THREE.Object3D>(8);
  private spatialRevision=-1;
  private nearby=new Set<THREE.Object3D>();
  private meshBounds=new Map<THREE.Object3D,THREE.Box3>();
  private endpoint=new THREE.Vector3();
  private reticle=new THREE.Vector2();
  private placementKey='';
  private anchor:{position:THREE.Vector3;rotation:THREE.Quaternion}|null=null;

  constructor(private canvas:HTMLCanvasElement,private city:THREE.Group,private walk:StreetWalk,private options:()=>Options,private invalidate:()=>void,private movingItems=new THREE.Group()){
    this.ray.far=3.2;
    canvas.addEventListener('click',this.click);
    canvas.addEventListener('pointerdown',this.pointerDown,true);
    canvas.addEventListener('pointermove',this.touchMove);
    canvas.addEventListener('pointerup',this.touchUp);
    canvas.addEventListener('pointercancel',this.touchCancel);
    window.addEventListener('keydown',this.keyDown);
  }
  get carriedId(){return this.held?.id;}
  begin(draft:DecorationDraft,preservePosition=false){
    if(this.saving||this.held?.requestId===draft.requestId)return;
    this.held={...draft};this.preview=null;this.placementKey='';this.anchor=null;this.buildGhost();
    const owner=this.options().buildings.find(b=>b.id===this.options().ownerId);
    if(preservePosition&&owner&&draft.x!==null&&draft.z!==null){
      const origin=plotPosition(owner.x,owner.z);this.walk.face({x:origin.x+draft.x,z:origin.z+draft.z},.2);
      this.preview={x:draft.x,z:draft.z,rotation:draft.rotation,error:placementError(owner,draft.kind,{x:draft.x,z:draft.z,rotation:draft.rotation},draft.id)};
      this.anchor={position:this.walk.camera.position.clone(),rotation:this.walk.camera.quaternion.clone()};
    }

    this.walk.setBuildings(this.options().buildings,this.carriedId);this.invalidate();
  }
  takeDraft(){
    if(!this.held||this.saving)return null;
    const draft={...this.held,...(this.preview?{x:this.preview.x,z:this.preview.z,rotation:this.preview.rotation}:{})};
    this.held=null;this.preview=null;this.anchor=null;this.disposeGhost();this.walk.setBuildings(this.options().buildings);this.emit(emptyStreetInteraction);this.invalidate();return draft;
  }
  cancel=()=>{

    if(this.saving||!this.held)return;
    this.held=null;this.preview=null;this.disposeGhost();this.options().onCancel();
    this.walk.setBuildings(this.options().buildings);this.invalidate();
  };
  rotate=()=>{if(this.held&&this.held.kind!=='base_shop'&&!this.saving){this.held.rotation=(this.held.rotation+1)%4;this.invalidate();}};
  private emit(state:StreetInteractionState){const key=JSON.stringify(state);if(key!==this.lastState){this.lastState=key;this.options().onState(state);}}
  update(outline:OutlinePass){
    const config=this.options(),owner=config.buildings.find(b=>b.id===config.ownerId);
    if(!this.walk.enabled){if(this.held&&!this.saving)this.cancel();this.group.visible=false;this.targetId=null;this.emit(emptyStreetInteraction);return;}
    this.group.visible=!config.paused;
    outline.selectedObjects=[];outline.visibleEdgeColor.set('#b8db91');outline.hiddenEdgeColor.set('#000000');
    if(this.held&&owner){
      if(!this.held.id){
        const receipt=decorationsOf(owner).find(item=>item.id===`${owner.id}:${this.held!.requestId}`&&item.kind===this.held!.kind);
        if(receipt){this.held.id=receipt.id;this.placementKey='';this.walk.setBuildings(config.buildings,receipt.id);}
      }
      if(config.lightsOn!==this.ghostLightsOn)this.buildGhost();
      this.walk.camera.getWorldDirection(this.direction);
      const eye=this.walk.camera.position,key=`${eye.x}:${eye.y}:${eye.z}:${this.direction.x}:${this.direction.y}:${this.direction.z}:${this.held.rotation}:${owner.decorations}:${owner.level}:${owner.segments}`;
      const anchored=this.anchor&&eye.distanceToSquared(this.anchor.position)<1e-12&&Math.abs(this.walk.camera.quaternion.dot(this.anchor.rotation))>1-1e-10;
      if(!anchored)this.anchor=null;
      if(!this.saving&&key!==this.placementKey){
        if(anchored&&this.preview){this.preview.rotation=this.held.rotation;this.preview.error=placementError(owner,this.held.kind,this.preview,this.held.id);}
        else this.preview=streetPlacement(owner,this.held,eye,this.direction);
        this.placementKey=key;
      }


      if(this.preview){
        const origin=plotPosition(owner.x,owner.z);const attachment=this.held.kind==='base_shop'?shopAttachment(owner,this.preview):null;this.group.position.set(origin.x+this.preview.x,attachment?.y??.13,origin.z+this.preview.z);this.group.rotation.y=attachment?.angle??this.held.rotation*Math.PI/2;
        const valid=!this.preview.error,changed=valid!==this.tintValid;this.tintValid=valid;
        if(changed)this.group.traverse(object=>{if(object instanceof THREE.Mesh){const m=object.material as THREE.MeshStandardMaterial;m.color.set(valid?m.userData.original:'#d77866');}});
      }
      const definition=DECORATIONS[this.held.kind],funds=!this.held.id&&(owner.bricks??0)<definition.cost?`You need ${definition.cost-(owner.bricks??0)} more bricks.`:null;
      this.emit({target:null,carrying:definition.label,error:funds||this.preview?.error||null,saving:this.saving,purchase:!this.held.id,cost:definition.cost,attached:this.held.kind==='base_shop'});return;
    }
    this.targetId=null;
    if(!config.paused&&owner){
      this.ray.setFromCamera(this.reticle,this.walk.camera);
      const revision=this.city.userData.revision??this.city.children.at(-1)?.id??0;
      if(revision!==this.spatialRevision){
        this.spatialRevision=revision;this.spatial.clear();this.meshBounds.clear();
        for(const object of this.city.children)if(object instanceof THREE.Mesh){
          const bounds=new THREE.Box3().setFromObject(object);this.meshBounds.set(object,bounds);
          this.spatial.insert(object,{minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
        }
      }
      const origin=this.ray.ray.origin;this.endpoint.copy(this.ray.ray.direction).multiplyScalar(this.ray.far).add(origin);
      this.spatial.query({minX:Math.min(origin.x,this.endpoint.x),maxX:Math.max(origin.x,this.endpoint.x),minZ:Math.min(origin.z,this.endpoint.z),maxZ:Math.max(origin.z,this.endpoint.z)},this.nearby);

      const visible=(object:THREE.Object3D)=>{for(let current:THREE.Object3D|null=object;current;current=current.parent)if(!current.visible)return false;return !object.userData.noPick;};
      this.movingItems.updateMatrixWorld(true);
      const hit=this.ray.intersectObjects([...this.nearby].filter(visible).concat(this.movingItems.children.filter(visible)),true).find(hit=>visible(hit.object));
      // Aim at the whole item, including gaps between flower heads or a character's limbs.
      // Real geometry in front still occludes it, including fences and buildings.
      const key=`${owner.id}:${owner.decorations}:${revision}`;
      if(key!==this.boundsKey){
        this.boundsKey=key;this.bounds.clear();
        for(const object of this.city.children)if(object.userData.owner===owner.id&&object.userData.decoration){
          const id=object.userData.decoration,box=this.bounds.get(id)||new THREE.Box3();box.union(this.meshBounds.get(object)??new THREE.Box3().setFromObject(object));this.bounds.set(id,box);
        }
      }
      let id=hit?.object.userData.owner===owner.id?hit.object.userData.decoration:undefined,distance=Math.min(3.2,hit?.distance??3.2);
      for(const [candidate,box] of this.bounds){const point=this.ray.ray.intersectBox(box,new THREE.Vector3());if(point){const d=point.distanceTo(this.walk.camera.position);if(d<=distance+.005){id=candidate;distance=d;}}}
      for(const actor of this.movingItems.children)if(actor.userData.owner===owner.id&&visible(actor)){
        const point=this.ray.ray.intersectBox(new THREE.Box3().setFromObject(actor),new THREE.Vector3());
        if(point){const d=point.distanceTo(this.walk.camera.position);if(d<=distance+.005){id=actor.userData.decoration;distance=d;}}
      }
      const item=id?decorationsOf(owner).find(item=>item.id===id&&item.x!==null):null;
      const meshes:THREE.Object3D[]=item?this.city.children.filter(mesh=>mesh.userData.owner===owner.id&&mesh.userData.decoration===item.id&&visible(mesh)):[];
      if(item)this.movingItems.traverse(mesh=>{if(mesh instanceof THREE.Mesh&&mesh.userData.owner===owner.id&&mesh.userData.decoration===item.id&&visible(mesh))meshes.push(mesh);});
      if(item&&meshes.length){this.targetId=item.id;outline.selectedObjects=meshes;this.emit({...emptyStreetInteraction,target:DECORATIONS[item.kind].label});return;}
    }
    this.emit(emptyStreetInteraction);
  }
  private interact=async()=>{
    const config=this.options();if(!this.walk.enabled||config.paused||this.saving)return;
    const owner=config.buildings.find(b=>b.id===config.ownerId);if(!owner)return;
    if(!this.held){
      const item=decorationsOf(owner).find(item=>item.id===this.targetId&&item.x!==null&&item.z!==null);
      if(item)this.begin({...item,requestId:crypto.randomUUID()});return;
    }
    if(!this.preview||this.preview.error||!this.held.id&&(owner.bricks??0)<DECORATIONS[this.held.kind].cost){this.invalidate();return;}
    const draft={...this.held,x:this.preview.x,z:this.preview.z,rotation:this.preview.rotation};this.saving=true;this.invalidate();
    let saved=false;
    try{saved=await config.onSave(draft);}finally{
      if(!this.alive)return;this.saving=false;
      if(saved){this.held=null;this.preview=null;this.disposeGhost();this.options().onCancel();}
      this.walk.setBuildings(this.options().buildings,this.carriedId);this.invalidate();
    }
  };
  private click=(event:MouseEvent)=>{
    const readyAtStart=this.mouseDownCanInteract;this.mouseDownCanInteract=false;
    if(event.button!==0||performance.now()-this.lastTouch<600||!readyAtStart)return;
    event.preventDefault();if(this.walk.mouseLocked||this.walk.mouseCaptureBlocked||this.held)void this.interact();
  };
  private touches=new Set<number>();
  private touchDownPoint:{id:number;x:number;y:number}|null=null;
  private pointerDown=(event:PointerEvent)=>{
    // Snapshot before requesting capture: the initial capture click cannot also pick up.
    if(event.pointerType==='mouse'){this.mouseDownCanInteract=event.button===0&&(this.walk.mouseLocked||this.walk.mouseCaptureBlocked||Boolean(this.held));return;}
    if(event.pointerType!=='touch')return;
    this.touches.add(event.pointerId);
    if(this.touches.size>1){this.touchDownPoint=null;return;}
    this.touchDownPoint={id:event.pointerId,x:event.clientX,y:event.clientY};
  };
  private touchMove=(event:PointerEvent)=>{
    const start=this.touchDownPoint;
    if(start?.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)this.touchDownPoint=null;
  };
  private touchCancel=(event:PointerEvent)=>{this.touches.delete(event.pointerId);this.touchDownPoint=null;this.mouseDownCanInteract=false;};
  private touchUp=(event:PointerEvent)=>{
    if(event.pointerType!=='touch')return;
    this.touches.delete(event.pointerId);this.lastTouch=performance.now();
    const start=this.touchDownPoint;this.touchDownPoint=null;
    if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;
    void this.interact();
  };
  private keyDown=(event:KeyboardEvent)=>{
    if(!this.walk.enabled)return;
    if(event.code==='KeyF'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&document.activeElement===this.canvas){event.preventDefault();void this.interact();return;}
    if(!this.held)return;
    if(event.code==='Escape'){this.cancel();return;}
    if(this.options().paused)return;
    if(event.code==='KeyR'){event.preventDefault();this.rotate();}
    if(event.code==='Backspace'){event.preventDefault();this.cancel();}
  };
  private buildGhost(){
    this.disposeGhost();if(!this.held)return;this.ghostLightsOn=this.options().lightsOn;
    const materials=new Map<string,THREE.MeshStandardMaterial>();
    const mat=(color:string)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,transparent:true,opacity:.7,roughness:.85,depthWrite:false});m.userData.original=color;materials.set(color,m);}return m;};
    const box=(group:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{const object=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));object.position.set(x,y,z);group.add(object);return object;};
    decorationModel(this.group,this.held.kind,this.options().lightsOn,box,mat,undefined,false);this.tintValid=null;
  }
  private disposeGhost(){
    const materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const m=object.material;for(const material of Array.isArray(m)?m:[m])materials.add(material);}});materials.forEach(m=>m.dispose());this.group.clear();
  }
  dispose(){this.alive=false;this.canvas.removeEventListener('click',this.click);this.canvas.removeEventListener('pointerdown',this.pointerDown,true);this.canvas.removeEventListener('pointermove',this.touchMove);this.canvas.removeEventListener('pointerup',this.touchUp);this.canvas.removeEventListener('pointercancel',this.touchCancel);window.removeEventListener('keydown',this.keyDown);this.disposeGhost();}
}
