import { useState } from 'react';
import { COLORS, type Building, type Color } from '../shared/types';
import { segmentDesigns, SEGMENT_COST, SEGMENT_STYLES, type SegmentStyle } from '../shared/progression';
export function SegmentEditor({building,own,busy,onSave}:{building:Building;own:boolean;busy:boolean;onSave:(segment:number,color:Color,style:SegmentStyle)=>void}){
  const [index,setIndex]=useState(0),[draftColor,setColor]=useState<Color|null>(null),[draftStyle,setStyle]=useState<SegmentStyle|null>(null);
  const design=segmentDesigns(building)[index],color=draftColor??design.color,style=draftStyle??design.style;
  const different=color!==design.color||style!==design.style;
  return <section className="segment-editor" aria-label="Customize building segments">
    <div className="section-heading"><h3>Building segments</h3><span>{SEGMENT_COST} bricks per edit</span></div>
    <div className="segment-tabs">{['Base','Lower','Upper','Crown'].map((name,i)=><button key={name} aria-pressed={index===i} onClick={()=>{setIndex(i);setColor(null);setStyle(null);}}>{name}</button>)}</div>
    <div className="segment-preview" style={{background:COLORS[color].hex}}><span>{['Base','Lower','Upper','Crown'][index]}</span><strong>{SEGMENT_STYLES[style]}</strong></div>
    <label className="segment-label">Facade color</label><div className="color-options">{(Object.keys(COLORS) as Color[]).map(c=><button key={c} aria-label={`Segment ${COLORS[c].label}`} title={COLORS[c].label} aria-pressed={color===c} disabled={!own||busy} style={{background:COLORS[c].hex}} onClick={()=>setColor(c)}/>)}</div>
    <label className="segment-label">Details</label><div className="segment-styles">{(Object.keys(SEGMENT_STYLES) as SegmentStyle[]).map(s=><button key={s} aria-pressed={style===s} disabled={!own||busy} onClick={()=>setStyle(s)}>{SEGMENT_STYLES[s]}</button>)}</div>
    {own&&<button className="primary-button full-width" disabled={busy||!different||building.bricks<SEGMENT_COST} onClick={()=>onSave(index,color,style)}>Apply to {['base','lower segment','upper segment','crown'][index]}<span>{SEGMENT_COST} bricks</span></button>}
    <p className="growth-footnote">Your four segment designs carry forward into each new model tier.</p>
  </section>;
}
