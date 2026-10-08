import { CONNECTION_DEGREE_SCALE, SETTLEMENT_THRESHOLDS, SETTLEMENT_WEIGHTS, settlementType, type SettlementScore } from './neighborhood';

export function ScoreBreakdown({score}:{score:SettlementScore}){
  const format=(value:number)=>value.toFixed(3);
  return <section className="score-breakdown" aria-label="Connectivity score breakdown">
    <div className="score-heading"><h3>Connectivity score</h3><span className={`settlement-label ${settlementType(score.total)}`}>{settlementType(score.total)}</span><strong title={String(score.total)}>{format(score.total)}</strong></div>
    <div className="score-contribution"><span>Proximity</span><span title={String(score.proximity)}>{format(score.proximity)} × {SETTLEMENT_WEIGHTS.proximity*100}%</span><strong title={String(score.proximityContribution)}>+{format(score.proximityContribution)}</strong></div>
    <div className="score-contribution"><span>Connections</span><span title={String(score.connections)}>{format(score.connections)} × {SETTLEMENT_WEIGHTS.connections*100}%</span><strong title={String(score.connectionContribution)}>+{format(score.connectionContribution)}</strong></div>
    <p>Connections: <strong>{score.connectionDegree}</strong> · Nearby residents: <strong>{score.nearbyResidents}</strong></p>
    <p>Connection score uses this building’s degree ÷ {CONNECTION_DEGREE_SCALE}, capped at 1. Includes the inviter and residents they invited.</p>
    <div className="score-thresholds">Rural &lt; {SETTLEMENT_THRESHOLDS.suburban} · Suburban &lt; {SETTLEMENT_THRESHOLDS.urban} · Urban ≥ {SETTLEMENT_THRESHOLDS.urban}</div>
  </section>;
}
