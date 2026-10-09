import { SETTLEMENT_WEIGHTS, settlementType, type SettlementScore } from './neighborhood';
import type { Building } from '../shared/types';
import { AREA_CAPACITY, plotPlan } from '../shared/plots';
import { MAX_LEVEL, TIERS, REWARDS, tierStartLevel, tierForLevel, tierIndex, segmentCount, xpAtLevel } from '../shared/progression';
import { buildingForm } from './buildingForm';
import { streetGrid } from '../shared/world';
export function ScoreBreakdown({score,building,editable,busy,onDev}:{score:SettlementScore;building:Building;editable:boolean;busy:boolean;onDev:(data:{level?:number;source?:string})=>void}){
  const plan=plotPlan(building.x,building.z),facing=['south','east','north','west'][(Math.round(plan.rotation/(Math.PI/2))+4)%4],tier=tierForLevel(building.level);
  const form=buildingForm(building,score.total);
  const grid=streetGrid(building.x,building.z),heading=Math.round(grid.heading*180/Math.PI);
  const gridDescription=grid.interface?`Finite transition: 0° → ${heading}°`:grid.angle?`New square grid: ${heading}° · transition complete`:'Original square grid: 0°';
  return <section className="score-breakdown" aria-label="Development diagnostics">
    <div className="score-heading"><h3>Development diagnostics</h3><strong>T{tierIndex(building.level)+1}</strong></div>
    <p>{tier.name} · Level {building.level}/{MAX_LEVEL} · {building.xp} XP{building.bricks!==null&&` · ${building.bricks} bricks`}<br/>{tier.ground} · {segmentCount(building.level)} segment{segmentCount(building.level)===1?'':'s'}</p>
    <p>Footprint envelope {form.footprint.w.toFixed(2)} × {form.footprint.d.toFixed(2)}<br/>{form.podium&&<>Base follows {form.podium.length} plot edges<br/></>}{form.tier>=5?'Road edge follows the podium':''}</p>
    <details className="dev-shapes"><summary>Segment shapes and support</summary>{form.sections.map((section,i)=><p key={i}>Segment {i+1}: {section.outline.length} sides · {section.h.toFixed(2)} high<br/>{section.role}<br/>{i===0?'Plot-aligned foundation':`${Math.round(section.supportRatio*100)}% overlap below · ${section.overhang.toFixed(2)} overhang`}{section.terrace&&' · Roof garden'}</p>)}</details>
    <div className="score-contribution"><span>Road occupancy</span><span>{score.density.toFixed(3)} × {Math.round(SETTLEMENT_WEIGHTS.density*100)}%</span><strong>+{score.densityContribution.toFixed(3)}</strong></div>
    <div className="score-contribution"><span>Nearby levels</span><span>{score.levels.toFixed(3)} × {Math.round(SETTLEMENT_WEIGHTS.levels*100)}%</span><strong>+{score.levelContribution.toFixed(3)}</strong></div>
    <p>Road score {score.total.toFixed(3)} · {settlementType(score.total)}<br/>Weighted mean level {score.averageLevel.toFixed(1)} · {score.nearbyResidents} nearby residents<br/>{gridDescription}<br/>Planned area {plan.area} · {AREA_CAPACITY} slots · {plan.layout} · {plan.axis} area alignment · Entrance {facing}<br/>Frontage {plan.frontage.key}</p>
    {editable&&<div className="dev-simulations"><h4>Preview a model tier</h4><div className="dev-tier-buttons">{TIERS.map((t,i)=><button key={t.name} disabled={busy} aria-pressed={tierIndex(building.level)===i} onClick={()=>onDev({level:tierStartLevel(i)})} title={`${t.name}, ${xpAtLevel(tierStartLevel(i))} XP`}>{i+1}<small>L{tierStartLevel(i)}</small></button>)}</div><label>Preview level <select value={building.level} disabled={busy} onChange={e=>onDev({level:Number(e.target.value)})}>{Array.from({length:MAX_LEVEL},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><details className="dev-rewards"><summary>Simulate rewards</summary><div className="dev-reward-buttons">{[['github',`Commit +${REWARDS.commit} XP`],['invite',`Invite +${REWARDS.invite} XP`],['like',`Like +${REWARDS.like} XP`],['construction',`Nearby build +${REWARDS.construction} XP`],['project',`Project +${REWARDS.project} XP`],['daily',`Daily +${REWARDS.dailyXp} XP`],['bricks','Add 100 bricks']].map(([source,label])=><button key={source} disabled={busy} onClick={()=>onDev({source})}>{label}</button>)}</div><p>Local demo controls. Previewing a level edits sample XP; simulated rewards are labeled in the ledger.</p></details></div>}
  </section>;
}
