import { useEffect, useId, useRef, useState } from 'react';
import { Armchair, Check, Columns3, HelpCircle, Landmark, Package, TreePine } from 'lucide-react';
import type { Building, PublicProject } from '../shared/types';
import { PROJECT_RADIUS } from '../shared/projects';
import { plotPosition } from '../shared/world';
import { REWARDS } from '../shared/progression';
import './level-progress.css';

export function ProjectBoard({project:p,me,busy,onContribute}:{project:PublicProject;me:Building|undefined;busy:boolean;onContribute:(id:string,amount:number)=>void}){
  const [draft,setDraft]=useState<number|''|null>(null);
  const [helpOpen,setHelpOpen]=useState(false),helpId=useId();
  const help=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!helpOpen)return;
    const outside=(event:PointerEvent)=>{if(!help.current?.contains(event.target as Node))setHelpOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setHelpOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[helpOpen]);
  const own=me?plotPosition(me.x,me.z):null,center=plotPosition(p.x,p.z);
  const nearby=own?Math.hypot(own.x-center.x,own.z-center.z)<=PROJECT_RADIUS:false;
  const completed=p.funded>=p.goal,remaining=Math.max(0,p.goal-p.funded),ratio=Math.min(1,p.funded/p.goal);
  const maximum=Math.min(remaining,me?.bricks??0),amount=draft??Math.min(25,maximum);
  const valid=typeof amount==='number'&&Number.isInteger(amount)&&amount>0&&amount<=maximum;
  const status=completed?'Complete':ratio>=.75?'Structure':ratio>=.5?'Seating':ratio>=.25?'Planting':'Groundwork';
  const milestones=[
    {name:'Planting',detail:'Trees and gardens',icon:TreePine},
    {name:'Seating',detail:'Shared benches',icon:Armchair},
    {name:'Structure',detail:'Platform and columns',icon:Columns3},
    {name:'Landmark',detail:p.kind==='park'?'Garden pavilion':'Public sculpture',icon:Landmark},
  ];
  return <div className="project-content">
    <div ref={help} className="level-progress project-funding">
      <div className="level-progress-heading"><div className="level-progress-title"><strong>{status}</strong><button className="growth-info-button" type="button" aria-label="How public projects work" aria-expanded={helpOpen} aria-controls={helpId} onClick={()=>setHelpOpen(!helpOpen)}><HelpCircle size={18}/></button></div><span className="project-brick-total"><Package size={13}/>{p.funded.toLocaleString()} / {p.goal.toLocaleString()}</span></div>
      <div className="level-progress-track" role="progressbar" aria-label="Project funding in bricks" aria-valuemin={0} aria-valuemax={p.goal} aria-valuenow={p.funded}><span style={{width:`${ratio*100}%`}}/></div>
      {helpOpen&&<aside id={helpId} className="growth-info-popover" aria-label="How public projects work"><h3>How public projects work</h3><p>Nearby residents contribute bricks to build this place.</p><p>Contribute at least 25 bricks to earn {REWARDS.project} XP when it is complete.</p><p>New features appear at 25%, 50%, 75%, and 100% funding.</p></aside>}
    </div>
    <div className="project-milestones" aria-label="Construction milestones">{milestones.map(({name,detail,icon:Icon},i)=>{
      const built=ratio>=(i+1)/4;
      return <div className={`project-milestone ${built?'is-built':''}`} key={name} role="group" tabIndex={0} aria-label={`${name}: ${detail}, ${built?'built':`unlocks at ${Math.ceil(p.goal*(i+1)/4)} bricks`}`}><Icon size={18}/><div><strong>{name}</strong><small>{detail}</small></div><span>{built?<Check size={15}/>:<>{(i+1)*25}%</>}</span></div>;
    })}</div>
    {me&&<div className="project-own-contribution"><span>Your contribution</span><span><Package size={13}/>{p.myContribution.toLocaleString()}</span></div>}
    {!completed&&<form className="project-contribute" onSubmit={event=>{event.preventDefault();if(!busy&&nearby&&me&&valid)onContribute(p.id,amount as number);}}>
      <label htmlFor={`project-bricks-${p.id}`}>Contribute bricks</label>
      <div><input id={`project-bricks-${p.id}`} type="number" min="1" max={Math.max(1,maximum)} step="1" value={amount} disabled={!nearby||busy||maximum<1} onChange={event=>setDraft(event.target.value===''?'':Number(event.target.value))}/><button type="submit" className="primary-button" disabled={busy||!nearby||!me||!valid}>{busy?'Contributing…':'Contribute'}</button></div>
      {!me?<p>Sign in to contribute.</p>:!nearby?<p>Your tower needs to be nearby to contribute.</p>:maximum<1?<p>You need bricks to contribute.</p>:null}
    </form>}
  </div>;
}
