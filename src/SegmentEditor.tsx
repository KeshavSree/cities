import { useEffect, useState } from 'react';
import type { Building, Color } from '../shared/types';
import { TierSlices } from './TierSlices';
import { SegmentMenu } from './SegmentMenu';
import { segmentDesigns, SEGMENT_STYLES, BUILDING_THEMES, type BuildingTheme, type SegmentStyle } from '../shared/progression';

export function SegmentEditor({building,own,active=true,busy,unlockedThemes,onUnlock,onSave,onStreetview}:{building:Building;own:boolean;active?:boolean;busy:boolean;unlockedThemes:readonly string[];onUnlock:(theme:BuildingTheme)=>void;onSave:(segment:number,color:Color,style:SegmentStyle,theme:BuildingTheme)=>void;onStreetview?:()=>void}){
  const [selectedIndex,setIndex]=useState(0),[draftStyle,setStyle]=useState<SegmentStyle|null>(null),[draftTheme,setTheme]=useState<BuildingTheme|null>(null);
  const [menuOpen,setMenuOpen]=useState(false),[pendingTheme,setPendingTheme]=useState<BuildingTheme|null>(null);
  const closeMenu=()=>{setPendingTheme(null);setMenuOpen(false);setStyle(null);setTheme(null);};
  useEffect(()=>{if(!active){setPendingTheme(null);setMenuOpen(false);setStyle(null);setTheme(null);}},[active]);
  const designs=segmentDesigns(building),index=Math.min(selectedIndex,designs.length-1);
  const design=designs[index],color=design.color,style=draftStyle??design.style,theme=draftTheme??design.theme;
  useEffect(()=>{
    if(!pendingTheme||busy||!unlockedThemes.includes(pendingTheme))return;
    setPendingTheme(null);
    onSave(index,color,style,pendingTheme);
  },[pendingTheme,busy,unlockedThemes,index,color,style,onSave]);
  return <section className="segment-editor" aria-label={own?"Customize tower":"Tower"}>
    <div className="section-heading"><h3>Tower</h3></div>
    <TierSlices building={building} editable={own} designs={designs.map((saved,i)=>own&&menuOpen&&i===index?{color,style,theme}:saved)} selectedIndex={own&&menuOpen?index:-2} onStreetview={own?onStreetview:undefined} onSelect={i=>{if(!own)return;if(menuOpen&&i===index){closeMenu();return;}setPendingTheme(null);setIndex(i);setStyle(null);setTheme(null);setMenuOpen(true);}}/>
    {own&&menuOpen&&<SegmentMenu title={`Tier ${index+1}`} onClose={closeMenu}>
    <span className="segment-label">Tier {index+1} theme</span>
    {own?<div className="theme-options">{(Object.entries(BUILDING_THEMES) as [BuildingTheme,(typeof BUILDING_THEMES)[BuildingTheme]][]).map(([id,t])=>{
      const unlocked=unlockedThemes.includes(id),selected=theme===id;
      return <button key={id} className={`${selected?'selected ':''}${unlocked?'unlocked':'locked'}`} aria-pressed={selected} data-onboarding-theme={id} disabled={busy||id==='cyberpunk'&&!unlocked} onClick={()=>{setTheme(null);if(!unlocked){setPendingTheme(id);onUnlock(id);}else if(id!==theme)onSave(index,color,style,id);}}>
        <span className={`theme-swatch ${id}`} aria-hidden="true"><i/><i/><i/></span>
        <span><strong>{t.label}</strong><small>{unlocked?(id==='cyberpunk'?'Exclusive theme':t.priceTier===0?'Starter theme':'Unlocked'):id==='cyberpunk'?'Invite 3 residents':`Tier ${t.priceTier} · ${t.cost} bricks`}</small></span>
      </button>;
    })}</div>:<div className="theme-readonly"><span className={`theme-swatch ${theme}`} aria-hidden="true"><i/><i/><i/></span><strong>{BUILDING_THEMES[theme].label}</strong></div>}
    <p className="theme-description">{BUILDING_THEMES[theme].description}</p>
    {theme!=='cyberpunk'&&<><label className="segment-label">Details</label><div className="segment-styles">{(Object.keys(SEGMENT_STYLES) as SegmentStyle[]).map(s=><button key={s} aria-pressed={style===s} disabled={!own||busy} onClick={()=>{if(s!==style)onSave(index,color,s,theme);}}>{SEGMENT_STYLES[s]}</button>)}</div></>}
    </SegmentMenu>}
  </section>;
}
