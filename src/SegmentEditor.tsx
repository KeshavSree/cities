import { useState } from 'react';
import type { Building, Color } from '../shared/types';
import { TierSlices } from './TierSlices';
import { SegmentMenu } from './SegmentMenu';
import { segmentDesigns, SEGMENT_COST, SEGMENT_STYLES, BUILDING_THEMES, type BuildingTheme, type SegmentStyle } from '../shared/progression';
export function SegmentEditor({building,own,busy,onSave}:{building:Building;own:boolean;busy:boolean;onSave:(segment:number,color:Color,style:SegmentStyle,theme:BuildingTheme)=>void}){
  const [selectedIndex,setIndex]=useState(0),[draftStyle,setStyle]=useState<SegmentStyle|null>(null),[draftTheme,setTheme]=useState<BuildingTheme|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const closeMenu=()=>{setMenuOpen(false);setStyle(null);setTheme(null);};
  const designs=segmentDesigns(building),index=Math.min(selectedIndex,designs.length-1);
  const design=designs[index],color=design.color,style=draftStyle??design.style,theme=draftTheme??design.theme;
  const different=style!==design.style||theme!==design.theme;
  return <section className="segment-editor" aria-label={own?"Customize tower":"Tower"}>
    <div className="section-heading"><h3>Tower</h3></div>
    <TierSlices editable={own} designs={designs.map((saved,i)=>own&&menuOpen&&i===index?{color,style,theme}:saved)} selectedIndex={own&&menuOpen?index:-1} onSelect={i=>{if(!own)return;setIndex(i);setStyle(null);setTheme(null);setMenuOpen(true);}}/>
    {own&&menuOpen&&<SegmentMenu title={`Tier ${index+1}`} onClose={closeMenu}>
    <label className="segment-label">Tier {index+1} theme<select aria-label={`Tier ${index+1} theme`} value={theme} disabled={!own||busy} onChange={e=>setTheme(e.target.value as BuildingTheme)}>{Object.entries(BUILDING_THEMES).map(([id,t])=><option key={id} value={id}>{t.label}</option>)}</select></label><p className="growth-footnote">{BUILDING_THEMES[theme].description} More themes will be available here.</p>
    <label className="segment-label">Details</label><div className="segment-styles">{(Object.keys(SEGMENT_STYLES) as SegmentStyle[]).map(s=><button key={s} aria-pressed={style===s} disabled={!own||busy} onClick={()=>setStyle(s)}>{SEGMENT_STYLES[s]}</button>)}</div>
    {own&&<button className="primary-button full-width" disabled={busy||!different||(building.bricks??0)<SEGMENT_COST} onClick={()=>onSave(index,color,style,theme)}>Apply to segment {index+1}<span>{SEGMENT_COST} bricks</span></button>}
    <p className="growth-footnote">One segment per tier. Each new tier adds a segment and keeps your existing designs.</p>
    </SegmentMenu>}
  </section>;
}
