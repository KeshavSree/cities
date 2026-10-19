import { useEffect, useRef } from 'react';
import { joystickInput } from './joystickInput';

const arrowKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export function StreetJoystick({onMove}:{onMove:(side:number,forward:number)=>void}){
  const button=useRef<HTMLButtonElement>(null),move=useRef(onMove);move.current=onMove;
  const pointer=useRef<{id:number;x:number;y:number;radius:number}|null>(null),keys=useRef(new Set<string>());
  const paint=(x:number,y:number,active:boolean)=>{
    button.current?.style.setProperty('--stick-x',`${x}px`);button.current?.style.setProperty('--stick-y',`${y}px`);
    if(button.current)button.current.dataset.active=String(active);
  };
  const stop=()=>{pointer.current=null;keys.current.clear();paint(0,0,false);move.current(0,0);};
  useEffect(()=>{
    window.addEventListener('blur',stop);window.addEventListener('resize',stop);document.addEventListener('visibilitychange',stop);window.visualViewport?.addEventListener('resize',stop);
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('resize',stop);document.removeEventListener('visibilitychange',stop);window.visualViewport?.removeEventListener('resize',stop);stop();};
  },[]);
  const point=(x:number,y:number)=>{
    const origin=pointer.current;if(!origin)return;
    const input=joystickInput(x-origin.x,y-origin.y,origin.radius);paint(input.x,input.y,true);move.current(input.side,input.forward);
  };
  const keyboard=()=>{
    const side=Number(keys.current.has('ArrowRight'))-Number(keys.current.has('ArrowLeft')),forward=Number(keys.current.has('ArrowUp'))-Number(keys.current.has('ArrowDown'));
    const length=Math.max(1,Math.hypot(side,forward)),radius=(button.current?.clientWidth??124)*.3;
    paint(side/length*radius,-forward/length*radius,Boolean(side||forward));move.current(side/length,forward/length);
  };
  return <button ref={button} className="street-joystick" aria-label="Walking joystick" aria-describedby="street-joystick-help" onBlur={stop}
    onPointerDown={event=>{
      if(event.button!==0||pointer.current)return;
      event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();keys.current.clear();
      pointer.current={id:event.pointerId,x:rect.left+rect.width/2,y:rect.top+rect.height/2,radius:rect.width*.3};
      event.currentTarget.setPointerCapture(event.pointerId);point(event.clientX,event.clientY);
    }}
    onPointerMove={event=>{if(pointer.current?.id===event.pointerId)point(event.clientX,event.clientY);}}
    onPointerUp={event=>{if(pointer.current?.id===event.pointerId)stop();}}
    onPointerCancel={event=>{if(pointer.current?.id===event.pointerId)stop();}}
    onLostPointerCapture={event=>{if(pointer.current?.id===event.pointerId)stop();}}
    onKeyDown={event=>{if(arrowKeys.has(event.key)){event.preventDefault();pointer.current=null;keys.current.add(event.key);keyboard();}}}
    onKeyUp={event=>{if(arrowKeys.has(event.key)){event.preventDefault();keys.current.delete(event.key);keyboard();}}}>
      <span className="street-joystick-thumb" aria-hidden="true"/>
      <span id="street-joystick-help" className="street-joystick-help">Drag to walk. Push farther to move faster. When focused, use arrow keys to walk.</span>
  </button>;
}
