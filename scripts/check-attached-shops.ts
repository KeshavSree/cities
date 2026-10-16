import assert from 'node:assert/strict';
import { demoPurchasePlan } from '../worker/demoPurchases';
import type { Building } from '../shared/types';
import { baseShopSlots, shopAttachment } from '../shared/shopAttachments';
import { placementError, placedDecorations, suggestedDecorationPosition, decorationFootprint } from '../shared/decorations';
import { streetPlacement } from '../src/streetPlacement';
import { NeighborRoutes } from '../src/neighborRoutes';
import { OwnedNeighbors } from '../src/OwnedNeighbors';
import { plotPosition } from '../shared/world';
const resident=(x=0,z=0,level=16):Building=>({id:'owner',username:'owner',name:'Owner',bio:'',avatar:null,github_url:null,website:null,school:null,is_demo:1,x,z,level,xp:0,bricks:900,segments:'[]',likes:0,style:'terrace',color:'sand',commits:0,prs:0,reviews:0,synced_at:null,updated_at:'',decorations:'[]'});
assert.equal(baseShopSlots(resident(0,0,1)).length,0,'Shacks have no usable storefront walls');
let covered=0;
for(const [x,z] of [[0,0],[2,2],[-4,-3],[9,-9],[5,-3],[-8,1]])for(const level of [4,10,16,22,30]){
 const building=resident(x,z,level),slots=baseShopSlots(building).filter(slot=>!placementError(building,'base_shop',slot));
 for(const slot of slots){assert(shopAttachment(building,slot));assert.equal(decorationFootprint(building,'base_shop',slot).length,4);covered++;}
 if(!slots.length)continue;
 const slot=slots[0];building.decorations=JSON.stringify([{id:'bought-shop',kind:'base_shop',x:slot.x,z:slot.z,rotation:slot.rotation}]);
 assert.equal(placedDecorations(building).length,1,'A purchased attachment is rendered');
 assert.equal(placementError(building,'base_shop',slot),'Leave some space between decorations.','One slot cannot be sold twice');
 assert.equal(placementError(building,'base_shop',slot,'bought-shop'),null,'Moving an existing shop may keep its own slot');
 assert(placementError(building,'base_shop',{x:0,z:0,rotation:0}),'Cannot place shops inside the tower');
 assert(placementError(building,'base_shop',{x:slot.x+.2,z:slot.z,rotation:slot.rotation}),'Cannot detach a storefront into a yard');
 assert(placementError(building,'base_shop',{...slot,rotation:(slot.rotation+1)%4}),'The wall sets the shop orientation');
 const origin=plotPosition(x,z),eye={x:origin.x+slot.x+slot.normal.x*.9,y:.76,z:origin.z+slot.z+slot.normal.z*.9};
 const draft={kind:'base_shop' as const,x:null,z:null,rotation:0,requestId:'test-attachment'};
 const preview=streetPlacement({...building,decorations:'[]'},draft,eye,{x:-slot.normal.x,y:-.1,z:-slot.normal.z});
 assert.equal(preview.error,null,'A shop snaps to a clear wall within reach');assert(shopAttachment(building,preview));
 assert(streetPlacement(building,draft,{x:1000,y:.76,z:1000},{x:0,y:0,z:-1}).error,'Cannot remotely attach to your property');
}
assert(covered>100,'Cover many real facade slots, including irregular plots');
const owner=resident(),slot=suggestedDecorationPosition(owner,'base_shop');assert(slot,'A skyscraper has a purchasable shop slot');
assert.equal(new NeighborRoutes([owner]).shops.length,0,'An unpurchased skyscraper has no imaginary free shops');
owner.decorations=JSON.stringify([{id:'attached-shop',kind:'base_shop',x:slot.x,z:slot.z,rotation:slot.rotation}]);
const home=suggestedDecorationPosition(owner,'person');assert(home);owner.decorations=JSON.stringify([...JSON.parse(owner.decorations),{id:'shopper',kind:'person',...home}]);
const nav=new NeighborRoutes([owner]);assert.equal(nav.shops.length,1,'Only the bought, placed shop is a destination');assert.equal(nav.shops[0].id,'attached-shop');
assert(nav.path(home,nav.shops[0].point),'A purchased person can walk to the attached shop');
const life=new OwnedNeighbors();life.rebuild([owner]);const person=life.group.children[0];let visited=false,returned=false;
for(let i=0;i<1800;i++){life.update(.1,{x:0,z:0});assert(nav.clear(person.position),'Walkers stay outside tower foundations');if(person.userData.visits>0){visited=true;if(person.userData.activity==='resting'&&Math.hypot(person.position.x-home.x,person.position.z-home.z)<.03)returned=true;}}
assert(visited&&returned,'Purchased people visit the attached shop and return home');life.dispose();
const stored={...owner,decorations:JSON.stringify([{id:'attached-shop',kind:'base_shop',x:null,z:null,rotation:slot.rotation}])};assert.equal(new NeighborRoutes([stored]).shops.length,0,'Stored shops are not destinations');
const demoPlots=[[1,0,21],[0,1,30],[-1,1,18],[1,-1,24]];
const demos=demoPlots.map(([x,z,level],i)=>({...resident(x,z,level),id:`demo-fixture-${i}`}));
for(const b of demos){const purchases=demoPurchasePlan(b,demos);assert.equal(purchases.length,5,'Every example owner gets the complete set');b.decorations=JSON.stringify(purchases);}
const demoLife=new OwnedNeighbors();demoLife.rebuild(demos);const demoNav=new NeighborRoutes(demos);
for(let i=0;i<2400;i++){demoLife.update(.1,{x:0,z:0});for(const p of demoLife.group.children)assert(demoNav.clear(p.position),'Demo purchases leave clear walking paths');}
assert(demoLife.group.children.every(p=>p.userData.visits>0),'Every seeded person can leave home and visit a shop');demoLife.dispose();
console.log(`Attached-shop checks passed: ${covered} facade slots, valid ownership geometry, no free shops, purchase footprints, first-person snapping, shop visits and returning home.`);
