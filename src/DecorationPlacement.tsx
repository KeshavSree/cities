import { baseShopSlots } from '../shared/shopAttachments';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCw, Package, X } from 'lucide-react';
import type { Building } from '../shared/types';
import { DECORATIONS, placementError, type DecorationDraft } from '../shared/decorations';
export function DecorationPlacement({building,draft,busy,onChange,onCancel,onConfirm,onSuggest}:{building:Building;draft:DecorationDraft;busy:boolean;onChange:(draft:DecorationDraft)=>void;onCancel:()=>void;onConfirm:()=>void;onSuggest:()=>void}){
  const attached=draft.kind==='base_shop',slots=attached?baseShopSlots(building):[];
  const definition=DECORATIONS[draft.kind],hasPoint=draft.x!==null&&draft.z!==null;
  const error=hasPoint?placementError(building,draft.kind,{x:draft.x!,z:draft.z!,rotation:draft.rotation},draft.id):attached?'Click a highlighted slot on your building’s base.':'Click your highlighted yard to choose a spot.';
  const affordable=Boolean(draft.id)||(building.bricks??0)>=definition.cost;
  return <section className="decoration-placement" aria-label="Place garden decoration">
    <header><div><strong>{draft.id?'Move':'Place'} {definition.label.toLowerCase()}</strong><span>{draft.id?'Move it for free':`${definition.cost} bricks when placed`}</span></div><button aria-label="Cancel decoration placement" disabled={busy} onClick={onCancel}><X size={18}/></button></header>
    <p className={hasPoint&&error?'placement-invalid':''} role="status">{error||'This spot is ready.'}</p>
    <div className="decoration-placement-controls">{attached?<select aria-label="Storefront wall slot" value={slots.findIndex(slot=>slot.x===draft.x&&slot.z===draft.z)} disabled={busy} onChange={event=>{const slot=slots[Number(event.target.value)];if(slot)onChange({...draft,x:slot.x,z:slot.z,rotation:slot.rotation});}}><option value={-1} disabled>Choose a wall slot</option>{slots.map((slot,index)=><option key={index} value={index}>Wall slot {index+1}{placementError(building,draft.kind,slot,draft.id)?' (occupied or blocked)':''}</option>)}</select>:<><div className="decoration-nudges" role="group" aria-label="Adjust decoration position">{[['left',-.1,0,ArrowLeft],['up',0,-.1,ArrowUp],['down',0,.1,ArrowDown],['right',.1,0,ArrowRight]].map(([label,dx,dz,Icon])=>{
      const Arrow=Icon as typeof ArrowLeft;return <button key={String(label)} aria-label={`Move decoration ${label}`} disabled={!hasPoint||busy} onClick={()=>onChange({...draft,x:Math.round((draft.x!+Number(dx))*100)/100,z:Math.round((draft.z!+Number(dz))*100)/100})}><Arrow size={17}/></button>;
    })}</div><button className="decoration-rotate" disabled={busy} onClick={()=>onChange({...draft,rotation:(draft.rotation+1)%4})}><RotateCw size={16}/>Rotate</button></>}<button className="primary-button" disabled={busy||Boolean(error)||!affordable} onClick={onConfirm}>{busy?'Saving…':draft.id?'Save position':<><Package size={14}/>Buy & place</>}</button></div>
    {!affordable&&<small>You need {definition.cost-(building.bricks??0)} more bricks.</small>}
    <footer><button disabled={busy} onClick={onSuggest}>Suggest a spot</button><small>Keep roads and sidewalks clear. Cancel spends no bricks.</small></footer>
  </section>;
}
