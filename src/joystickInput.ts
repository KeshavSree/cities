/** A radial dead zone prevents drift; displacement controls walking speed. */
export function joystickInput(dx:number,dy:number,radius:number){
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(radius)||radius<=0)return {side:0,forward:0,x:0,y:0};
  const distance=Math.hypot(dx,dy),travel=Math.min(distance,radius),speed=Math.max(0,(travel/radius-.12)/.88);
  const x=distance?dx/distance:0,y=distance?dy/distance:0;
  return {side:speed?x*speed:0,forward:speed?-y*speed:0,x:x*travel,y:y*travel};
}
