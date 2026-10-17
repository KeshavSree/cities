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
  let result:Building,failure:unknown;
  try{result=(await request<{building:Building}>(saving.id?'/decorations/move':'/decorations/purchase',saving)).building;}
  catch(error){
    const fresh=await request<{building:Building}>('/me').catch(()=>null);
    if(!fresh)throw error;
    result=fresh.building;failure=error;
  }
  const unconfirmed=()=>new Error('The item was not confirmed at this spot. Check your collection and try again.');
  if(result.id!==owner.id)throw failure??unconfirmed();
  const owned=decorationsOf(result).find(item=>item.id===receiptId);
  if(owned?.kind===draft.kind&&sameSpot(owned,draft))return result;
  onRefresh(result);
  if(!owned||owned.kind!==draft.kind||saving.id)throw failure??unconfirmed();
  // Receipt replays can succeed after another tab moved or stored the purchase.
  const invalid=placementError(result,draft.kind,{x:draft.x,z:draft.z,rotation:draft.rotation},owned.id);
  if(invalid)throw new Error(invalid);
  const moved=(await request<{building:Building}>('/decorations/move',{...draft,id:owned.id})).building;
  if(moved.id!==owner.id)throw unconfirmed();
  const confirmed=decorationsOf(moved).find(item=>item.id===receiptId&&item.kind===draft.kind);
  if(!confirmed||!sameSpot(confirmed,draft)){onRefresh(moved);throw unconfirmed();}
  return moved;
}
