import type { Building } from '../shared/types';
import { decorationsOf, placementError, type Decoration, type DecorationDraft } from '../shared/decorations';
import { api } from './api';

type DecorationRequest=<T>(path:string,data?:unknown)=>Promise<T>;
const sameSpot=(item:Decoration,draft:DecorationDraft)=>item.x===draft.x&&item.z===draft.z&&item.rotation===draft.rotation;

/** A lost purchase response must neither spend twice nor silently discard a later position. */
export async function persistDecoration(owner:Building,draft:DecorationDraft,onRefresh:(building:Building)=>void,request:DecorationRequest=api):Promise<Building>{
  if(draft.x===null||draft.z===null)throw new Error('Choose a spot first.');
  const receiptId=draft.id||`${owner.id}:${draft.requestId}`;
  const prior=decorationsOf(owner).find(item=>item.id===receiptId);
  if(prior&&prior.kind!==draft.kind)throw new Error('This purchase belongs to another item. Choose the item again.');
  const error=placementError(owner,draft.kind,{x:draft.x,z:draft.z,rotation:draft.rotation},prior?.id||draft.id);
  if(error)throw new Error(error);
  const saving=prior?{...draft,id:prior.id}:draft;
  try{return (await request<{building:Building}>(saving.id?'/decorations/move':'/decorations/purchase',saving)).building;}
  catch(error){
    const fresh=await request<{building:Building}>('/me').catch(()=>null);
    if(!fresh)throw error;
    onRefresh(fresh.building);
    const owned=decorationsOf(fresh.building).find(item=>item.id===receiptId);
    if(!owned||owned.kind!==draft.kind)throw error;
    if(sameSpot(owned,draft))return fresh.building;
    if(saving.id)throw error;
    // The earlier purchase completed at another spot. Finish this placement as a free move.
    const invalid=placementError(fresh.building,draft.kind,{x:draft.x,z:draft.z,rotation:draft.rotation},owned.id);
    if(invalid)throw new Error(invalid);
    return (await request<{building:Building}>('/decorations/move',{...draft,id:owned.id})).building;
  }
}
