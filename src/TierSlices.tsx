import { useId } from 'react';
import { COLORS } from '../shared/types';
import { BUILDING_THEMES, SEGMENT_STYLES, TIERS, type SegmentDesign } from '../shared/progression';
import './tier-slices.css';

/** One outline is the union of the base and optional smaller upper volume.
 * Only the exposed silhouette is drawn: there is no shared horizontal face.
 * All exposed upper corners are rounded; the bottom stays square and flat.
 */
function silhouette(stacked:boolean){
  return stacked
    ?'M0 72V32Q0 24 8 24H52Q60 24 60 16V8Q60 0 68 0H252Q260 0 260 8V16Q260 24 268 24H312Q320 24 320 32V72Z'
    :'M0 72V8Q0 0 8 0H312Q320 0 320 8V72Z';
}

function TierSlice({tier,design,selected,onSelect}:{tier:number;design:SegmentDesign;selected:boolean;onSelect:()=>void}){
  const clipId=useId(),theme:string=design.theme;
  const stacked=tier>=2&&(tier%3===2||theme==='deco'||theme==='metabolism');
  const outline=silhouette(stacked),rows=stacked?[38,60]:[16,38,60];
  const columns=Array.from({length:tier<2?8:12},(_,i)=>tier<2?20+i*39:12+i*26);
  return <button className={`tier-slice ${theme}`} aria-pressed={selected}
    aria-label={`Tier ${tier+1}, ${TIERS[tier].name}: ${BUILDING_THEMES[design.theme].label}, ${COLORS[design.color].label}, ${SEGMENT_STYLES[design.style]}`}
    onClick={onSelect}>
    <svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={clipId}><path d={outline}/></clipPath></defs>
      <path className="tier-art-body" fill={COLORS[design.color].hex} d={outline}/>
      <g clipPath={`url(#${clipId})`}>
        <g className={`tier-art-windows ${design.style}`}>
          {rows.flatMap(y=>columns.map(x=><rect key={`${x},${y}`} x={x} y={y-6} width={design.style==='glass'&&tier>=2?20:10} height="12" rx="1"/>))}
          {stacked&&[82,108,134,160,186,212,238].map(x=><rect key={x} x={x} y="8" width="10" height="10" rx="1"/>)}
        </g>
        {design.style==='balcony'&&<g className="tier-art-rails">{rows.map(y=><path key={y} d={`M10 ${y+8}H310M10 ${y+4}H310`}/>)}</g>}
        {theme==='earthen'&&<g className="tier-art-earth">{[24,48,70].map(y=><path key={y} d={`M0 ${y}H320`}/>)}</g>}
        {theme==='deco'&&<g className="tier-art-deco">{[60,104,148,192,236,280].map(x=><path key={x} d={`M${x} 0V72`}/>)}</g>}
        {theme==='metabolism'&&<g className="tier-art-modules">{rows.map(y=><path key={y} d={`M6 ${y-9}H314V${y+9}H6Z`}/>)}</g>}
        {theme==='nocturne'&&<path className="tier-art-night" d="M0 23H320M0 47H320"/>}
      </g>
    </svg>
  </button>;
}

export function TierSlices({designs,selectedIndex,onSelect}:{designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void}){
  return <div className="tier-slices" aria-label="Select a building tier">
    {designs.map((design,index)=><TierSlice key={index} tier={index} design={design} selected={index===selectedIndex} onSelect={()=>onSelect(index)}/>)}
  </div>;
}
