import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { WalkDirection } from './StreetWalk';

const directions=[['left','Walk left',ArrowLeft],['forward','Walk forward',ArrowUp],['right','Walk right',ArrowRight],['back','Walk backward',ArrowDown]] as const;
export function StreetWalkPad({paused,onWalk}:{paused:boolean;onWalk:(direction:WalkDirection,held:boolean)=>void}){
  const walk=useRef(onWalk);walk.current=onWalk;
  const pointers=useRef(new Map<number,WalkDirection>());
  useEffect(()=>{
    const stop=()=>{pointers.current.clear();for(const [direction] of directions)walk.current(direction,false);};
    window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);
    return()=>{window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);stop();};
  },[]);
  useEffect(()=>{if(paused){pointers.current.clear();for(const [direction] of directions)walk.current(direction,false);}},[paused]);
  const release=(id:number)=>{
    const direction=pointers.current.get(id);pointers.current.delete(id);
    if(direction&&![...pointers.current.values()].includes(direction))onWalk(direction,false);
  };
  return <div className="street-walk-pad" role="group" aria-label="Walking controls">
    {directions.map(([direction,label,Icon])=><button key={direction} className={`walk-${direction}`} aria-label={label} disabled={paused}
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,direction);onWalk(direction,true);}}
      onPointerUp={event=>release(event.pointerId)} onPointerCancel={event=>release(event.pointerId)} onLostPointerCapture={event=>release(event.pointerId)}
      onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();onWalk(direction,true);}}}
      onKeyUp={event=>{if(event.key===' '||event.key==='Enter')onWalk(direction,false);}} onBlur={()=>onWalk(direction,false)}><Icon size={22}/></button>)}
  </div>;
}
