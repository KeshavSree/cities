import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { ArrowLeft, Check, Clock3, Hand, LoaderCircle, Package, Play, RotateCw, ShoppingBag, X } from 'lucide-react';
import type { StreetInteractionState } from './streetInteractionState';
import type { WalkDirection } from './StreetWalk';
import { StreetWalkPad } from './StreetWalkPad';
import './mobile-street.css';

const mobileStreetQuery='(max-width: 760px), (pointer: coarse)';
// Secondary touch pointers do not reliably produce clicks while the other thumb walks.
function useTouchActions(){
  const pointers=useRef(new Map<number,{x:number;y:number;action:()=>void}>()),lastTouch=useRef(-Infinity);
  return (action:()=>void)=>({
    onPointerDown:(event:PointerEvent<HTMLButtonElement>)=>{
      if(event.pointerType==='mouse'||event.button!==0||event.currentTarget.disabled)return;
      event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);lastTouch.current=performance.now();
      pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY,action});
    },
    onPointerMove:(event:PointerEvent<HTMLButtonElement>)=>{const start=pointers.current.get(event.pointerId);if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)pointers.current.delete(event.pointerId);},
    onPointerUp:(event:PointerEvent<HTMLButtonElement>)=>{
      if(event.pointerType==='mouse')return;
      lastTouch.current=performance.now();const start=pointers.current.get(event.pointerId);pointers.current.delete(event.pointerId);
      if(start&&!event.currentTarget.disabled&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<=12)start.action();
    },
    onPointerCancel:(event:PointerEvent<HTMLButtonElement>)=>{pointers.current.delete(event.pointerId);lastTouch.current=performance.now();},
    onLostPointerCapture:(event:PointerEvent<HTMLButtonElement>)=>{pointers.current.delete(event.pointerId);},
    onClick:(event:MouseEvent<HTMLButtonElement>)=>{if(event.detail===0||performance.now()-lastTouch.current>700)action();},
  });
}
export function useMobileStreetUI(){
  const [mobile,setMobile]=useState(()=>window.matchMedia(mobileStreetQuery).matches);
  useEffect(()=>{const media=window.matchMedia(mobileStreetQuery),change=()=>setMobile(media.matches);media.addEventListener('change',change);change();return()=>media.removeEventListener('change',change);},[]);
  return mobile;
}
interface Props {paused:boolean;hasHome:boolean;switchingDisabled:boolean;interaction:StreetInteractionState;onChange:(active:boolean)=>void;onShop:()=>void;onResume:()=>void;onUseItem:()=>void;onRotate:()=>void;onCancelItem:()=>void;onWalk:(direction:WalkDirection,held:boolean)=>void;onLightingSettings?:()=>void;}
export function MobileStreetControls({paused,hasHome,switchingDisabled,interaction,onChange,onShop,onResume,onUseItem,onRotate,onCancelItem,onWalk,onLightingSettings}:Props){
  const press=useTouchActions();
  const {target,carrying,error,saving,purchase,cost,attached}=interaction;
  const canUse=!saving&&(carrying?!error:Boolean(target));
  return <div className={`mobile-street-controls ${paused?'is-paused':''}`} aria-label="Mobile Street view controls">
    <nav className="mobile-street-top" aria-label="Street view navigation">
      <button disabled={switchingDisabled} {...press(()=>onChange(false))}><ArrowLeft size={18}/>City view</button>
      <span className="mobile-street-title">Street view</span>
      <div>{paused?<button {...press(onResume)}><Play size={17}/>Resume walking</button>:<>
        {onLightingSettings&&<button className="mobile-street-icon" {...press(onLightingSettings)} aria-label="Lighting preview settings"><Clock3 size={19}/></button>}
        {hasHome&&<button {...press(onShop)} disabled={saving}><ShoppingBag size={18}/>Shop</button>}
      </>}</div>
    </nav>
    {!paused&&<>
      <div className={`street-reticle ${target?'has-target':''} ${carrying?(error?'invalid':'carrying'):''}`} aria-hidden="true"/>
      <div className="mobile-street-bottom">
        <div id="mobile-street-status" className={`mobile-street-status ${error?'invalid':''}`} role="status">
          {carrying?<><strong>Holding {carrying.toLowerCase()}</strong><span>{saving?'Saving your spot…':error|| (attached?'Snaps to the base of your tower':'Walk to a clear spot on your property')}</span></>:target?<><strong>{target}</strong><span>Your item is within reach</span></>:<span>Swipe to look. Hold the arrows to walk.</span>}
        </div>
        <div className="mobile-street-thumbs">
          <StreetWalkPad paused={false} onWalk={onWalk}/>
          {hasHome&&<div className="mobile-street-actions">
            <button className={`mobile-street-use ${carrying?'is-placing':''}`} aria-label={carrying?'Place held item':'Pick up highlighted item'} aria-describedby="mobile-street-status" disabled={!canUse} {...press(onUseItem)}>
              {saving?<LoaderCircle size={22} className="spin"/>:carrying?<Check size={22}/>:<Hand size={22}/>}
              <span>{saving?'Saving…':carrying?'Place':target?'Pick up':'Aim at an item'}{carrying&&purchase&&<small><Package size={12}/>{cost} bricks</small>}</span>
            </button>
            {carrying&&<div className="mobile-street-adjust">
              {!attached&&<button {...press(onRotate)} disabled={saving} aria-label="Rotate held item"><RotateCw size={17}/>Rotate</button>}
              <button {...press(onCancelItem)} disabled={saving} aria-label="Cancel carrying item"><X size={17}/>Cancel</button>
            </div>}
          </div>}
        </div>
      </div>
    </>}
  </div>;
}
