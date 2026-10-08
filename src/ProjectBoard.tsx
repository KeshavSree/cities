import { useState } from 'react';
import type { Building, PublicProject } from '../shared/types';
import { PROJECT_RADIUS } from '../shared/projects';
import { plotPosition } from '../shared/world';
export function ProjectBoard({projects,me,busy,onContribute}:{projects:PublicProject[];me:Building|undefined;busy:boolean;onContribute:(id:string,amount:number)=>void}){
  const [amounts,setAmounts]=useState<Record<string,number>>({});
  return <div className="project-board"><p className="modal-description">Pool bricks with nearby residents. Each contribution builds part of a shared place.</p>{projects.map(p=>{
    const own=me?plotPosition(me.x,me.z):null,center=plotPosition(p.x,p.z),nearby=own?Math.hypot(own.x-center.x,own.z-center.z)<=PROJECT_RADIUS:false;
    const completed=p.funded>=p.goal,remaining=p.goal-p.funded,amount=amounts[p.id]??Math.min(25,remaining,me?.bricks??25);
    return <section key={p.id} className="public-project"><div className="project-title"><h3>{p.name}</h3><span>{completed?'Complete':nearby?'Nearby':'Outside your neighborhood'}</span></div><p>{p.description}</p><div className="project-stages">{['Groundwork','Planting','Seating','Landmark'].map((s,i)=><span className={p.funded/p.goal>=(i+1)/4?'built':''} key={s}>{s}</span>)}</div><div className="progress-track"><span style={{width:`${p.funded/p.goal*100}%`}}/></div><div className="project-counts"><strong>{p.funded} / {p.goal} bricks</strong><span>{p.contributors} contributors</span></div><p>Your contribution: {p.myContribution} bricks. Contribute at least 25 to earn 120 XP when it finishes.</p>{!completed&&<div className="contribute-controls"><label>Bricks<input type="number" min="1" max={Math.min(remaining,me?.bricks??0)} value={amount} disabled={!nearby||busy} onChange={e=>setAmounts(prev=>({...prev,[p.id]:Number(e.target.value)}))}/></label><button className="primary-button" disabled={busy||!nearby||!me||!Number.isInteger(amount)||amount<1||amount>remaining||amount>me.bricks} onClick={()=>onContribute(p.id,amount)}>Contribute bricks</button></div>}</section>;})}</div>;
}
