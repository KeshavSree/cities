import { useEffect, useRef, useState } from 'react';
import { captureStreetPointer } from './streetPointer';
import { Check, Clock3, Footprints, Grid3X3, Map, PersonStanding, RotateCw, X } from 'lucide-react';
import type { WalkDirection } from './StreetWalk';
import type { StreetStart } from './streetNavigation';
import type { StreetInteractionState } from './streetInteractionState';
import { MobileStreetControls } from './MobileStreetControls';
import { StreetWalkPad } from './StreetWalkPad';
import './street-view.css';
function StreetPerson(){return <PersonStanding className="street-person-figure" size={26} aria-hidden="true"/>;}
interface Props {onJoystick:(side:number,forward:number)=>void;mobileUI:boolean;onUseItem:()=>void;onResume:()=>void;placing?:boolean;switchingDisabled?:boolean;onLightingSettings?:()=>void;active:boolean;available:boolean;paused:boolean;picking:boolean;hasHome:boolean;mouseLocked:boolean;mouseCaptureBlocked:boolean;interaction:StreetInteractionState;onLook:()=>void;onRotate:()=>void;onCancelItem:()=>void;onShop:()=>void;onChange:(active:boolean)=>void;onWalk:(direction:WalkDirection,held:boolean)=>void;onDragPoint:(x:number,y:number)=>StreetStart|null;onDrop:(start:StreetStart)=>void;}
export function StreetControls({onJoystick,mobileUI,onUseItem,onResume,placing=false,switchingDisabled=false,onLightingSettings,active,available,paused,picking,hasHome,mouseLocked,mouseCaptureBlocked,interaction,onLook,onRotate,onCancelItem,onShop,onChange,onWalk,onDragPoint,onDrop}:Props){
  const gesture=useRef<{id:number;x:number;y:number;moved:boolean;wasPicking:boolean;element:HTMLButtonElement}|null>(null);
  const latest=useRef({onChange,onDragPoint,onDrop,picking,paused,switchingDisabled});latest.current={onChange,onDragPoint,onDrop,picking,paused,switchingDisabled};
  const [drag,setDrag]=useState<{x:number;y:number;valid:boolean}|null>(null);
  useEffect(()=>{
    const release=(g:NonNullable<typeof gesture.current>)=>{try{if(g.element.hasPointerCapture(g.id))g.element.releasePointerCapture(g.id);}catch{/* Capture may already have been lost. */}};
    const cancel=()=>{const g=gesture.current;if(g||latest.current.picking){gesture.current=null;setDrag(null);if(g)release(g);latest.current.onChange(false);}};
    const move=(event:PointerEvent)=>{
      const g=gesture.current;if(!g||g.id!==event.pointerId)return;
      if(!g.moved&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<6)return;
      g.moved=true;const start=latest.current.onDragPoint(event.clientX,event.clientY);setDrag({x:event.clientX,y:event.clientY,valid:Boolean(start)});
    };
    const end=(event:PointerEvent)=>{
      const g=gesture.current;if(!g||g.id!==event.pointerId)return;
      gesture.current=null;setDrag(null);release(g);
      const current=latest.current;
      if(current.paused||current.switchingDisabled){current.onChange(false);return;}
      if(g.moved){const start=current.onDragPoint(event.clientX,event.clientY);if(start){current.onDrop(start);return;}current.onChange(g.wasPicking);return;}
      current.onChange(!g.wasPicking);
    };
    const cancelled=(event:PointerEvent)=>{if(gesture.current?.id===event.pointerId)cancel();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};
    const visibility=()=>{if(document.hidden)cancel();};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancelled);
    window.addEventListener('blur',cancel);window.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);
    return()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancelled);
      window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);
      const g=gesture.current;gesture.current=null;if(g)release(g);
    };
  },[]);
  useEffect(()=>{if(!picking){gesture.current=null;setDrag(null);}},[picking]);
  if(active&&mobileUI)return <MobileStreetControls paused={paused} hasHome={hasHome} switchingDisabled={switchingDisabled} interaction={interaction} onChange={onChange} onShop={onShop} onResume={onResume} onUseItem={onUseItem} onRotate={onRotate} onCancelItem={onCancelItem} onJoystick={onJoystick} onLightingSettings={onLightingSettings}/>;
  return <>
    <div className="view-switch" role="group" aria-label="View mode">
      <button disabled={switchingDisabled} aria-pressed={!active&&!picking} onClick={()=>onChange(false)}><Map size={16}/><span>City view</span></button>
      {active?<span className="street-active-label"><Footprints size={16}/>Street view</span>:placing?<button disabled={switchingDisabled} onClick={()=>onChange(true)}><Footprints size={16}/><span>Street view</span></button>:<button className={`street-person ${picking?'is-selected':''} ${drag?'is-held':''}`} disabled={!available||switchingDisabled} aria-label="Choose a Street view starting point" aria-pressed={picking} title="Drag the person onto a street, or click to choose a street" aria-describedby="street-entry-hint"
        onClick={event=>{if(event.detail===0)onChange(!picking);}}
        onPointerDown={event=>{if(event.button!==0||gesture.current)return;event.preventDefault();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,wasPicking:picking,element:event.currentTarget};captureStreetPointer(event.currentTarget,event.pointerId);setDrag({x:event.clientX,y:event.clientY,valid:false});if(!picking)onChange(true);}}
        onLostPointerCapture={event=>{if(gesture.current?.id===event.pointerId){gesture.current=null;setDrag(null);onChange(false);}}}><StreetPerson/><span>Street view</span></button>}
    </div>
    {!active&&!placing&&!drag&&<p id="street-entry-hint" className="street-entry-hint">{picking?(mobileUI?'Tap a highlighted street to start':'Click a highlighted street to start'):(mobileUI?'Drag the person or tap to choose a street':'Drag the person or click to choose a street')}</p>}
    {drag&&<div className={`street-person-ghost ${drag.valid?'is-valid':''}`} style={{left:drag.x,top:drag.y}} aria-hidden="true"><StreetPerson/><span>{drag.valid?'Drop to enter':'Drop onto a highlighted street'}</span></div>}
    {picking&&<div className="street-drop-guide" role="status">{drag?(drag.valid?'Drop here to enter Street view':'Drag onto a highlighted street'):'Choose a highlighted street'} {mobileUI?<button type="button" onClick={()=>onChange(false)}>Cancel</button>:<span>Esc to cancel</span>}</div>}
    {active&&<>
      {!paused&&<div className={`street-reticle ${interaction.target?'has-target':''} ${interaction.carrying?(interaction.error?'invalid':'carrying'):''}`} aria-hidden="true"/>}
      {!paused&&!mouseLocked&&!interaction.carrying&&<div className="street-lock-prompt">{mouseCaptureBlocked&&<p role="status">This browser blocked mouse capture. Open this page in Chrome or Safari to keep the mouse inside Street view.</p>}<button onClick={onLook}>{mouseCaptureBlocked?'Retry mouse capture':'Click to look around'}</button><span>{mouseCaptureBlocked?'You can still use Q/E and arrow keys to look.':'Esc releases your mouse'}</span></div>}
      {!paused&&(interaction.target||interaction.carrying)&&<div className={`street-item-hint ${interaction.error?'invalid':''}`} role="status"><strong>{interaction.carrying?`Holding ${interaction.carrying.toLowerCase()}`:interaction.target}</strong><span>{interaction.saving?'Saving your spot…':interaction.carrying?interaction.error||`Click to place${interaction.purchase?` · ${interaction.cost} bricks`:''}`:'Click to pick up'}</span>{interaction.carrying&&<small>{interaction.attached?'Snaps to your tower’s base · Esc to cancel':'R to rotate · Esc to cancel'}</small>}</div>}
      <div className="street-guide" aria-live="polite"><Footprints size={18}/><div><strong>{paused?'Walking paused':'Take a walk'}</strong><span>{paused?'Close the panel to keep exploring.':interaction.carrying&&!mouseLocked?'WASD to move · Q/E or arrows to look · Click to place':'Mouse to look · WASD to walk · Esc releases mouse'}</span><small>{paused?'':'Swipe to look. Hold the arrows to walk. Tap to pick up or place.'}</small></div></div>
      {!paused&&<div className="street-item-tools">
        {onLightingSettings&&<button onClick={onLightingSettings} aria-label="Lighting preview settings"><Clock3 size={18}/><span>Lighting</span></button>}
        {hasHome&&<button onClick={onShop} aria-label="Open Your Streetview editor"><Grid3X3 size={18}/><span>Build</span></button>}
        {interaction.carrying&&<><button disabled={interaction.saving||Boolean(interaction.error)} onClick={onUseItem} aria-label="Place held item"><Check size={18}/><span>{interaction.saving?'Saving…':interaction.purchase?'Buy & place':'Place'}</span></button>{!interaction.attached&&<button disabled={interaction.saving} onClick={onRotate} aria-label="Rotate held item"><RotateCw size={18}/></button>}<button disabled={interaction.saving} onClick={onCancelItem} aria-label="Cancel carrying item"><X size={18}/></button></>}
      </div>}
      <StreetWalkPad paused={paused} onWalk={onWalk}/>
    </>}
  </>;
}
