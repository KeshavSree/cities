import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';

export function TowerDrawer({open,onOpenChange,children,subject='tower'}:{open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode;subject?:'tower'|'project'}) {
  const panel=useRef<HTMLDivElement>(null);
  const handle=useRef<HTMLButtonElement>(null);
  const drag=useRef<{start:number;offset:number;size:number;moved:boolean;mobile:boolean}|null>(null);
  const suppressClick=useRef(false);
  const finish=(event:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const current=drag.current;
    if(!current)return;
    drag.current=null;
    suppressClick.current=current.moved;
    panel.current?.style.removeProperty('transform');
    panel.current?.style.removeProperty('transition');
    if(current.moved&&!cancel)onOpenChange(current.offset<current.size/2);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={panel} className={`tower-drawer ${open?'is-open':''}`}>
    <button ref={handle} className="drawer-handle" aria-label={open?`Push ${subject} details closed`:`Pull ${subject} details open`} aria-expanded={open} aria-controls="tower-details"
      onPointerDown={event=>{
        if(event.button!==0)return;
        const mobile=window.innerWidth<=760;
        const size=mobile?panel.current!.offsetHeight:panel.current!.offsetWidth;
        drag.current={start:mobile?event.clientY:event.clientX,offset:open?0:size,size,moved:false,mobile};
        suppressClick.current=false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const current=drag.current;
        if(!current)return;
        const point=current.mobile?event.clientY:event.clientX;
        const delta=point-current.start;
        if(Math.abs(delta)>5)current.moved=true;
        current.offset=Math.max(0,Math.min(current.size,(open?0:current.size)+delta));
        if(current.moved&&panel.current){panel.current.style.transition='none';panel.current.style.transform=current.mobile?`translateY(${current.offset}px)`:`translateX(${current.offset}px)`;}
      }}
      onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
      onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}onOpenChange(!open);}}
      title={`Drag or click to slide ${subject} details`}><Building2 size={30} aria-hidden="true"/>
    </button>
    <div id="tower-details" className="drawer-content" inert={!open} aria-hidden={!open} onKeyDown={event=>{if(event.key==='Escape'){onOpenChange(false);handle.current?.focus();}}}>{children}</div>
  </div>;
}
