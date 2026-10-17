import assert from 'node:assert/strict';
import { DECORATIONS, decorationsOf, decorationFootprint, decorationSpace, placementError, placedDecorations, suggestedDecorationPosition, type DecorationKind } from '../shared/decorations';
import { streetPlacement } from '../src/streetPlacement';
import { persistDecoration } from '../src/decorationPersistence';
import { plotPlan } from '../shared/plots';
import { buildingForm } from '../src/buildingForm';
import type { Building } from '../shared/types';
const resident=(x:number,z:number,level:number):Building=>({id:'test',username:'test',name:'Test',bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x,z,level,xp:0,bricks:360,segments:'[]',likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:''});
let positions=0;
for(const [x,z] of [[0,0],[2,2],[-4,-3],[9,-9],[5,-3],[-8,1]])for(const level of [1,4,10,16,22,30]){
  const building=resident(x,z,level);
  for(const kind of Object.keys(DECORATIONS) as DecorationKind[]){
    const position=suggestedDecorationPosition(building,kind);
    if(!position)continue;
    assert.equal(placementError(building,kind,position),null);
    const item={id:'owned',kind,...position};building.decorations=JSON.stringify([item]);
    assert.equal(placementError(building,kind,position),'Leave some space between decorations.');
    assert.equal(placementError(building,kind,position,'owned'),null,'Owned items can move for free');
    assert.equal(placedDecorations(building).length,1,'A valid owned decoration is visible');
    assert.equal(decorationFootprint(building,kind,position).length,4);
    building.decorations='[]';positions++;
  }
}
assert(positions>100,'Test meaningful decoration space across tiers and parcel shapes');
for(const level of [1,10,16,30])for(const kind of Object.keys(DECORATIONS) as DecorationKind[]){
  const building=resident(0,0,level);
  if(kind==='base_shop'&&level<4){assert.equal(suggestedDecorationPosition(building,kind),null);continue;}
  assert(suggestedDecorationPosition(building,kind),`Regular plots need space for ${kind} at level ${level}`);
}
const owner=resident(0,0,4);
assert(decorationSpace(owner,'planter',{x:0,z:0,rotation:0}),'Cannot place inside a building');
assert(decorationSpace(owner,'planter',{x:3.5,z:0,rotation:0}),'Cannot obstruct the road');
assert(decorationSpace(owner,'planter',{x:10,z:10,rotation:0}),'Cannot decorate another plot');
assert(decorationSpace(owner,'planter',{x:NaN,z:0,rotation:0}),'Reject nonfinite positions');
assert(decorationSpace(owner,'planter',{x:1,z:1,rotation:4}),'Reject invalid rotation');
owner.decorations=JSON.stringify([{id:'stored',kind:'bench',x:null,z:null,rotation:0}]);
assert.equal(placedDecorations(owner).length,0,'Stored items remain owned without rendering');
owner.decorations=JSON.stringify([{id:'growth',kind:'planter',x:0,z:1.6,rotation:0}]);
assert.equal(placedDecorations(owner).length,1,'A planter can sit beside a cottage');
owner.level=30;
assert.equal(placedDecorations(owner).length,0,'Do not render a planter inside a larger building');
assert.equal(decorationsOf(owner).length,1,'Growth never destroys a purchased decoration');
assert(suggestedDecorationPosition(owner,'planter',0,'growth'),'A purchased decoration can find another spot after growth');
const carriedOwner=resident(0,0,4),draft={kind:'planter' as const,x:null,z:null,rotation:0,requestId:'test-carry-request'};
const reachable=streetPlacement(carriedOwner,draft,{x:0,y:.76,z:3.3},{x:0,y:-.5,z:-1});
assert.equal(reachable.error,null,'Street view can place a held item in the owner garden');
assert(reachable.z<3.3,'The preview follows the view ahead of the walker');
assert(streetPlacement(carriedOwner,draft,{x:10,y:.76,z:10},{x:0,y:0,z:-1}).error,'Held previews cannot leave the owner plot');
for(const direction of [{x:0,y:1,z:0},{x:0,y:-1,z:0}]){const position=streetPlacement(carriedOwner,draft,{x:0,y:.76,z:3.3},direction);assert(Number.isFinite(position.x)&&Number.isFinite(position.z),'Looking vertically must not create invalid coordinates');}
const form=buildingForm(resident(0,0,30),1),plan=plotPlan(0,0);
for(const point of form.foundationOutline)for(let i=0;i<plan.corners.length;i++){
  const a=plan.corners[i],b=plan.corners[(i+1)%plan.corners.length],dx=b.x-a.x,dz=b.z-a.z;
  assert((dx*(point.z-a.z)-dz*(point.x-a.x))/Math.hypot(dx,dz)>=1.89,'Reserve a wider street and garden margin');
}
console.log(`Decoration checks passed: ${positions} placements across tiers and irregular plots, ownership boundaries, overlaps, storage, rotation, and wider road clearance.`);

const saveOwner={...resident(0,0,4),decorations:'[]'},saveDraft={kind:'planter' as const,x:2,z:1,rotation:0,requestId:'retry-purchase-request'};
const receipt={id:`${saveOwner.id}:${saveDraft.requestId}`,kind:'planter',x:2,z:0,rotation:0};
const purchased={...saveOwner,bricks:320,decorations:JSON.stringify([receipt])};
const placed={...purchased,decorations:JSON.stringify([{...receipt,x:saveDraft.x,z:saveDraft.z}])};
const lostResponse=new Error('Purchase response lost');
let calls:{path:string;data?:unknown}[]=[],refreshed:Building|undefined;
const recovery=async <T>(path:string,data?:unknown):Promise<T>=>{
  calls.push({path,data});
  if(path==='/decorations/purchase')throw lostResponse;
  if(path==='/me')return {building:purchased} as T;
  if(path==='/decorations/move')return {building:placed} as T;
  throw new Error(`Unexpected path ${path}`);
};
const recovered=await persistDecoration(saveOwner,saveDraft,b=>refreshed=b,recovery);
assert.equal(recovered,placed);assert.equal(refreshed,purchased);
assert.deepEqual(calls.map(c=>c.path),['/decorations/purchase','/me','/decorations/move'],'A completed purchase at an earlier position is recovered with a free move, not silently accepted');
assert.equal((calls[2].data as any).id,receipt.id,'Recovery moves the existing receipt instead of buying twice');assert.equal(recovered.bricks,320);
calls=[];await persistDecoration(purchased,saveDraft,()=>{},recovery);assert.deepEqual(calls.map(c=>c.path),['/decorations/move'],'An already discovered receipt always uses free movement');
calls=[];const confirmed=await persistDecoration(saveOwner,{...saveDraft,z:0},()=>{},recovery);assert.equal(confirmed,purchased);assert.deepEqual(calls.map(c=>c.path),['/decorations/purchase','/me'],'Matching authoritative receipt positions need no second write');
await assert.rejects(persistDecoration(saveOwner,saveDraft,()=>{},async <T>()=>{throw lostResponse;}),error=>error===lostResponse,'A failed refresh retains the original save failure');
await assert.rejects(persistDecoration(saveOwner,saveDraft,()=>{},async <T>(path:string)=>{if(path==='/me')return {building:{...purchased,decorations:JSON.stringify([{...receipt,kind:'bench'}])}} as T;throw lostResponse;}),error=>error===lostResponse,'A receipt for a different item is never treated as success');
const failedMove=new Error('Move was not saved');calls=[];
await assert.rejects(persistDecoration(purchased,{...saveDraft,id:receipt.id},()=>{},async <T>(path:string)=>{calls.push({path});if(path==='/me')return {building:purchased} as T;throw failedMove;}),error=>error===failedMove);
assert.deepEqual(calls.map(c=>c.path),['/decorations/move','/me'],'Failed owned moves retain their error rather than creating a second write');
console.log('Decoration save recovery checks passed: lost responses, changed positions, receipt reuse, authoritative confirmation, failed refreshes, and failed owned moves.');

for(const previous of [receipt,{...receipt,x:null,z:null},{...receipt,x:saveDraft.x,z:saveDraft.z,rotation:2}]){
 const replayed={...purchased,decorations:JSON.stringify([previous])};calls=[];
 const result=await persistDecoration(saveOwner,saveDraft,()=>{},async <T>(path:string,data?:unknown)=>{calls.push({path,data});return {building:path==='/decorations/purchase'?replayed:placed} as T;});
 assert.equal(result,placed);assert.deepEqual(calls.map(c=>c.path),['/decorations/purchase','/decorations/move'],'Successful receipt replays at a moved, stored, or rotated position finish with a free move');
}
for(const changed of [{...receipt,id:'another-item'},{...receipt,kind:'bench'}]){
 calls=[];await assert.rejects(persistDecoration(saveOwner,saveDraft,()=>{},async <T>(path:string)=>{calls.push({path});return {building:{...purchased,decorations:JSON.stringify([changed])}} as T;}),/not confirmed/);
 assert.deepEqual(calls.map(c=>c.path),['/decorations/purchase'],'A different item cannot confirm this purchase or trigger a move');
}
await assert.rejects(persistDecoration(saveOwner,saveDraft,()=>{},async <T>()=>({building:{...placed,id:'other-owner'}} as T)),/not confirmed/,'Another owner cannot confirm a placement');
for(const lost of [false,true]){
 calls=[];await assert.rejects(persistDecoration(saveOwner,saveDraft,()=>{},async <T>(path:string)=>{calls.push({path});if(lost&&path==='/decorations/purchase')throw lostResponse;return {building:purchased} as T;}),/not confirmed/,'A free move must confirm the requested spot too');
 assert.deepEqual(calls.map(c=>c.path),lost?['/decorations/purchase','/me','/decorations/move']:['/decorations/purchase','/decorations/move'],'Mismatched responses never cause an unbounded retry');
}
await assert.rejects(persistDecoration(purchased,{...saveDraft,id:receipt.id},()=>{},async <T>()=>({building:purchased} as T)),/not confirmed/,'Owned move responses must confirm the requested position');
console.log('Receipt response checks passed: moved/stored/rotated HTTP 200 replays, item and owner identity, recovered move confirmation, and bounded writes.');
