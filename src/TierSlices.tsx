import type { CSSProperties } from 'react';
import { BUILDING_THEMES, TIERS, type SegmentDesign } from '../shared/progression';
import './tier-slices.css';

// UI-only proportions: consistent for every resident, independent of their
// facade customization. The single fill identifies the saved theme.
const PROPORTIONS=[[264,24],[250,28],[236,30],[220,34],[204,38],[176,42],[146,44],[112,46],[76,48],[48,50]];
export const THEME_COLORS:Record<string,string>={contemporary:'#98aaa2',earthen:'#bd8666',deco:'#bca36c',metabolism:'#789c9f',nocturne:'#8c78aa'};
function silhouette(stacked:boolean){
  return stacked
    ?'M0 72V32Q0 24 8 24H52Q60 24 60 16V8Q60 0 68 0H252Q260 0 260 8V16Q260 24 268 24H312Q320 24 320 32V72Z'
    :'M0 72V8Q0 0 8 0H312Q320 0 320 8V72Z';
}
export function TierSlices({designs,selectedIndex,onSelect}:{designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void}){
  return <div className="tier-slices" aria-label="Select a building tier">
    {designs.map((design,index)=>{
      const [width,height]=PROPORTIONS[index],color=THEME_COLORS[design.theme]||THEME_COLORS.contemporary;
      return <button key={index} className="tier-slice" aria-pressed={index===selectedIndex} aria-haspopup="dialog"
        aria-label={`Customize tier ${index+1}, ${TIERS[index].name}, ${BUILDING_THEMES[design.theme].label}`}
        style={{'--tier-width':`${width}px`,'--tier-height':`${height}px`,'--tier-color':color} as CSSProperties} onClick={()=>onSelect(index)}>
        <svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-hidden="true"><path fill={color} d={silhouette(index>=3&&index%2===1)}/></svg>
      </button>;
    })}
  </div>;
}
