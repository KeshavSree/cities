import { useEffect, useState } from 'react';
import type { Building, XpEvent } from '../shared/types';
import { MAX_LEVEL, REWARDS, xpAtLevel, xpForNextLevel } from '../shared/progression';
import { api } from './api';
import './level-progress.css';

export function LevelProgress({building}:{building:Building}){
  const max=building.level>=MAX_LEVEL;
  const required=max?1:xpForNextLevel(building.level);
  const earned=max?1:Math.min(required,Math.max(0,building.xp-xpAtLevel(building.level)));
  return <section className="level-progress" aria-label="Building level">
    <div className="level-progress-heading"><strong>Level {building.level}</strong><span>{max?'Max level':`${earned.toLocaleString()} / ${required.toLocaleString()} XP`}</span></div>
    <div className="level-progress-track" role="progressbar" aria-label={max?'Maximum level reached':`XP toward level ${building.level+1}`} aria-valuemin={0} aria-valuemax={required} aria-valuenow={earned}>
      <span style={{width:`${earned/required*100}%`}}/>
    </div>
  </section>;
}

export function ProgressionPanel({building,own}:{building:Building;own:boolean}){
  if(!own)return null;
  return <section className="progression-panel" aria-label="Building rewards">
    {own&&<><div className="xp-sources"><h3>Ways to grow</h3><p>GitHub: {REWARDS.commit} XP / commit</p><p>Invite joins: {REWARDS.invite} XP · Tower likes: {REWARDS.like} XP</p><p>Nearby construction: {REWARDS.construction} XP · Public project completion: {REWARDS.project} XP</p><p>Daily visit: {REWARDS.dailyXp} XP + {REWARDS.dailyBricks} bricks</p></div><RecentXp building={building}/></>}
  </section>;
}
function RecentXp({building}:{building:Building}){
  const [events,setEvents]=useState<XpEvent[]>([]);
  useEffect(()=>{let active=true;api<{events:XpEvent[]}>('/history').then(r=>{if(active)setEvents(r.events);}).catch(()=>{});return()=>{active=false;};},[building.id,building.xp,building.bricks]);
  return events.length>0?<div className="xp-history"><h3>Recent rewards</h3>{events.slice(0,5).map(e=><div key={e.event_key}><span>{e.description}<small>{e.source==='demo'?'Demo simulation':e.source}</small></span><strong>{e.xp>0?`+${e.xp} XP`:''}{e.bricks>0?` · +${e.bricks} bricks`:''}</strong></div>)}</div>:null;
}
