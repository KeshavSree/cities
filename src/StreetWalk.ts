import * as THREE from 'three';
import { canWalk, EYE_HEIGHT, WALK_RADIUS, streetArrival, streetObstacles, walkStep, type StreetPoint, type StreetStart } from './streetNavigation';
import type { Building } from '../shared/types';
import { plotPlan } from '../shared/plots';
import { SpatialIndex,pointBounds } from './SpatialIndex';

export type WalkDirection='forward'|'back'|'left'|'right';
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);

/** Independent eye-level controls; transient motion never goes through React. */
export class StreetWalk {
  readonly camera=new THREE.PerspectiveCamera(66,1,.025,180);
  enabled=false;
  private paused=false;
  private obstacleIndex=new SpatialIndex<StreetPoint[]>(4);
  private obstacleKey='';
  private nearObstacles=new Set<StreetPoint[]>();
  private yaw=0;
  private pitch=0;
  private keys=new Set<string>();
  private touch=new Set<WalkDirection>();
  private drag:{id:number;x:number;y:number}|null=null;
  private wantMouseLook=false;
  private hadNativeLock=false;
  private obstacles:StreetPoint[][]=[];

  constructor(private canvas:HTMLCanvasElement,private invalidate:()=>void,private onLockChange:(locked:boolean,blocked?:boolean)=>void=()=>{}){
    this.camera.rotation.order='YXZ';
    window.addEventListener('keydown',this.keyDown);
    window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',this.releaseMouse);
    document.addEventListener('visibilitychange',this.clear);
    document.addEventListener('focusin',this.focusChanged);
    canvas.addEventListener('pointerdown',this.pointerDown);
    canvas.addEventListener('pointermove',this.pointerMove);
    canvas.addEventListener('pointerup',this.pointerEnd);
    canvas.addEventListener('pointercancel',this.pointerEnd);
    canvas.addEventListener('lostpointercapture',this.pointerEnd);
    canvas.addEventListener('contextmenu',this.contextMenu);
    document.addEventListener('pointerlockchange',this.lockChanged);
    document.addEventListener('pointerlockerror',this.lockFailed);
    document.addEventListener('mousemove',this.nativeMouseMove);
  }

  setBuildings(buildings:Building[],ignoreDecoration?:string){
    const key=ignoreDecoration+'|'+buildings.map(b=>[b.id,b.x,b.z,b.level,b.style,b.segments,b.decorations].join(':')).join('|');
    if(key===this.obstacleKey)return;this.obstacleKey=key;
    this.obstacles=streetObstacles(buildings,ignoreDecoration);this.obstacleIndex.clear();
    for(const polygon of this.obstacles)this.obstacleIndex.insert(polygon,pointBounds(polygon,WALK_RADIUS));

    if(this.enabled&&!canWalk(this.camera.position,this.obstacles)){
      // A live level-up can grow a foundation around the walker.
      const nearest=[...buildings].sort((a,b)=>{
        const aa=streetArrival(a,[]),bb=streetArrival(b,[]);
        return (aa?Math.hypot(aa.point.x-this.camera.position.x,aa.point.z-this.camera.position.z):Infinity)-(bb?Math.hypot(bb.point.x-this.camera.position.x,bb.point.z-this.camera.position.z):Infinity);
      });
      for(const building of nearest)if(this.arrive(building))break;
    }
  }
  arrive(building:Pick<Building,'x'|'z'>){
    const arrival=streetArrival(building,this.obstacles);if(!arrival)return false;
    this.camera.position.set(arrival.point.x,EYE_HEIGHT,arrival.point.z);
    const [a,b]=plotPlan(building.x,building.z).frontage.points;
    const length=Math.hypot(b.x-a.x,b.z-a.z);
    const toward=new THREE.Vector2(arrival.target.x-arrival.point.x,arrival.target.z-arrival.point.z).normalize();
    // Start looking down the street, with the resident's entrance in view.
    this.face({x:arrival.point.x+(b.x-a.x)/length*4+toward.x*1.4,z:arrival.point.z+(b.z-a.z)/length*4+toward.y*1.4});
    return true;
  }
  startAt(start:StreetStart){
    if(!canWalk(start.point,this.obstacles))return false;
    this.camera.position.set(start.point.x,EYE_HEIGHT,start.point.z);this.face(start.target);return true;
  }
  face(point:StreetPoint,height?:number){
    this.yaw=Math.atan2(this.camera.position.x-point.x,this.camera.position.z-point.z);
    this.pitch=height===undefined?.07:Math.atan2(height-this.camera.position.y,Math.hypot(point.x-this.camera.position.x,point.z-this.camera.position.z));this.orient();this.invalidate();
  }
  get mouseLocked(){return document.pointerLockElement===this.canvas;}
  get mouseCaptureBlocked(){return this.canvas.dataset.mouseLook==='blocked';}
  requestMouseLook(){
    if(!this.enabled||this.blocked()||this.mouseLocked)return;
    if(window.matchMedia('(pointer:coarse)').matches&&!window.matchMedia('(any-pointer:fine)').matches)return;
    this.wantMouseLook=true;this.canvas.focus({preventScroll:true});delete this.canvas.dataset.mouseLookError;
    this.onLockChange(false);
    if(!this.canvas.requestPointerLock){this.canvas.dataset.mouseLookError='unsupported';this.lockFailed();return;}
    try{Promise.resolve(this.canvas.requestPointerLock()).catch(error=>{this.canvas.dataset.mouseLookError=error?.name||'unavailable';this.lockFailed();});}catch{this.lockFailed();}
  }
  releaseMouse=()=>{
    this.wantMouseLook=false;this.hadNativeLock=false;this.canvas.style.cursor='crosshair';this.canvas.dataset.mouseLook='released';
    if(this.mouseLocked)document.exitPointerLock();this.clear();this.onLockChange(false);
  };
  private lockFailed=()=>{
    if(this.mouseLocked||!this.wantMouseLook)return;
    this.wantMouseLook=false;this.canvas.style.cursor='crosshair';this.canvas.dataset.mouseLook='blocked';
    this.onLockChange(false,true);this.invalidate();
  };
  private lockChanged=()=>{
    this.clear();
    if(this.mouseLocked){
      if(!this.enabled||this.blocked()||!this.wantMouseLook){this.releaseMouse();return;}
      this.hadNativeLock=true;this.canvas.style.cursor='none';this.canvas.dataset.mouseLook='pointer-lock';this.onLockChange(true);
    }else if(this.hadNativeLock)this.releaseMouse();
    this.invalidate();
  };
  private turnMouse(dx:number,dy:number){
    this.yaw-=dx*.0028;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.0028,-1.15,1.4);this.orient();this.invalidate();
  }
  private nativeMouseMove=(event:MouseEvent)=>{if(this.enabled&&document.pointerLockElement===this.canvas&&!this.blocked())this.turnMouse(event.movementX||0,event.movementY||0);};
  setEnabled(enabled:boolean){if(this.enabled===enabled)return;this.enabled=enabled;this.clear();if(!enabled)this.releaseMouse();}
  setPaused(paused:boolean){this.paused=paused;if(paused)this.releaseMouse();}
  input(direction:WalkDirection,held:boolean){
    if(!this.enabled||this.paused)return;
    if(held)this.touch.add(direction);else this.touch.delete(direction);
    this.invalidate();
  }
  private blocked=()=>this.paused||document.hidden||Boolean(document.querySelector('[aria-modal="true"]'));
  private keyDown=(event:KeyboardEvent)=>{
    if(!this.enabled)return;
    if(event.code==='Escape'){this.releaseMouse();return;}
    if(!movementKeys.has(event.code)||event.metaKey||event.ctrlKey||event.altKey||this.blocked()||document.activeElement!==this.canvas)return;
    event.preventDefault();this.keys.add(event.code);this.invalidate();
  };
  private keyUp=(event:KeyboardEvent)=>{this.keys.delete(event.code);};
  private clear=()=>{this.keys.clear();this.touch.clear();this.drag=null;};
  private focusChanged=()=>{if(document.activeElement!==this.canvas){this.keys.clear();this.drag=null;}};
  private pointerDown=(event:PointerEvent)=>{
    if(!this.enabled||this.blocked()||event.button!==0||this.drag)return;
    if(event.pointerType==='mouse'){if(!this.mouseLocked)this.requestMouseLook();return;}
    this.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    this.canvas.setPointerCapture(event.pointerId);
  };
  private pointerMove=(event:PointerEvent)=>{
    if(!this.enabled||!this.drag||this.drag.id!==event.pointerId||this.blocked())return;
    this.yaw-=(event.clientX-this.drag.x)*.004;
    this.pitch=THREE.MathUtils.clamp(this.pitch-(event.clientY-this.drag.y)*.004,-1.15,1.4);
    this.drag.x=event.clientX;this.drag.y=event.clientY;this.orient();this.invalidate();
  };
  private pointerEnd=(event:PointerEvent)=>{if(this.drag?.id===event.pointerId)this.drag=null;};
  private contextMenu=(event:Event)=>{if(this.enabled)event.preventDefault();};
  private orient(){this.camera.rotation.set(this.pitch,this.yaw,0);this.camera.updateMatrixWorld();}

  update(seconds:number){
    if(!this.enabled||this.blocked()){this.clear();return false;}
    const down=(key:string)=>Number(this.keys.has(key));
    const forward=down('KeyW')-down('KeyS')+Number(this.touch.has('forward'))-Number(this.touch.has('back'));
    const side=down('KeyD')-down('KeyA')+Number(this.touch.has('right'))-Number(this.touch.has('left'));
    const turn=down('KeyQ')-down('KeyE')+down('ArrowLeft')-down('ArrowRight');
    const tilt=down('ArrowUp')-down('ArrowDown');
    if(!forward&&!side&&!turn&&!tilt)return false;
    this.yaw+=turn*seconds*1.3;this.pitch=THREE.MathUtils.clamp(this.pitch+tilt*seconds,-1.15,1.4);this.orient();
    const scale=seconds*1.6/Math.max(1,Math.hypot(forward,side));
    const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*scale;
    const dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*scale;
    const point=this.camera.position;this.obstacleIndex.query({minX:Math.min(point.x,point.x+dx),maxX:Math.max(point.x,point.x+dx),minZ:Math.min(point.z,point.z+dz),maxZ:Math.max(point.z,point.z+dz)},this.nearObstacles);
    const next=walkStep(point,dx,dz,[...this.nearObstacles]);
    this.camera.position.set(next.x,EYE_HEIGHT,next.z);
    return true;
  }
  dispose(){
    window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.releaseMouse);
    document.removeEventListener('visibilitychange',this.clear);document.removeEventListener('focusin',this.focusChanged);
    this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);
    this.canvas.removeEventListener('pointerup',this.pointerEnd);this.canvas.removeEventListener('pointercancel',this.pointerEnd);
    this.canvas.removeEventListener('lostpointercapture',this.pointerEnd);this.canvas.removeEventListener('contextmenu',this.contextMenu);document.removeEventListener('pointerlockchange',this.lockChanged);document.removeEventListener('pointerlockerror',this.lockFailed);document.removeEventListener('mousemove',this.nativeMouseMove);this.releaseMouse();
  }
}
