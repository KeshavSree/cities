import { useEffect, useState } from 'react';
import { Layers, Package, Zap } from 'lucide-react';
import type { Building, XpEvent } from '../shared/types';
import { MAX_LEVEL, TIERS, tierIndex, tierForLevel, xpAtLevel, xpForNextLevel } from '../shared/progression';
import { api } from './api';

export function ProgressionPanel({building,own}:{building:Building;own:boolean}){
  const tier=tierForLevel(building.level),index=tierIndex(building.level),max=building.level===MAX_LEVEL;
  const progress=max?1:(building.xp-xpAtLevel(building.level))/xpForNextLevel(building.level);
  const remaining=max?0:Math.max(0,xpAtLevel(building.level+1)-building.xp);
  return <section className="progression-panel" aria-label="Building progression">
    <div className="level-heading"><Layers size={19}/><div><span>{tier.name} · Tier {index+1} of 5</span><strong>Level {building.level}<small> / {MAX_LEVEL}</small></strong></div><span className="tier-ground">{tier.ground}</span></div>
    <div className="tier-rail" aria-label="Five model tiers">{TIERS.map((t,i)=><div key={t.name} className={i<=index?'reached':''} title={`${t.name}, levels ${i*4+1}–${i*4+4}`}><span>{i+1}</span><small>{i*4+1}–{i*4+4}</small></div>)}</div>
    <div className="xp-heading"><span><Zap size={14}/> {building.xp.toLocaleString()} total XP</span><strong>{max?'Top tier':`${remaining.toLocaleString()} to level ${building.level+1}`}</strong></div>
    <div className="progress-track"><span style={{width:`${Math.min(100,Math.max(0,progress*100))}%`}}/></div>
    <p className="growth-footnote">{max?'All 20 levels unlocked. Keep making this place your own.':'Levels unlock automatically as you earn XP. Every level takes more.'}</p>
    <div className="brick-balance"><span><Package size={16}/> Bricks</span><strong>{building.bricks.toLocaleString()}</strong><small>For segments, finishes & public projects</small></div>
    {own&&<><div className="xp-sources"><h3>Ways to grow</h3><p>GitHub: 1 XP / commit, 10 / pull request, 5 / review</p><p>Invite joins: 100 XP · Tower likes: 15 XP</p><p>Nearby construction: 12 XP · Public project completion: 120 XP</p><p>Daily visit: 10 XP + 30 bricks</p></div><RecentXp building={building}/></>}
  </section>;
}
function RecentXp({building}:{building:Building}){
  const [events,setEvents]=useState<XpEvent[]>([]);
  useEffect(()=>{let active=true;api<{events:XpEvent[]}>('/history').then(r=>{if(active)setEvents(r.events);}).catch(()=>{});return()=>{active=false;};},[building.id,building.xp,building.bricks]);
  return events.length>0?<div className="xp-history"><h3>Recent rewards</h3>{events.slice(0,5).map(e=><div key={e.event_key}><span>{e.description}<small>{e.source==='demo'?'Demo simulation':e.source}</small></span><strong>{e.xp>0?`+${e.xp} XP`:''}{e.bricks>0?` · +${e.bricks} bricks`:''}</strong></div>)}</div>:null;
}
