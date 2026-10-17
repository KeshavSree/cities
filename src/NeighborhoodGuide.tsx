import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Footprints, Grid3X3, Map, MousePointer2, Package, PersonStanding, X } from 'lucide-react';
import { useViewport } from './useViewport';
import './neighborhood-guide.css';

const guideKey=(owner:string)=>`cities-neighborhood-guide:v2:${owner}`;
export function hasSeenNeighborhoodGuide(owner:string){try{return localStorage.getItem(guideKey(owner))==='seen';}catch{return false;}}
export function rememberNeighborhoodGuide(owner:string){try{localStorage.setItem(guideKey(owner),'seen');}catch{/* The session still remembers dismissal when storage is unavailable. */}}

interface Props {onClose:()=>void;onComplete:()=>void;editorOpen:boolean;hasDraft:boolean;placementValid:boolean;pickingStreet:boolean;streetView:boolean;}
const steps=[
  {selector:'[data-guide="your-streetview"]',title:'Open Your Streetview',text:'Select Your Streetview in your tower.',Icon:Grid3X3},
  {selector:'[data-decoration-kind="planter"]',title:'Choose a model',text:'Pick the flower planter from the model shelf.',Icon:Package},
  {selector:'.street-editor-stage-target',title:'Choose a spot',text:'',Icon:MousePointer2},
  {selector:'[data-editor-action="confirm"]',title:'Place it',text:'Place the planter. You will stay in the editor.',Icon:Package},
  {selector:'[data-editor-action="close"]',title:'Return to the city',text:'Leave the editor when your street is ready.',Icon:Map},
  {selector:'.street-person',title:'Start a walk',text:'Select the Street view person.',Icon:PersonStanding},
  {selector:'.street-tutorial-point',title:'Choose your street',text:'Choose this highlighted spot to begin walking.',Icon:Footprints},
] as const;

export function NeighborhoodGuide({onClose,onComplete,editorOpen,hasDraft,placementValid,pickingStreet,streetView}:Props){
  const {width:screenWidth,height:screenHeight}=useViewport();
  const [step,setStep]=useState(0),[rect,setRect]=useState<DOMRect|null>(null),[cardHeight,setCardHeight]=useState(170),[placementSettled,setPlacementSettled]=useState(false);
  const card=useRef<HTMLElement>(null),placementPending=useRef(false);
  const current=steps[step],Icon=current.Icon;
  useLayoutEffect(()=>{
    if(!card.current)return;const element=card.current,measure=()=>setCardHeight(element.getBoundingClientRect().height);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[step,rect]);
  useEffect(()=>{
    let previous:DOMRect|null=null,lastTarget:Element|null=null,stableSince=performance.now();setRect(null);
    const measure=()=>{
      const target=document.querySelector(current.selector);
      if(target&&target!==lastTarget){
        lastTarget=target;
        const scroller=target.closest('.inspector') as HTMLElement|null;
        if(scroller){const targetRect=target.getBoundingClientRect(),scrollerRect=scroller.getBoundingClientRect();scroller.scrollTop+=targetRect.top-scrollerRect.top-(scroller.clientHeight-targetRect.height)/2;}
        else target.scrollIntoView({block:'nearest',inline:'nearest'});
        previous=null;stableSince=performance.now();
      }
      const next=target?.getBoundingClientRect();
      if(!target||!next||!next.width||!next.height||next.bottom<=0||next.top>=screenHeight||next.right<=0||next.left>=screenWidth){setRect(null);return;}
      const changed=!previous||Math.abs(previous.x-next.x)+Math.abs(previous.y-next.y)+Math.abs(previous.width-next.width)+Math.abs(previous.height-next.height)>.5;
      previous=next;if(changed){stableSince=performance.now();setRect(null);return;}if(performance.now()-stableSince>80)setRect(value=>value??next);
    };
    measure();const timer=setInterval(measure,32);return()=>clearInterval(timer);
  },[current.selector,screenHeight,screenWidth]);
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      const target=event.target as Element;
      if(step===0&&target.closest(steps[0].selector))setStep(1);
      else if(step===1&&target.closest(steps[1].selector))setStep(2);
      else if(step===3&&target.closest(steps[3].selector))placementPending.current=true;
    };
    const move=(event:PointerEvent)=>{if(step===2&&(event.target as Element).closest('.scene canvas'))setPlacementSettled(false);};
    const up=(event:PointerEvent)=>{if(step===2&&(event.target as Element).closest('.scene canvas'))setPlacementSettled(true);};
    document.addEventListener('click',click);document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
    return()=>{document.removeEventListener('click',click);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);};
  },[step]);
  useEffect(()=>{if(step===0&&editorOpen)setStep(1);},[step,editorOpen]);
  useEffect(()=>{if(step===1&&hasDraft)setStep(2);},[step,hasDraft]);
  useEffect(()=>{if(step===2&&placementSettled&&placementValid)setStep(3);},[step,placementSettled,placementValid]);
  useEffect(()=>{if(step===3&&placementPending.current&&!hasDraft){placementPending.current=false;setStep(4);}},[step,hasDraft]);
  useEffect(()=>{if(step===4&&!editorOpen)setStep(5);},[step,editorOpen]);
  useEffect(()=>{if(step===5&&pickingStreet)setStep(6);},[step,pickingStreet]);
  useEffect(()=>{if(step===6&&streetView)onComplete();},[step,streetView,onComplete]);
  if(!rect)return null;
  const pad=7,left=Math.max(0,rect.left-pad),top=Math.max(0,rect.top-pad),right=Math.min(screenWidth,rect.right+pad),bottom=Math.min(screenHeight,rect.bottom+pad),cardWidth=Math.min(326,screenWidth-32);
  const targetY=Math.max(top+10,Math.min(bottom-10,rect.top+rect.height/2)),beside=rect.left>=cardWidth+36&&targetY>=45;
  const cardLeft=beside?rect.left-cardWidth-20:Math.max(16,Math.min(screenWidth-cardWidth-16,rect.left+rect.width/2-cardWidth/2));
  const above=!beside&&rect.bottom+18+cardHeight>screenHeight-16&&rect.top>=cardHeight+34;
  const cardTop=Math.max(16,Math.min(screenHeight-cardHeight-16,beside?targetY-cardHeight/2:above?rect.top-cardHeight-18:rect.bottom+18));
  const anchorX=Math.max(22,Math.min(cardWidth-22,rect.left+rect.width/2-cardLeft)),anchorY=targetY-cardTop;
  const pointer=beside?`M ${cardWidth} ${anchorY-8} L ${cardWidth+12} ${anchorY} L ${cardWidth} ${anchorY+8} Z`:above?`M ${anchorX-8} ${cardHeight} L ${anchorX} ${cardHeight+12} L ${anchorX+8} ${cardHeight} Z`:`M ${anchorX-8} 0 L ${anchorX} -12 L ${anchorX+8} 0 Z`;
  return <div className="neighborhood-guide" aria-label="Neighborhood guide">
    <div className="neighborhood-guide-shade" style={{inset:'0 0 auto 0',height:top}}/><div className="neighborhood-guide-shade" style={{top,bottom:screenHeight-bottom,left:0,width:left}}/><div className="neighborhood-guide-shade" style={{top,bottom:screenHeight-bottom,left:right,right:0}}/><div className="neighborhood-guide-shade" style={{top:bottom,left:0,right:0,bottom:0}}/><div className="neighborhood-guide-spotlight" style={{left,top,width:right-left,height:bottom-top}}/>
    <section ref={card} className="neighborhood-guide-card" role="dialog" aria-label={current.title} style={{left:cardLeft,top:cardTop,width:cardWidth}}>
      <svg className="neighborhood-guide-pointer" style={{left:0,top:0} as CSSProperties} aria-hidden="true"><path d={pointer}/></svg>
      <header><span><Icon size={15}/>{step+1} / {steps.length}</span><button aria-label="Skip neighborhood guide" onClick={onClose}><X size={17}/></button></header>
      <h2>{current.title}</h2>{current.text&&<p>{current.text}</p>}
    </section>
  </div>;
}
