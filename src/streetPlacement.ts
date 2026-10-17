import { baseShopSlots, nearestShopSlot } from '../shared/shopAttachments';
import { plotPosition } from '../shared/world';
import { decorationFootprint, placementError, type DecorationDraft } from '../shared/decorations';
import type { Building } from '../shared/types';
import { canWalk } from './streetNavigation';

/** Place what the walker is holding on reachable ground ahead of the reticle. */
export function streetPlacement(owner:Building,draft:DecorationDraft,eye:{x:number;y:number;z:number},direction:{x:number;y:number;z:number}){
  const horizontal=Math.hypot(direction.x,direction.z),origin=plotPosition(owner.x,owner.z);
  const groundDistance=direction.y<-.05?(eye.y-.115)/-direction.y*horizontal:1.3;
  const distance=Math.max(.6,Math.min(2.2,groundDistance));
  const x=Math.round((eye.x+direction.x/Math.max(horizontal,.001)*distance-origin.x)*20)/20;
  const z=Math.round((eye.z+direction.z/Math.max(horizontal,.001)*distance-origin.z)*20)/20;
  if(draft.kind==='base_shop'){
    const reachable=baseShopSlots(owner).filter(slot=>Math.hypot(origin.x+slot.x-eye.x,origin.z+slot.z-eye.z)<=3.2);
    const slot=[...reachable].sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0]??nearestShopSlot(owner,{x,z});
    if(!slot)return {x,z,rotation:draft.rotation,error:'This building has no storefront slots yet.'};
    const reach=Math.hypot(origin.x+slot.x-eye.x,origin.z+slot.z-eye.z);
    return {...slot,error:reach>3.2?'Walk closer to your building to attach the shop.':placementError(owner,draft.kind,slot,draft.id)};
  }
  const position={x,z,rotation:draft.rotation};
  const error=placementError(owner,draft.kind,position,draft.id)||(!canWalk(eye,[decorationFootprint(owner,draft.kind,position)])?'Step back to leave room for yourself.':null);
  return {...position,error};
}
