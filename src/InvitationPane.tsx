import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';
import './invitation-pane.css';

// Club Recruiter's home-page technique: uneven freehand points interpolated
// with Catmull-Rom curves, then broken up by an SVG graphite grain filter.
function freehand(points:[number,number][]) {
  let d=`M ${points[0][0]} ${points[0][1]}`;
  for(let i=0;i<points.length-1;i++){
    const p0=points[i-1]??points[i],p1=points[i],p2=points[i+1],p3=points[i+2]??p2;
    d+=` C ${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const arrowShaft=freehand([[56,10],[75,8],[94,16],[107,31],[108,46],[101,60],[90,72]]);
const arrowHead='M83 62L90 72L101 66';

export function InvitationPane({open,onClose,children}:{open:boolean;onClose:()=>void;children:ReactNode}){
  const pencilId=useId();
  const panel=useRef<HTMLElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeRef.current();}};
    document.addEventListener('keydown',escape);
    return()=>{
      document.removeEventListener('keydown',escape);
      if(panel.current?.contains(document.activeElement)&&previous?.isConnected)previous.focus();
    };
  },[open]);
  return <div className={`invitation-drawer ${open?'is-open':''}`} aria-hidden={!open}>
    {open&&<button className="invitation-backdrop" aria-label="Dismiss invitations" onClick={onClose}/>}
    <aside ref={panel} className="invitation-pane" aria-labelledby="invitation-title" inert={!open}>
      <header><h2 id="invitation-title">Invite someone</h2><button className="icon-button" aria-label="Close invitations" title="Slide invitations closed" onClick={onClose}><ChevronUp size={20}/></button></header>
      <svg className="invite-pencil-arrow" viewBox="0 0 130 90" fill="none" aria-hidden="true">
        <defs><filter id={pencilId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves={2} seed={7} result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6"/>
        </filter></defs>
        <g filter={`url(#${pencilId})`}><path d={arrowShaft}/><path d={arrowHead}/></g>
      </svg>
      {children}
    </aside>
  </div>;
}
