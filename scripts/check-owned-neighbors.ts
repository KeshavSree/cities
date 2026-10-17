import assert from 'node:assert/strict';
import { OwnedNeighbors } from '../src/OwnedNeighbors';
import { NeighborRoutes } from '../src/neighborRoutes';
import { localMockEnabled } from '../worker/localDev';
import type { Building } from '../shared/types';
import * as THREE from 'three';
const resident=(id:string,x=0,z=0):Building=>({id,username:id,name:id,bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x,z,level:4,xp:450,bricks:1500,segments:'[]',likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:''});
const owner=resident('owner');owner.decorations=JSON.stringify([{id:'person',kind:'person',x:2,z:0,rotation:0},{id:'shop',kind:'storefront',x:0,z:2.1,rotation:0}]);
const nav=new NeighborRoutes([owner]);assert.equal(nav.shops.filter(s=>s.purchased).length,1,'Placed purchased shops have a clear entrance');
const route=nav.path({x:2,z:0},nav.shops[0].point);assert(route,'A neighbor can reach a shop around their building');
for(let i=1;i<route.length;i++)assert(nav.segment(route[i-1],route[i]),'Routes cannot cut corners through a building or furniture');
assert.equal(nav.path({x:0,z:0},nav.shops[0].point),null,'Reject routes starting inside a building');
const narrow={...owner,decorations:JSON.stringify([{id:'person',kind:'person',x:-.7,z:2,rotation:0},{id:'shop',kind:'storefront',x:0,z:2,rotation:0}])};const narrowNav=new NeighborRoutes([narrow]);assert(narrowNav.path({x:-.7,z:2},narrowNav.shops[0].point),'The starter neighbor can reach a shop through its narrow front garden');
const life=new OwnedNeighbors();life.rebuild([owner]);assert.equal(life.group.children.length,1,'Each placed person has exactly one walking model');
assert.equal(life.update(.01,{x:0,z:0}),false,'Resting neighbors let the renderer sleep');assert(life.nextUpdate>0&&Number.isFinite(life.nextUpdate),'Idle simulation supplies a scheduled wakeup');
const person=life.group.children[0],start=person.position.clone();let moved=false,visited=false,homeAgain=false,animated=false;
for(let i=0;i<1800;i++){
  const before=person.position.clone();life.update(.1,{x:0,z:0});
  assert(nav.clear(person.position),'Purchased neighbors stay clear of foundations, furniture, storefronts, and the coast');
  assert(person.position.distanceTo(before)<.071,'Movement stays smooth without teleporting');
  if(person.position.distanceTo(start)>1)moved=true;
  if(person.userData.visits>0){visited=true;if(person.userData.activity==='resting'&&person.position.distanceTo(start)<.03)homeAgain=true;}
  person.traverse(object=>{if(object instanceof THREE.Group&&Math.abs(object.rotation.x)>.05)animated=true;});
}
assert(moved,'Purchased people leave their home');assert(visited,'Purchased people actually arrive and pause at a storefront');assert(homeAgain,'After shopping they return to their saved home');assert(animated,'Walking animates arms and legs');
const held=person.position.clone();for(let i=0;i<20;i++)life.update(.1,{x:0,z:0},'person');assert.equal(person.visible,false,'A held person is hidden from the walking world');assert.equal(person.position.distanceTo(held),0,'Holding freezes the walking trip');life.update(.1,{x:0,z:0});assert(person.visible,'Cancelling a pickup restores the walker');
life.rebuild([{...owner,bricks:1400}]);assert.equal(person.position.distanceTo(held)<.1,true,'Balance-only updates preserve walks');
const movedHome={...owner,decorations:JSON.stringify([{id:'person',kind:'person',x:2,z:1,rotation:1},{id:'shop',kind:'storefront',x:0,z:2.1,rotation:0}])};life.rebuild([movedHome]);assert.equal(life.group.children.length,1);assert.equal(person.position.x,2);assert.equal(person.position.z,1);assert.deepEqual(person.userData.home,{x:2,z:1},'Repositioning changes the home, not ownership');
life.rebuild([{...owner,decorations:JSON.stringify([{id:'person',kind:'person',x:null,z:null,rotation:0}])}]);assert.equal(life.group.children.length,0,'Stored people do not walk or leave phantom models');life.dispose();
const strollOwner=resident('stroller');strollOwner.decorations=JSON.stringify([{id:'stroller',kind:'person',x:2,z:0,rotation:0}]);const stroll=new OwnedNeighbors();stroll.rebuild([strollOwner]);const first=stroll.group.children[0].position.clone();let strolling=false;for(let i=0;i<500;i++){stroll.update(.1,{x:0,z:0});if(stroll.group.children[0].position.distanceTo(first)>1)strolling=true;}assert(strolling,'People take real walks even before any shops are built');stroll.dispose();
for(const host of ['localhost','127.0.0.1','[::1]'])assert(localMockEnabled('true',host));
for(const mode of [undefined,'false'])assert(!localMockEnabled(mode,'localhost'),'Mock identity requires explicit local dev mode');
for(const host of ['devcities.dev','example.com','localhost.example.com'])assert(!localMockEnabled('true',host),'Public hosts cannot receive automatic mock ownership');
console.log('Owned-neighbor checks passed: clear shopping routes, animated walks, shop visits, returning home, pickup freeze, relocation, storage, no-shop strolls, and local-only mock ownership.');

const blockedOwner={...resident('blocked'),decorations:JSON.stringify([{id:'blocked-one',kind:'person',x:2,z:0,rotation:0},{id:'blocked-two',kind:'person',x:2,z:.5,rotation:0}])};
const blockedLife=new OwnedNeighbors();blockedLife.rebuild([blockedOwner]);
(blockedLife as any).routes.path=()=>null;
for(const person of (blockedLife as any).people.values())person.wait=0;
assert.equal(blockedLife.update(.01,{x:0,z:0}),true,'Without a worker, ready neighbors still need the next frame when the first path fails');
blockedLife.update(.01,{x:0,z:0});
assert([...((blockedLife as any).people.values())].every((person:any)=>person.wait>0),'Every ready neighbor gets a planning turn before the renderer sleeps');
assert.equal(blockedLife.update(.01,{x:0,z:0}),false,'The renderer sleeps again after the planning queue drains');blockedLife.dispose();
console.log('Neighbor fallback checks passed: failed paths do not strand the remaining ready neighbors.');
