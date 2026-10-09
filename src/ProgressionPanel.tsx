import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { Building } from '../shared/types';
import { MAX_LEVEL, REWARDS, tierForLevel, xpAtLevel, xpForNextLevel } from '../shared/progression';
import './level-progress.css';

export function LevelProgress({building}:{building:Building}){
  const [helpOpen,setHelpOpen]=useState(false),helpId=useId();
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!helpOpen)return;
    const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node))setHelpOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setHelpOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[helpOpen]);
  const max=building.level>=MAX_LEVEL;
  const required=max?1:xpForNextLevel(building.level);
  const earned=max?1:Math.min(required,Math.max(0,building.xp-xpAtLevel(building.level)));
  return <section ref={panel} className="level-progress" aria-label="Building level">
    <div className="level-progress-heading"><div className="level-progress-title"><strong>Level {building.level} · {tierForLevel(building.level).name}</strong><button type="button" className="growth-info-button" aria-label="Ways to grow" aria-expanded={helpOpen} aria-controls={helpId} onClick={()=>setHelpOpen(!helpOpen)}><HelpCircle size={15}/></button></div><span>{max?'Max level':`${earned.toLocaleString()} / ${required.toLocaleString()} XP`}</span></div>
    <div className="level-progress-track" role="progressbar" aria-label={max?'Maximum level reached':`XP toward level ${building.level+1}`} aria-valuemin={0} aria-valuemax={required} aria-valuenow={earned}>
      <span style={{width:`${earned/required*100}%`}}/>
    </div>
    {helpOpen&&<aside id={helpId} className="growth-info-popover" aria-label="Ways to grow">
      <h3>Ways to grow</h3>
      <p>GitHub: {REWARDS.commit} XP / commit</p>
      <p>Invite joins: {REWARDS.invite} XP · Tower likes: {REWARDS.like} XP</p>
      <p>Nearby construction: {REWARDS.construction} XP · Public project completion: {REWARDS.project} XP</p>
      <p>Daily visit: {REWARDS.dailyXp} XP + {REWARDS.dailyBricks} bricks</p>
    </aside>}
  </section>;
}
