import { useState } from 'react';
import type { Building, Color } from '../shared/types';
import { TierSlices } from './TierSlices';
import { SegmentMenu } from './SegmentMenu';
import { segmentDesigns, SEGMENT_STYLES, BUILDING_THEMES, type BuildingTheme, type SegmentStyle } from '../shared/progression';
export function SegmentEditor({building,own,busy,onSave}:{building:Building;own:boolean;busy:boolean;onSave:(segment:number,color:Color,style:SegmentStyle,theme:BuildingTheme)=>void}){
  const [selectedIndex,setIndex]=useState(0),[draftStyle,setStyle]=useState<SegmentStyle|null>(null),[draftTheme,setTheme]=useState<BuildingTheme|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const closeMenu=()=>{setMenuOpen(false);setStyle(null);setTheme(null);};
  const designs=segmentDesigns(building),index=Math.min(selectedIndex,designs.length-1);
  const design=designs[index],color=design.color,style=draftStyle??design.style,theme=draftTheme??design.theme;
  return <section className="segment-editor" aria-label={own?"Customize tower":"Tower"}>
    <div className="section-heading"><h3>Tower</h3></div>
    <TierSlices editable={own} designs={designs.map((saved,i)=>own&&menuOpen&&i===index?{color,style,theme}:saved)} selectedIndex={own&&menuOpen?index:-1} onSelect={i=>{if(!own)return;if(menuOpen&&i===index){closeMenu();return;}setIndex(i);setStyle(null);setTheme(null);setMenuOpen(true);}}/>
    {own&&menuOpen&&<SegmentMenu title={`Tier ${index+1}`} onClose={closeMenu}>
    <label className="segment-label">Details</label><div className="segment-styles">{(Object.keys(SEGMENT_STYLES) as SegmentStyle[]).map(s=><button key={s} aria-pressed={style===s} disabled={!own||busy} onClick={()=>{if(s!==style)onSave(index,color,s,theme);}}>{SEGMENT_STYLES[s]}</button>)}</div>
    </SegmentMenu>}
  </section>;
}
