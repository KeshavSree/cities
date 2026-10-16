import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Clock3, Footprints, Map, PersonStanding, RotateCw, ShoppingBag, X } from 'lucide-react';
import type { WalkDirection } from './StreetWalk';
import type { StreetStart } from './streetNavigation';
import type { StreetInteractionState } from './streetInteractionState';
import './street-view.css';
function StreetPerson(){return <PersonStanding className="street-person-figure" size={26} aria-hidden="true"/>;}
const directions=[['left','Walk left',ArrowLeft],['forward','Walk forward',ArrowUp],['right','Walk right',ArrowRight],['back','Walk backward',ArrowDown]] as const;
interface Props {placing?:boolean;switchingDisabled?:boolean;onLightingSettings?:()=>void;active:boolean;available:boolean;paused:boolean;picking:boolean;hasHome:boolean;mouseLocked:boolean;mouseCaptureBlocked:boolean;interaction:StreetInteractionState;onLook:()=>void;onRotate:()=>void;onCancelItem:()=>void;onShop:()=>void;onChange:(active:boolean)=>void;onWalk:(direction:WalkDirection,held:boolean)=>void;onDragPoint:(x:number,y:number)=>StreetStart|null;onDrop:(start:StreetStart)=>void;}
export function StreetControls({placing=false,switchingDisabled=false,onLightingSettings,active,available,paused,picking,hasHome,mouseLocked,mouseCaptureBlocked,interaction,onLook,onRotate,onCancelItem,onShop,onChange,onWalk,onDragPoint,onDrop}:Props){
  const gesture=useRef<{id:number;x:number;y:number;moved:boolean;wasPicking:boolean}|null>(null);
  const [drag,setDrag]=useState<{x:number;y:number;valid:boolean}|null>(null);
  useEffect(()=>{
    const cancel=()=>{if(gesture.current||picking){gesture.current=null;setDrag(null);onChange(false);}};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};
    window.addEventListener('blur',cancel);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);};
  },[onChange,picking]);
  useEffect(()=>{if(!picking){gesture.current=null;setDrag(null);}},[picking]);
  return <>
    <div className="view-switch" role="group" aria-label="View mode">
      <button disabled={switchingDisabled} aria-pressed={!active&&!picking} onClick={()=>onChange(false)}><Map size={16}/><span>City view</span></button>
      {active?<span className="street-active-label"><Footprints size={16}/>Street view</span>:placing?<button disabled={switchingDisabled} onClick={()=>onChange(true)}><Footprints size={16}/><span>Street view</span></button>:<button className={`street-person ${picking?'is-selected':''} ${drag?'is-held':''}`} disabled={!available} aria-label="Choose a Street view starting point" aria-pressed={picking} title="Drag the person onto a street, or click to choose a street" aria-describedby="street-entry-hint"
        onClick={event=>{if(event.detail===0)onChange(!picking);}}
        onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,wasPicking:picking};event.currentTarget.setPointerCapture(event.pointerId);setDrag({x:event.clientX,y:event.clientY,valid:false});if(!picking)onChange(true);}}
        onPointerMove={event=>{const g=gesture.current;if(!g||g.id!==event.pointerId)return;if(!g.moved&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<6)return;g.moved=true;const start=onDragPoint(event.clientX,event.clientY);setDrag({x:event.clientX,y:event.clientY,valid:Boolean(start)});}}
        onPointerUp={event=>{const g=gesture.current;if(!g||g.id!==event.pointerId)return;gesture.current=null;setDrag(null);event.currentTarget.releasePointerCapture(event.pointerId);if(g.moved){const start=onDragPoint(event.clientX,event.clientY);if(start){onDrop(start);return;}onChange(g.wasPicking);return;}onChange(!g.wasPicking);}}
        onPointerCancel={()=>{gesture.current=null;setDrag(null);onChange(false);}}
        onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;setDrag(null);onChange(false);}}}><StreetPerson/><span>Street view</span></button>}
    </div>
    {!active&&!placing&&!drag&&<p id="street-entry-hint" className="street-entry-hint">{picking?'Click a highlighted street to start':'Drag the person or click to choose a street'}</p>}
    {drag&&<div className={`street-person-ghost ${drag.valid?'is-valid':''}`} style={{left:drag.x,top:drag.y}} aria-hidden="true"><StreetPerson/><span>{drag.valid?'Drop to enter':'Drop onto a highlighted street'}</span></div>}
    {picking&&<div className="street-drop-guide" role="status">{drag?(drag.valid?'Drop here to enter Street view':'Drag onto a highlighted street'):'Choose a highlighted street'} <span>Esc to cancel</span></div>}
    {active&&<>
      {!paused&&<div className={`street-reticle ${interaction.target?'has-target':''} ${interaction.carrying?(interaction.error?'invalid':'carrying'):''}`} aria-hidden="true"/>}
      {!paused&&!mouseLocked&&!interaction.carrying&&<div className="street-lock-prompt">{mouseCaptureBlocked&&<p role="status">This browser blocked mouse capture. Open this page in Chrome or Safari to keep the mouse inside Street view.</p>}<button onClick={onLook}>{mouseCaptureBlocked?'Retry mouse capture':'Click to look around'}</button><span>{mouseCaptureBlocked?'You can still use Q/E and arrow keys to look.':'Esc releases your mouse'}</span></div>}
      {!paused&&(interaction.target||interaction.carrying)&&<div className={`street-item-hint ${interaction.error?'invalid':''}`} role="status"><strong>{interaction.carrying?`Holding ${interaction.carrying.toLowerCase()}`:interaction.target}</strong><span>{interaction.saving?'Saving your spot…':interaction.carrying?interaction.error||`Click to place${interaction.purchase?` · ${interaction.cost} bricks`:''}`:'Click to pick up'}</span>{interaction.carrying&&<small>{interaction.attached?'Snaps to your tower’s base · Esc to cancel':'R to rotate · Esc to cancel'}</small>}</div>}
      <div className="street-guide" aria-live="polite"><Footprints size={18}/><div><strong>{paused?'Walking paused':'Take a walk'}</strong><span>{paused?'Close the panel to keep exploring.':interaction.carrying&&!mouseLocked?'WASD to move · Q/E or arrows to look · Click to place':'Mouse to look · WASD to walk · Esc releases mouse'}</span><small>{paused?'':'Swipe to look. Hold the arrows to walk. Tap to pick up or place.'}</small></div></div>
      {!paused&&<div className="street-item-tools">
        {onLightingSettings&&<button onClick={onLightingSettings} aria-label="Lighting preview settings"><Clock3 size={18}/><span>Lighting</span></button>}
        {hasHome&&<button onClick={onShop} aria-label="Open neighborhood shop"><ShoppingBag size={18}/><span>Shop</span></button>}
        {interaction.carrying&&<>{!interaction.attached&&<button disabled={interaction.saving} onClick={onRotate} aria-label="Rotate held item"><RotateCw size={18}/></button>}<button disabled={interaction.saving} onClick={onCancelItem} aria-label="Cancel carrying item"><X size={18}/></button></>}
      </div>}
      <div className="street-walk-pad" role="group" aria-label="Walking controls">
        {directions.map(([direction,label,Icon])=><button key={direction} className={`walk-${direction}`} aria-label={label} disabled={paused}
          onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);onWalk(direction,true);}}
          onPointerUp={()=>onWalk(direction,false)} onPointerCancel={()=>onWalk(direction,false)} onLostPointerCapture={()=>onWalk(direction,false)}
          onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();onWalk(direction,true);}}}
          onKeyUp={()=>onWalk(direction,false)} onBlur={()=>onWalk(direction,false)}><Icon size={21}/></button>)}
      </div>
    </>}
  </>;
}
