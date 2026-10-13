import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Package } from 'lucide-react';
import { LEVELS_PER_TIER } from '../shared/progression';
import { useViewport } from './useViewport';
import './onboarding.css';

type Props={onOpenTower:()=>void;onInvite:()=>void;onCloseInvite:()=>void;onGift:(origin:{x:number;y:number})=>Promise<void>;onFinish:()=>Promise<void>;earthenUnlocked:boolean;towerOpen:boolean};
const selectors=['.inspector .level-progress','.invite-button','.invite-button','.topbar-bricks','.drawer-handle','.inspector .tier-slices','[data-onboarding-theme="earthen"]'];
export function Onboarding({onOpenTower,onInvite,onCloseInvite,onGift,onFinish,earthenUnlocked,towerOpen}:Props){
  const viewport=useViewport();
  const {width:screenWidth,height:screenHeight,mobile}=viewport;
  const targetSelector=(index:number)=>mobile?(index===1||index===2?'.mobile-dock [aria-label="Invite a friend"]':index===4?'.mobile-dock [aria-label="Open my tower"]':index===5?'.inspector .tier-slice':selectors[index]):selectors[index];
  const [step,setStep]=useState(0),[rect,setRect]=useState<DOMRect|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [inviting,setInviting]=useState(false);
  const card=useRef<HTMLElement>(null);
  const [cardHeight,setCardHeight]=useState(260);
  useLayoutEffect(()=>{
    if(!card.current)return;
    const element=card.current;
    const measure=()=>setCardHeight(element.getBoundingClientRect().height);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[step,Boolean(rect),error,earthenUnlocked]);
  useEffect(()=>{
    if(step===0||step===5)onOpenTower();
    if(step===2||step===3)onCloseInvite();
    if(step===4&&towerOpen)setStep(5);
  },[step,onOpenTower,onCloseInvite,towerOpen]);
  useEffect(()=>{
    let previous:DOMRect|null=null,lastTarget:Element|null=null,stableSince=performance.now(),settled=false;
    setRect(null);
    const measure=()=>{
      const target=document.querySelector(step===1&&inviting?'.invitation-drawer.is-open .invite-create':targetSelector(step));
      if(target!==lastTarget){
        lastTarget=target;previous=null;settled=false;stableSince=performance.now();
        if(step===0||step===5||step===6)target?.scrollIntoView({block:'nearest'});
      }
      const next=target?.getBoundingClientRect();
      if(!target||!next||!next.width||!next.height||next.bottom<=0||next.top>=screenHeight||next.right<=0||next.left>=screenWidth){setRect(null);return;}
      let moving=false;
      for(let node:Element|null=settled?target.parentElement:target;node;node=node.parentElement){
        if(node.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().activeDuration!==Infinity)){moving=true;break;}
      }
      const centerMoved=previous&&Math.abs(previous.x+previous.width/2-next.x-next.width/2)+Math.abs(previous.y+previous.height/2-next.y-next.height/2)>.5;
      if(settled&&!moving&&!centerMoved)return;
      const changed=!previous||Math.abs(previous.x-next.x)+Math.abs(previous.y-next.y)+Math.abs(previous.width-next.width)+Math.abs(previous.height-next.height)>.5;
      previous=next;
      if(moving||changed){settled=false;stableSince=performance.now();setRect(null);return;}
      if(performance.now()-stableSince>=120){settled=true;setRect(current=>current??next);}
    };
    measure();const timer=setInterval(measure,32);return()=>clearInterval(timer);
  },[step,inviting,mobile,screenWidth,screenHeight]);
  useEffect(()=>{
    const clicked=(event:MouseEvent)=>{
      const target=event.target as Element;
      if(step===4&&target.closest('.drawer-handle,.mobile-dock [aria-label="Open my tower"]'))setStep(5);
      if(step===5&&target.closest('.tier-slice'))setStep(6);
    };
    document.addEventListener('click',clicked);return()=>document.removeEventListener('click',clicked);
  },[step]);
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}};
  const title=step===0?'Building Level':step===1?'Grow together':step===2?'An exclusive theme':step===3?'Bricks':step===4?'Open your tower':step===5?'Choose a layer':'Make it yours';
  const text=step===0?`Gain XP to grow your tower. There are many ways to grow your tower including GitHub activity, inviting others, and claiming the daily bonus. Every ${LEVELS_PER_TIER} levels increases your tower tier.`:step===1?(inviting?'Click + to copy your invitation link, then send it to someone you want nearby.':'Inviting others is one of the quickest ways to gain XP. Try it now!'):step===2?'Successfully invite 3 other people to unlock the exclusive Cyberpunk tower theme.':step===3?"These are your bricks. Use bricks to unlock tower customizations. Here's 100 free bricks.":step===4?'Open the building tab to customize your tower.':step===5?'Click a layer of your tower to see its customizations.':earthenUnlocked?'Choose Earthen Citadel to try your unlocked theme. You can always switch back.':'Earthen Citadel costs 90 bricks. Buying it is optional—choose it now, or finish onboarding and save your bricks for later.';
  const pad=7,left=Math.max(0,(rect?.left??0)-pad),top=Math.max(0,(rect?.top??0)-pad),right=Math.min(screenWidth,(rect?.right??0)+pad),bottom=Math.min(screenHeight,(rect?.bottom??0)+pad);
  const width=Math.min(340,screenWidth-32);
  // Keep an 18px-wide, 13px-deep pointer; place the card around it.
  const targetY=rect?Math.max(top+12,Math.min(bottom-12,rect.top+rect.height/2)):0;
  const beside=Boolean(rect&&rect.left>=width+36&&targetY>=46);
  const cardLeft=rect?(beside?rect.left-width-20:Math.max(16,Math.min(screenWidth-width-16,rect.left+rect.width/2-width/2))):16;
  const above=Boolean(rect&&!beside&&rect.bottom+20+cardHeight>screenHeight-16&&rect.top>=cardHeight+36);
  const cardTop=rect?Math.max(16,Math.min(screenHeight-cardHeight-16,beside?targetY-cardHeight/2:above?rect.top-cardHeight-20:rect.bottom+20)):16;
  const anchorX=rect?Math.max(24,Math.min(width-24,rect.left+rect.width/2-cardLeft)):0;
  const anchorY=targetY-cardTop;
  const pointer=beside?`M ${width} ${anchorY-9} L ${width+13} ${anchorY} L ${width} ${anchorY+9} Z`:above?`M ${anchorX-9} ${cardHeight} L ${anchorX} ${cardHeight+13} L ${anchorX+9} ${cardHeight} Z`:`M ${anchorX-9} 0 L ${anchorX} -13 L ${anchorX+9} 0 Z`;
  if(!rect)return null;
  return <div className="onboarding" aria-label="Welcome guide">
    {rect?<><div className="onboarding-shade" style={{inset:`0 0 auto 0`,height:top}}/><div className="onboarding-shade" style={{top,bottom:screenHeight-bottom,left:0,width:left}}/><div className="onboarding-shade" style={{top,bottom:screenHeight-bottom,left:right,right:0}}/><div className="onboarding-shade" style={{top:bottom,left:0,right:0,bottom:0}}/><div className="onboarding-spotlight" style={{left,top,width:right-left,height:bottom-top}}/></>:<div className="onboarding-shade is-full" style={{inset:0}}/>}
    <section ref={card} className="onboarding-card" role="dialog" aria-label={title} style={{left:cardLeft,top:cardTop,width}} >
      {rect&&<svg className="onboarding-pointer" style={{left:0,top:0} as CSSProperties} aria-hidden="true"><path d={pointer}/></svg>}
      <div className="onboarding-body"><span className="onboarding-kicker">WELCOME TO C.I.T.I.E.S. · {step+1} / 7</span><h2>{title}</h2><p>{text}</p>
      {error&&<p role="alert">{error}</p>}
      <div className="onboarding-actions">
        {step===1&&!inviting&&<button onClick={()=>{setInviting(true);onInvite();}}>Try inviting</button>}
        {step<3&&<button className="onboarding-next" onClick={()=>setStep(step+1)}>Next <ArrowRight size={16}/></button>}
        {step===3&&<button className="onboarding-next" disabled={busy} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();void run(async()=>{await onGift({x:r.left+r.width/2,y:r.top+r.height/2});setStep(4);});}}><Package size={17}/>{busy?'Claiming…':'Claim 100 bricks'}</button>}
        {step===4&&<button className="onboarding-next" onClick={()=>{onOpenTower();setStep(5);}}>Open tower <ArrowRight size={16}/></button>}
        {step===5&&<button onClick={()=>void run(onFinish)} disabled={busy}>Customize later</button>}
        {step===6&&<button className="onboarding-next" onClick={()=>void run(onFinish)} disabled={busy}>{busy?'Finishing…':'Finish onboarding'} <ArrowRight size={16}/></button>}
      </div></div>
    </section>
  </div>;
}
