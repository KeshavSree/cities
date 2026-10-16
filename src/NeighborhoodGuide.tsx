import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Footprints, Lamp, Moon, Move, Package, PersonStanding, ShoppingBag, Store, Sun, Sunrise, Sunset, X } from 'lucide-react';
import { DECORATIONS } from '../shared/decorations';
import { useViewport } from './useViewport';
import './neighborhood-guide.css';

const guideKey=(owner:string)=>`cities-neighborhood-guide:v1:${owner}`;
export function hasSeenNeighborhoodGuide(owner:string){try{return localStorage.getItem(guideKey(owner))==='seen';}catch{return false;}}
export function rememberNeighborhoodGuide(owner:string){try{localStorage.setItem(guideKey(owner),'seen');}catch{/* The session still remembers dismissal when storage is unavailable. */}}

export function NeighborhoodGuide({onClose,onExplore}:{onClose:()=>void;onExplore:()=>void}){
  const [step,setStep]=useState(0);
  const {mobile}=useViewport();
  const panel=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close.current();}
      if(event.key!=='Tab')return;
      const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button:not([disabled])')],first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});panel.current?.scrollTo(0,0);},[step]);
  const steps=[
    {title:'Start on your street',icon:PersonStanding,text:'Drag the little person from City view onto a highlighted street. Or select the person, then choose a highlighted street. You decide where your walk begins.',detail:mobile?'Swipe to look around. Hold the walking arrows to move. Choose City view to return.':'Move your mouse to look and use WASD to walk. Click the scene to capture your mouse; Esc releases it. If capture is blocked, Q/E and arrow keys let you look around.',visual:<><PersonStanding size={36}/><span className="guide-street"><Footprints size={24}/></span><ArrowRight size={22}/></>},
    {title:'Build a neighborhood with bricks',icon:ShoppingBag,text:`Open ${mobile?'Me':'My tower'}, then scroll to Neighborhood shop. In Street view, use the Shop button. Preview trees, benches, lamps, shops, or neighbors and choose a spot on your own plot.`,detail:'Your plot starts empty, including streetlights. Bricks are spent only when you place a new item. Canceling a preview costs nothing.',visual:<><ShoppingBag size={32}/><span className="guide-price"><Lamp size={23}/>Garden lamp <span><Package size={14}/>{DECORATIONS.lamp.cost}</span></span></>},
    {title:'Pick it up. Walk it over.',icon:Move,text:mobile?'Look at one of your own items until it highlights, then tap to pick it up. Walk while holding it and tap again to place it.':'Look directly at an item you own on your property until it highlights. Click once to pick it up, walk while holding it, then click again to place it.',detail:mobile?'Use the rotate and cancel buttons while holding an item. Moving or storing items you already own is free. Switch between City view and Street view while placing to check the same spot.':'R rotates a held item; Esc cancels the move. Moving or storing owned items is free. Switch between City view and Street view while placing to check the same spot.',visual:<><Move size={32}/><span className="guide-keys">{mobile?<><span>Tap</span><ArrowRight size={16}/><span>Walk</span><ArrowRight size={16}/><span>Tap</span></>:<><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>R</kbd></>}</span></>},
    {title:'Give your neighbors places to go',icon:Store,text:`Buy a Tower storefront for ${DECORATIONS.base_shop.cost} bricks once your tower reaches level 4. It snaps to a highlighted slot at the base of your building. Corner shops can stand in your yard.`,detail:`Add a Neighbor for ${DECORATIONS.person.cost} bricks and place their home on your plot. They stroll around the neighborhood, visit reachable shops, and head home on their own.`,visual:<><Store size={35}/><span className="guide-street"><Footprints size={24}/></span><PersonStanding size={30}/></>},
    {title:'Watch the neighborhood change',icon:Sunset,text:'The city follows your local time. Bought streetlights and shop windows light the sidewalks in the evening and at night, while a mix of lit tower windows makes the city feel lived in.',detail:'Ready for a walk? Choose a street next. You can replay this guide from Settings or How it works anytime.',visual:<div className="guide-phases">{([[Sunrise,'Morning','6–9am'],[Sun,'Day','9am–6pm'],[Sunset,'Evening','6–9pm'],[Moon,'Night','9pm–6am']] as const).map(([PhaseIcon,label,hours])=><span key={label}><PhaseIcon size={22}/><strong>{label}</strong><small>{hours}</small></span>)}</div>},
  ];
  const current=steps[step],Icon=current.icon;
  return <div className="neighborhood-guide-backdrop">
    <section ref={panel} className="neighborhood-guide" role="dialog" aria-modal="true" aria-labelledby="neighborhood-guide-title" aria-describedby="neighborhood-guide-description">
      <header><span><Icon size={16}/>NEIGHBORHOOD GUIDE</span><button aria-label="Close neighborhood guide" onClick={onClose}><X size={20}/></button></header>
      <div className="neighborhood-guide-visual" aria-hidden="true">{current.visual}</div>
      <p className="neighborhood-guide-count">{step+1} of {steps.length}</p>
      <h2 ref={heading} tabIndex={-1} id="neighborhood-guide-title">{current.title}</h2>
      <p id="neighborhood-guide-description">{current.text}</p><p className="neighborhood-guide-detail">{current.detail}</p>
      <div className="neighborhood-guide-progress" aria-hidden="true">{steps.map((item,index)=><span key={item.title} className={index<=step?'is-complete':''}/>)}</div>
      <footer>{step===0?<button className="guide-back" onClick={onClose}>Skip for now</button>:<button className="guide-back" onClick={()=>setStep(value=>value-1)}><ArrowLeft size={15}/>Back</button>}
        <button className="guide-next" onClick={step===steps.length-1?onExplore:()=>setStep(value=>value+1)}>{step===steps.length-1?'Choose a street':'Next'}<ArrowRight size={16}/></button>
      </footer>
    </section>
  </div>;
}
