import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','Space']);

/** Continuous camera motion, independent of keyboard repeat speed and frame rate. */
export class CameraKeyboard {
  private held=new Set<string>();
  private forward=new THREE.Vector3();
  private right=new THREE.Vector3();
  private movement=new THREE.Vector3();
  private offset=new THREE.Vector3();
  private up=new THREE.Vector3(0,1,0);

  constructor(private camera:THREE.OrthographicCamera,private controls:OrbitControls,private onStop:()=>void,private onStart:()=>void=()=>{}){
    window.addEventListener('keydown',this.keyDown);
    window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',this.clear);
    document.addEventListener('visibilitychange',this.visibility);
    document.addEventListener('focusin',this.focusChanged);
  }

  private blocked=()=>Boolean(document.querySelector('[aria-modal="true"]')||
    document.activeElement?.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="tab"],[role="textbox"]'));
  private keyDown=(event:KeyboardEvent)=>{
    if(event.ctrlKey||event.metaKey||event.altKey){this.clear();return;}
    if(!movementKeys.has(event.code)||this.blocked())return;
    event.preventDefault();
    const wasIdle=!this.held.size;this.held.add(event.code);
    if(wasIdle)this.onStart();
  };
  private keyUp=(event:KeyboardEvent)=>{if(this.held.delete(event.code)&&!this.held.size)this.onStop();};
  private clear=()=>{if(this.held.size){this.held.clear();this.onStop();}};
  private visibility=()=>{if(document.visibilityState!=='visible')this.clear();};
  private focusChanged=()=>{if(this.blocked())this.clear();};

  update(seconds:number){
    if(!this.held.size)return false;
    if(this.blocked()){this.clear();return false;}
    const down=(key:string)=>Number(this.held.has(key));
    const forward=down('KeyW')-down('KeyS'),side=down('KeyD')-down('KeyA');
    const vertical=down('Space')-Number(this.held.has('ShiftLeft')||this.held.has('ShiftRight'));
    const turn=down('KeyQ')-down('KeyE');
    if(!forward&&!side&&!vertical&&!turn)return false;
    if(turn){
      this.offset.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(this.up,turn*seconds*1.25);
      this.camera.position.copy(this.controls.target).add(this.offset);
      this.camera.lookAt(this.controls.target);
    }
    this.camera.getWorldDirection(this.forward);this.forward.y=0;this.forward.normalize();
    this.right.crossVectors(this.forward,this.up).normalize();
    this.movement.copy(this.forward).multiplyScalar(forward).addScaledVector(this.right,side);
    this.movement.y=vertical;
    this.movement.normalize().multiplyScalar(seconds*20/this.camera.zoom);
    this.camera.position.add(this.movement);this.controls.target.add(this.movement);
    return true;
  }

  dispose(){
    window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);
    window.removeEventListener('blur',this.clear);document.removeEventListener('visibilitychange',this.visibility);
    document.removeEventListener('focusin',this.focusChanged);this.held.clear();
  }
}
