import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { COLORS, type Building } from '../shared/types';
import { PLOT_SPACING, coastZ, plotPosition } from '../shared/world';
import { neighborhoodDensity, settlementType, streetPoints } from './neighborhood';

export function CityMap({buildings,selected,center}:{buildings:Building[];selected:string|null;center:{x:number;z:number}}){
  const densityAt=useMemo(()=>neighborhoodDensity(buildings),[buildings]);
  const project=(p:{x:number;z:number})=>({x:60+(p.x/PLOT_SPACING-center.x)*10,z:50+(p.z/PLOT_SPACING-center.z)*10});
  const local=buildings.filter(b=>Math.abs(b.x-center.x)<7&&Math.abs(b.z-center.z)<6);
  const roads=new Map<string,{x:number;z:number;horizontal:boolean}>();
  const occupied=new Set(buildings.map(b=>`${b.x},${b.z}`));
  for(const b of local){
    roads.set(`h:${b.x},${b.z+1}`,{x:b.x,z:b.z+1,horizontal:true});
    roads.set(`h:${b.x},${b.z}`,{x:b.x,z:b.z,horizontal:true});
    if(settlementType(densityAt(b.x,b.z))==='urban'||occupied.has(`${b.x},${b.z+1}`)||occupied.has(`${b.x},${b.z-1}`)){
      for(const x of [b.x,b.x+1])roads.set(`v:${x},${b.z}`,{x,z:b.z,horizontal:false});
    }
  }
  const shore=Array.from({length:17},(_,i)=>{const x=(center.x-8+i)*PLOT_SPACING;return project({x,z:coastZ(x)});});
  return <div className="mini-map" aria-label="City map"><svg viewBox="0 0 120 100" role="img" aria-label="Nearby buildings, irregular streets, and settlement density">
    <rect width="120" height="100" fill="#c4d3b6"/>
    <path d={`M ${shore.map(p=>`${p.x},${p.z}`).join(' L ')} L 140,140 L -20,140 Z`} fill="#a8ced8"/>
    {local.map(b=>{const density=densityAt(b.x,b.z);return <polygon key={`land-${b.id}`} points={[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dz])=>{const p=project(plotPosition(b.x+dx,b.z+dz));return `${p.x},${p.z}`;}).join(' ')} fill={density>=.54?'#cbd0c7':'#b4c8a4'} opacity={Math.min(1,density*1.5)}/>;})}
    {[...roads].map(([key,road])=><polyline key={key} points={streetPoints(road.x,road.z,road.horizontal).map(p=>{const v=project(p);return `${v.x},${v.z}`;}).join(' ')} stroke="#edf0e5" strokeWidth="1.2" fill="none"/>)}
    {local.map(b=>{const p=project(plotPosition(b.x,b.z));return <rect key={b.id} x={p.x-2.5} y={p.z-2.5} width="5" height="5" fill={b.id===selected?'#7971df':COLORS[b.color].hex} stroke={b.id===selected?'#fff':'#6d877b'} strokeWidth={b.id===selected?1:.3}/>;})}
    {local.filter(b=>b.invited_by).map(b=>{const parent=local.find(p=>p.id===b.invited_by);if(!parent)return null;const a=project(plotPosition(b.x,b.z)),p=project(plotPosition(parent.x,parent.z));return <line key={`invite-${b.id}`} x1={a.x} y1={a.z} x2={p.x} y2={p.z} stroke="#7971df" strokeWidth=".8" opacity=".8"/>;})}
  </svg><span><MapPin size={11}/> You’re in good company</span></div>;
}
