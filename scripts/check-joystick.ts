import assert from 'node:assert/strict';
import { joystickInput } from '../src/joystickInput';
import { StreetWalk } from '../src/StreetWalk';

for(const [x,y] of [[0,0],[2,-2],[3,0]]){
  const input=joystickInput(x,y,40);assert.equal(input.side,0);assert.equal(input.forward,0,'Resting near the center does not drift');
}
const half=joystickInput(0,-20,40),full=joystickInput(0,-40,40);
assert(half.forward>0&&half.forward<full.forward);assert.equal(full.forward,1);
assert.equal(joystickInput(-40,0,40).side,-1);assert.equal(joystickInput(0,40,40).forward,-1);
const diagonal=joystickInput(120,-120,40);assert(Math.abs(Math.hypot(diagonal.side,diagonal.forward)-1)<1e-9);assert(Math.abs(Math.hypot(diagonal.x,diagonal.y)-40)<1e-9,'The thumb stays within its circular base');
for(const values of [[NaN,1,40],[1,Infinity,40],[1,1,0]] as const)assert.deepEqual(joystickInput(...values),{side:0,forward:0,x:0,y:0});

const windowEvents=new EventTarget(),documentEvents=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,querySelector:()=>null});
Object.assign(globalThis,{window:windowEvents,document:documentEvents});
const canvas=Object.assign(new EventTarget(),{dataset:{},style:{}}) as unknown as HTMLCanvasElement;
const walk=new StreetWalk(canvas,()=>{});walk.setEnabled(true);walk.face({x:0,z:-4});
const reset=()=>walk.camera.position.set(0,.76,0),distance=()=>Math.hypot(walk.camera.position.x,walk.camera.position.z);
reset();walk.joystick(0,1);walk.update(1);assert(Math.abs(distance()-1.6)<1e-9);
reset();walk.joystick(0,.25);walk.update(1);assert(Math.abs(distance()-.4)<1e-9,'A light push walks at partial speed');
reset();walk.joystick(1,1);walk.update(1);assert(Math.abs(distance()-1.6)<1e-9,'Diagonal input cannot exceed full walking speed');
walk.joystick(0,0);assert.equal(walk.update(1),false,'Releasing the stick stops walking');
walk.joystick(0,1);walk.setPaused(true);walk.joystick(1,1);walk.setPaused(false);assert.equal(walk.update(1),false,'Pausing clears input and cannot queue a later walk');
walk.joystick(0,1);windowEvents.dispatchEvent(new Event('blur'));assert.equal(walk.update(1),false,'Losing window focus clears analog movement');
walk.joystick(0,1);documentEvents.dispatchEvent(new Event('visibilitychange'));assert.equal(walk.update(1),false);
walk.joystick(0,1);walk.setEnabled(false);walk.setEnabled(true);assert.equal(walk.update(1),false,'Reentering Street view does not resume old movement');
walk.joystick(Infinity,NaN);assert.equal(walk.update(1),false);
walk.dispose();
console.log('Joystick checks passed: dead zone, analog speed, circular clamping, diagonal limits, release, pause, visibility, focus, and view changes.');
