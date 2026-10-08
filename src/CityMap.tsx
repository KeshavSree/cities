import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { COLORS, type Building } from '../shared/types';
import { PLOT_SPACING, coastZ, plotPosition } from '../shared/world';
import { plotPlan } from '../shared/plots';
import { buildingForm } from './buildingForm';
import { neighborhoodDensity, streetNetwork, streetDensity, roadColor, shoulderColor, roadWidth, roadShoulder, mixGroundColor, SETTLEMENT_THRESHOLDS } from './neighborhood';

export function CityMap({buildings,selected,center}:{buildings:Building[];selected:string|null;center:{x:number;z:number}}){
  const densityAt=useMemo(()=>neighborhoodDensity(buildings),[buildings]);
  const network=useMemo(()=>streetNetwork(buildings,densityAt),[buildings,densityAt]);
  const project=(p:{x:number;z:number})=>({x:60+(p.x/PLOT_SPACING-center.x)*10,z:50+(p.z/PLOT_SPACING-center.z)*10});
  const local=buildings.filter(b=>Math.abs(b.x-center.x)<7&&Math.abs(b.z-center.z)<6);
  const roads=[...network.roads.values()].filter(road=>Math.abs(road.x-center.x)<8&&Math.abs(road.z-center.z)<7);
  const shore=Array.from({length:17},(_,i)=>{const x=(center.x-8+i)*PLOT_SPACING;return project({x,z:coastZ(x)});});
  return <div className="mini-map" aria-label="City map"><svg viewBox="0 0 120 100" role="img" aria-label="Nearby buildings, irregular streets, and settlement density">
    <rect width="120" height="100" fill="#c4d3b6"/>
    <path d={`M ${shore.map(p=>`${p.x},${p.z}`).join(' L ')} L 140,140 L -20,140 Z`} fill="#a8ced8"/>
    {local.map(b=>{const density=densityAt(b.x,b.z);return <polygon key={`land-${b.id}`} points={[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dz])=>{const p=project(plotPosition(b.x+dx,b.z+dz));return `${p.x},${p.z}`;}).join(' ')} fill={mixGroundColor('#b4c8a4','#cbd0c7',Math.min(1,density/SETTLEMENT_THRESHOLDS.urban)**1.8)} opacity={Math.min(1,density*1.5)}/>;})}
    {roads.flatMap(road=>Array.from({length:8},(_,i)=>{
      const [a,b]=road.points,start=i/8,end=(i+1)/8,density=streetDensity(road,(start+end)/2);
      const p=project({x:a.x+(b.x-a.x)*start,z:a.z+(b.z-a.z)*start}),q=project({x:a.x+(b.x-a.x)*end,z:a.z+(b.z-a.z)*end});
      return <g key={`${road.key}:${i}`}><line x1={p.x} y1={p.z} x2={q.x} y2={q.z} stroke={shoulderColor(density)} strokeWidth={(roadWidth(density)+roadShoulder(density))*10/PLOT_SPACING} strokeLinecap="round"/><line x1={p.x} y1={p.z} x2={q.x} y2={q.z} stroke={roadColor(density)} strokeWidth={roadWidth(density)*10/PLOT_SPACING} strokeLinecap="round"/></g>;
    }))}
    {local.map(b=>{const plan=plotPlan(b.x,b.z),p=project(plan.position),{w,d}=buildingForm(b,densityAt(b.x,b.z)).footprint,scale=10/PLOT_SPACING;
      return <g key={b.id} transform={`rotate(${-plan.rotation*180/Math.PI} ${p.x} ${p.z})`}><rect x={p.x-w*scale/2} y={p.z-d*scale/2} width={w*scale} height={d*scale} fill={b.id===selected?'#7971df':COLORS[b.color].hex} stroke={b.id===selected?'#fff':'#6d877b'} strokeWidth={b.id===selected?1:.3}/><line x1={p.x} y1={p.z+d*scale/2} x2={p.x} y2={p.z+d*scale/2+1.5} stroke="#f8f7ec" strokeWidth=".7"/></g>;})}
    {local.filter(b=>b.invited_by).map(b=>{const parent=local.find(p=>p.id===b.invited_by);if(!parent)return null;const a=project(plotPosition(b.x,b.z)),p=project(plotPosition(parent.x,parent.z));return <line key={`invite-${b.id}`} x1={a.x} y1={a.z} x2={p.x} y2={p.z} stroke="#7971df" strokeWidth=".8" opacity=".8"/>;})}
  </svg><span><MapPin size={11}/> You’re in good company</span></div>;
}
