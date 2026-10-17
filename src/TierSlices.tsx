import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import type { Building } from '../shared/types';
import { BUILDING_THEMES, SEGMENT_STYLES, TIERS, type SegmentDesign } from '../shared/progression';
import { TowerModelPreview } from './TowerModelPreview';
import './tier-slices.css';

export function TierSlices({building,designs,selectedIndex,onSelect,onStreetview,editable=true}:{building:Building;designs:SegmentDesign[];selectedIndex:number;onSelect:(index:number)=>void;onStreetview?:()=>void;editable?:boolean}){
  const [hovered,setHovered]=useState<number|null>(null),[layout,setLayout]=useState<{tiers:number[];street:number|null}>({tiers:[],street:null}),layers=designs.map((design,index)=>({design,index})).reverse();
  const stageHeight=Math.min(450,190+designs.length*22),stageStyle={'--tower-stage-height':`${stageHeight}px`} as CSSProperties;
  const previewBuilding=useMemo(()=>({...building,segments:JSON.stringify(designs)}),[building,designs]);
  const updateLayout=useCallback((tiers:number[],street:number)=>setLayout(current=>current.tiers.length===tiers.length&&current.tiers.every((value,index)=>Math.abs(value-tiers[index])<.001)&&current.street!==null&&Math.abs(current.street-street)<.001?current:{tiers,street}),[]);
  const actualCenter=(index:number)=>layout.tiers[index]??(designs.length-index-.5)/designs.length;
  const labelCenters=new Map<number,number>(),minimumLabelGap=35/stageHeight,placed=designs.map((_,index)=>actualCenter(index));
  for(let index=1;index<placed.length;index++)placed[index]=Math.min(placed[index],placed[index-1]-minimumLabelGap);
  placed.forEach((center,index)=>labelCenters.set(index,center));
  const position=(index:number)=>{
    const center=actualCenter(index);
    const above=index===designs.length-1?Math.max(0,center-((layout.tiers[index-1]??center)-center)/2):(center+(layout.tiers[index+1]??center))/2;
    const below=index===0&&layout.street!==null?(center+layout.street)/2:index===0?Math.min(1,center+(center-(layout.tiers[index+1]??center))/2):(center+(layout.tiers[index-1]??center))/2;
    const top=Math.max(0,above),bottom=Math.min(1,below),hitCenter=(top+bottom)/2;
    return {'--tier-top':`${top*100}%`,'--tier-height':`${Math.max(.055,bottom-top)*100}%`,'--tier-label-y-offset':`${((labelCenters.get(index)??center)-hitCenter)*stageHeight}px`} as CSSProperties;
  };
  const streetCenter=layout.street??Math.min(.88,actualCenter(0)+.09);
  const streetButtonPosition={'--street-button-top':`${streetCenter*stageHeight+40}px`} as CSSProperties;
  return <div className={`tier-slices ${editable?'is-editable':''}`} style={stageStyle} aria-label={editable?'Select a building tier':'Building tiers'}>
    <TowerModelPreview building={previewBuilding} activeSegment={hovered??selectedIndex} onLayout={updateLayout}/>
    <div className="tier-slice-list">{layers.map(({design,index})=>{
      const details=BUILDING_THEMES[design.theme].label+(design.theme==='cyberpunk'?'':` · ${SEGMENT_STYLES[design.style]}`),Element=editable?'button':'div';
      return <Element key={index} className={`tier-slice ${design.theme}`} style={position(index)} role={editable?undefined:'img'} aria-pressed={editable?index===selectedIndex:undefined} aria-expanded={editable?index===selectedIndex:undefined}
        aria-label={`${editable?'Customize tier':'Tier'} ${index+1}, ${TIERS[index].name}, ${details}`} onPointerEnter={()=>setHovered(index)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} onClick={editable?()=>onSelect(index):undefined}>
        <span className="tier-model-hit" aria-hidden="true"/><span className="tier-slice-copy"><strong>{BUILDING_THEMES[design.theme].label}</strong><small>Tier {index+1}{design.theme==='cyberpunk'?'':` · ${SEGMENT_STYLES[design.style]}`}</small></span>
      </Element>;
    })}</div>
    {editable&&onStreetview&&<button type="button" className="streetview-button" style={streetButtonPosition} data-guide="your-streetview" onPointerEnter={()=>setHovered(-1)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(-1)} onBlur={()=>setHovered(null)} onClick={()=>onStreetview()}>
      Streetview
    </button>}
  </div>;
}
