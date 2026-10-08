import { INVITE_DEGREE_SCALE, SETTLEMENT_THRESHOLDS, SETTLEMENT_WEIGHTS, settlementType, type SettlementScore } from './neighborhood';
import type { Building } from '../shared/types';
import { AREA_CAPACITY, plotPlan } from '../shared/plots';

export function ScoreBreakdown({score,building}:{score:SettlementScore;building:Building}){
  const format=(value:number)=>value.toFixed(3);
  const plan=plotPlan(building.x,building.z);
  const facing=['south','east','north','west'][(Math.round(plan.rotation/(Math.PI/2))+4)%4];
  return <section className="score-breakdown" aria-label="Connectivity score breakdown">
    <div className="score-heading"><h3>Connectivity score</h3><span className={`settlement-label ${settlementType(score.total)}`}>{settlementType(score.total)}</span><strong title={String(score.total)}>{format(score.total)}</strong></div>
    <div className="score-contribution"><span>Proximity</span><span title={String(score.proximity)}>{format(score.proximity)} × {SETTLEMENT_WEIGHTS.proximity*100}%</span><strong title={String(score.proximityContribution)}>+{format(score.proximityContribution)}</strong></div>
    <div className="score-contribution"><span>Invites</span><span title={String(score.invites)}>{format(score.invites)} × {SETTLEMENT_WEIGHTS.invites*100}%</span><strong title={String(score.inviteContribution)}>+{format(score.inviteContribution)}</strong></div>
    <p>Invites: <strong>{score.inviteDegree}</strong> · Nearby residents: <strong>{score.nearbyResidents}</strong></p>
    <p>Invite score uses this building’s degree ÷ {INVITE_DEGREE_SCALE}, capped at 1. Includes the inviter and residents they invited.</p>
    <p>Planned area {plan.area} · {AREA_CAPACITY} plots · {plan.axis} street alignment<br/>Entrance faces {facing} ({Math.round(plan.rotation*180/Math.PI)}°). Adjacent areas use the other road family.</p>
    <div className="score-thresholds">Rural &lt; {SETTLEMENT_THRESHOLDS.suburban} · Suburban &lt; {SETTLEMENT_THRESHOLDS.urban} · Urban ≥ {SETTLEMENT_THRESHOLDS.urban}</div>
  </section>;
}
