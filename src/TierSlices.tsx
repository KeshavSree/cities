import type { CSSProperties } from 'react';
import { BUILDING_THEMES, TIERS, type SegmentDesign } from '../shared/progression';
import './tier-slices.css';

// UI-only proportions: consistent for every resident, independent of their
// facade customization. The single fill identifies the saved theme.
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
export function TierSlices({designs,selectedIndex,onSelect}:{designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void}){
  const widths=designs.map((_,index)=>PROPORTIONS[index][0]);
  // Work upward from the bottom: fit each silhouette within the actual top
  // rectangle below it. Flat silhouettes also step inward by at least 20%.
  for(let index=widths.length-2;index>=0;index--){
    widths[index]=Math.min(widths[index],widths[index+1]*(hasShoulder(index+1)?SHOULDER_WIDTH:0.8));
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
