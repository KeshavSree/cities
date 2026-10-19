import { useEffect, useRef } from 'react';
import { joystickInput } from './joystickInput';
import { captureStreetPointer } from './streetPointer';

const arrowKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export function StreetJoystick({onMove}:{onMove:(side:number,forward:number)=>void}){
  const zone=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),move=useRef(onMove);move.current=onMove;
  const pointer=useRef<{kind:'touch'|'pointer';id:number;x:number;y:number;radius:number}|null>(null),keys=useRef(new Set<string>());
  const paint=(x:number,y:number,active:boolean)=>{
    button.current?.style.setProperty('--stick-x',`${x}px`);button.current?.style.setProperty('--stick-y',`${y}px`);
    if(button.current)button.current.dataset.active=String(active);
  };
  const stop=()=>{pointer.current=null;keys.current.clear();paint(0,0,false);move.current(0,0);};
  const home=()=>{button.current?.style.removeProperty('--joystick-origin-x');button.current?.style.removeProperty('--joystick-origin-y');};
  const point=(x:number,y:number)=>{
    const origin=pointer.current;if(!origin)return;
    const input=joystickInput(x-origin.x,y-origin.y,origin.radius);paint(input.x,input.y,true);move.current(input.side,input.forward);
  };
  const begin=(kind:'touch'|'pointer',id:number,x:number,y:number)=>{
    if(pointer.current||!zone.current)return;
    button.current?.blur();keys.current.clear();const rect=zone.current.getBoundingClientRect();
    button.current?.style.setProperty('--joystick-origin-x',`${x-rect.left}px`);
    button.current?.style.setProperty('--joystick-origin-y',`${y-rect.top}px`);
    pointer.current={kind,id,x,y,radius:(button.current?.offsetWidth??124)*.3};point(x,y);
  };
  useEffect(()=>{
    const element=zone.current!;
    // Read native touch coordinates and identifiers. Walking must not depend on
    // PointerEvent capture support or synthesized mouse coordinates on phones.
    const touchStart=(event:TouchEvent)=>{if(pointer.current)return;const touch=event.changedTouches[0];if(touch){event.preventDefault();begin('touch',touch.identifier,touch.clientX,touch.clientY);}};
    const touchMove=(event:TouchEvent)=>{const active=pointer.current;if(active?.kind!=='touch')return;const touch=Array.from(event.changedTouches).find(t=>t.identifier===active.id);if(touch){event.preventDefault();point(touch.clientX,touch.clientY);}};
    const touchEnd=(event:TouchEvent)=>{const active=pointer.current;if(active?.kind==='touch'&&Array.from(event.changedTouches).some(t=>t.identifier===active.id))stop();};
    const pointerMove=(event:PointerEvent)=>{if(pointer.current?.kind==='pointer'&&pointer.current.id===event.pointerId)point(event.clientX,event.clientY);};
    const pointerEnd=(event:PointerEvent)=>{if(pointer.current?.kind==='pointer'&&pointer.current.id===event.pointerId)stop();};
    element.addEventListener('touchstart',touchStart,{passive:false});window.addEventListener('touchmove',touchMove,{passive:false});window.addEventListener('touchend',touchEnd);window.addEventListener('touchcancel',touchEnd);
    window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerEnd);window.addEventListener('pointercancel',pointerEnd);
    window.addEventListener('blur',stop);window.addEventListener('resize',stop);document.addEventListener('visibilitychange',stop);window.visualViewport?.addEventListener('resize',stop);
    return()=>{
      element.removeEventListener('touchstart',touchStart);window.removeEventListener('touchmove',touchMove);window.removeEventListener('touchend',touchEnd);window.removeEventListener('touchcancel',touchEnd);
      window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerEnd);window.removeEventListener('pointercancel',pointerEnd);
      window.removeEventListener('blur',stop);window.removeEventListener('resize',stop);document.removeEventListener('visibilitychange',stop);window.visualViewport?.removeEventListener('resize',stop);stop();
    };
  },[]);
  const keyboard=()=>{
    const side=Number(keys.current.has('ArrowRight'))-Number(keys.current.has('ArrowLeft')),forward=Number(keys.current.has('ArrowUp'))-Number(keys.current.has('ArrowDown'));
    const length=Math.max(1,Math.hypot(side,forward)),radius=(button.current?.clientWidth??124)*.3;
    paint(side/length*radius,-forward/length*radius,Boolean(side||forward));move.current(side/length,forward/length);
  };
  return <div ref={zone} className="street-joystick-zone" aria-label="Left side walking area"
    onPointerDown={event=>{
      if((event.pointerType==='touch'&&'ontouchstart' in window)||event.button!==0||pointer.current)return;
      event.preventDefault();begin('pointer',event.pointerId,event.clientX,event.clientY);captureStreetPointer(event.currentTarget,event.pointerId);
    }}>
    <button ref={button} className="street-joystick" aria-label="Walking joystick" aria-describedby="street-joystick-help" onBlur={stop} onFocus={()=>{if(!pointer.current)home();}}
      onKeyDown={event=>{if(arrowKeys.has(event.key)){event.preventDefault();pointer.current=null;keys.current.add(event.key);keyboard();}}}
      onKeyUp={event=>{if(arrowKeys.has(event.key)){event.preventDefault();keys.current.delete(event.key);keyboard();}}}>
      <span className="street-joystick-thumb" aria-hidden="true"/>
      <span id="street-joystick-help" className="street-joystick-help">Touch anywhere on the left and drag to walk. Push farther to move faster. When focused, use arrow keys to walk.</span>
    </button>
  </div>;
}
