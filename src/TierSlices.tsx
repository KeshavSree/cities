import type { CSSProperties } from 'react';
import { BUILDING_THEMES, TIERS, type SegmentDesign } from '../shared/progression';
import './tier-slices.css';

// UI-only proportions: consistent for every resident, independent of their
// facade customization. The single fill identifies the saved theme.
const PROPORTIONS=[[48,24],[76,28],[112,30],[146,34],[176,38],[204,42],[220,44],[236,46],[250,48],[264,50]];
const hasShoulder=(index:number)=>index>=3&&index%2===1;
// The smaller top rectangle runs from x=60 to x=260 in the 320-wide SVG.
const SHOULDER_WIDTH=200/320;
export const THEME_COLORS:Record<string,string>={contemporary:'#98aaa2',earthen:'#bd8666',deco:'#bca36c',metabolism:'#789c9f',nocturne:'#8c78aa'};
function silhouette(stacked:boolean){
  return stacked
    ?'M0 72V32Q0 24 8 24H52Q60 24 60 16V8Q60 0 68 0H252Q260 0 260 8V16Q260 24 268 24H312Q320 24 320 32V72Z'
    :'M0 72V8Q0 0 8 0H312Q320 0 320 8V72Z';
}
export function TierSlices({designs,selectedIndex,onSelect}:{designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void}){
  const widths=designs.map((_,index)=>PROPORTIONS[index][0]);
  // Work upward from the bottom: fit each silhouette within the actual top
  // rectangle of its supporting silhouette, including stepped silhouettes.
  for(let index=widths.length-2;index>=0;index--){
    widths[index]=Math.min(widths[index],widths[index+1]*(hasShoulder(index+1)?SHOULDER_WIDTH:1));
  }
  const bottomWidth=widths[widths.length-1];
  return <div className="tier-slices" aria-label="Select a building tier">
    {designs.map((design,index)=>{
      const width=widths[index],height=PROPORTIONS[index][1],color=THEME_COLORS[design.theme]||THEME_COLORS.contemporary;
      return <button key={index} className="tier-slice" aria-pressed={index===selectedIndex} aria-haspopup="dialog"
        aria-label={`Customize tier ${index+1}, ${TIERS[index].name}, ${BUILDING_THEMES[design.theme].label}`}
        style={{'--tier-width':`${width}px`,'--tier-relative-width':`${width/bottomWidth*100}%`,'--tier-height':`${height}px`,'--tier-color':color} as CSSProperties} onClick={()=>onSelect(index)}>
        <svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true"><path fill={color} d={silhouette(hasShoulder(index))}/></svg>
      </button>;
    })}
  </div>;
}
