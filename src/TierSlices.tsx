import type { CSSProperties } from 'react';
import { BUILDING_THEMES, SEGMENT_STYLES, TIERS, type SegmentDesign } from '../shared/progression';
import './tier-slices.css';

// UI-only proportions by visual position, from top to bottom. The single
// fill identifies the saved theme of the corresponding tower tier.
const PROPORTIONS=[[48,30],[76,35],[112,38],[146,43],[176,48],[204,53],[220,55],[236,58],[250,60],[264,63]];
const hasShoulder=(index:number)=>index>=3&&index%2===1;
// The smaller top rectangle is 20% narrower, with a shallow raised section.
const SHOULDER_WIDTH=256/320;
export const THEME_COLORS:Record<string,string>={contemporary:'#98aaa2',earthen:'#bd8666',deco:'#bca36c',metabolism:'#789c9f',nocturne:'#8c78aa'};
function silhouette(stacked:boolean){
  return stacked
    ?'M0 72V20Q0 12 8 12H24Q32 12 32 8V4Q32 0 36 0H284Q288 0 288 4V8Q288 12 296 12H312Q320 12 320 20V72Z'
    :'M0 72V8Q0 0 8 0H312Q320 0 320 8V72Z';
}
export function TierSlices({designs,selectedIndex,onSelect,editable=true}:{designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void;editable?:boolean}){
  // Tower tiers count upward from the base; display the highest one first.
  const layers=designs.map((design,index)=>({design,index})).reverse();
  const widths=designs.map((_,index)=>PROPORTIONS[index][0]);
  // Work upward from the bottom: fit each silhouette within the actual top
  // rectangle below it. Flat silhouettes also step inward by at least 20%.
  for(let index=widths.length-2;index>=0;index--){
    widths[index]=Math.min(widths[index],widths[index+1]*(hasShoulder(index+1)?SHOULDER_WIDTH:0.8));
  }
  const bottomWidth=widths[widths.length-1];
  return <div className="tier-slices" aria-label={editable?'Select a building tier':'Building tiers'}>
    {layers.map(({design,index},position)=>{
      const width=widths[position],height=PROPORTIONS[position][1],color=THEME_COLORS[design.theme]||THEME_COLORS.contemporary;
      const details=`${BUILDING_THEMES[design.theme].label} · ${SEGMENT_STYLES[design.style]}`;
      const Element=editable?'button':'div';
      return <Element key={index} className="tier-slice" role={editable?undefined:'img'} aria-pressed={editable?index===selectedIndex:undefined} aria-expanded={editable?index===selectedIndex:undefined}
        aria-label={`${editable?'Customize tier':'Tier'} ${index+1}, ${TIERS[index].name}, ${details}`}
        style={{'--tier-width':`${width}px`,'--tier-relative-width':`${width/bottomWidth*100}%`,'--tier-height':`${height}px`,'--tier-color':color} as CSSProperties} onClick={editable?()=>onSelect(index):undefined}>
        <svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true"><path fill={color} vectorEffect="non-scaling-stroke" d={silhouette(hasShoulder(position))}/></svg>
        <span className="tier-hover-label" aria-hidden="true"><strong>{BUILDING_THEMES[design.theme].label}</strong><small>{SEGMENT_STYLES[design.style]}</small></span>
      </Element>;
    })}
  </div>;
}
