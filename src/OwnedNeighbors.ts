import * as THREE from 'three';
import type { Building } from '../shared/types';
import { placedDecorations } from '../shared/decorations';
import { plotPosition } from '../shared/world';
import { neighborModel } from './NeighborModel';
import { NeighborRoutes, type NeighborDestination } from './neighborRoutes';
import { NeighborPlanner } from './NeighborPlanner';
import type { StreetPoint } from './streetNavigation';

type Person={id:string;ownerId:string;home:StreetPoint;rotation:number;group:THREE.Group;legs:THREE.Group[];arms:THREE.Group[];seed:number;wait:number;trip:number;visits:number;route:StreetPoint[];step:number;goal:NeighborDestination|null;returnRoute:StreetPoint[];stride:number;failed:Set<string>;planning:boolean;modeled:boolean;};
const seedFor=(id:string)=>{let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0)/4294967296;};
const distance=(a:StreetPoint,b:StreetPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Purchased characters have persistent homes and temporary, collision-checked shopping trips. */
export class OwnedNeighbors {
  readonly group=new THREE.Group();
  shadowsDirty=false;
  nextUpdate=Infinity;
  constructor(private invalidate=()=>{}){}
  private people=new Map<string,Person>();
  private routes:NeighborRoutes|null=null;
  private planner:NeighborPlanner|null=null;
  private revision=0;
  private key='';
  private active:Person[]=[];
  private selectAfter=0;
  private selectionCenter={x:Infinity,z:Infinity};
  private geometry=new THREE.BoxGeometry(1,1,1);
  private shadow=new THREE.CircleGeometry(.14,12).rotateX(-Math.PI/2);
  private shadowMaterial=new THREE.MeshBasicMaterial({color:'#304935',transparent:true,opacity:.19,depthWrite:false});
  private materials=new Map<string,THREE.MeshStandardMaterial>();
  private box=(group:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{
    let material=this.materials.get(color);if(!material){material=new THREE.MeshStandardMaterial({color,roughness:1});this.materials.set(color,material);}
    const mesh=new THREE.Mesh(this.geometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  rebuild(buildings:Building[]){
    const key=buildings.map(b=>[b.id,b.x,b.z,b.level,b.segments,b.style,b.decorations].join(':')).sort().join('|');if(this.key===key)return;this.key=key;this.shadowsDirty=true;this.selectAfter=0;this.revision++;
    const hasPeople=buildings.some(b=>placedDecorations(b).some(item=>item.kind==='person'));
    if(!hasPeople){this.routes=null;this.group.clear();this.people.clear();this.active=[];this.planner?.dispose();this.planner=null;return;}
    this.routes=new NeighborRoutes(buildings);this.planner??=new NeighborPlanner();this.planner.reset(buildings);const keep=new Set<string>();
    for(const building of buildings)for(const item of placedDecorations(building).filter(item=>item.kind==='person')){
      keep.add(item.id);const origin=plotPosition(building.x,building.z),home={x:origin.x+item.x,z:origin.z+item.z};let person=this.people.get(item.id);
      if(!person){
        const group=new THREE.Group(),seed=seedFor(item.id);
        group.userData={owner:building.id,decoration:item.id,neighbor:true};
        group.position.set(home.x,.115,home.z);group.rotation.y=item.rotation*Math.PI/2;
        person={id:item.id,ownerId:building.id,home,rotation:item.rotation,group,legs:[],arms:[],planning:false,modeled:false,seed,wait:.5+seed,trip:0,visits:0,route:[],step:0,goal:null,returnRoute:[],stride:0,failed:new Set()};this.people.set(item.id,person);
      }else{
        const moved=distance(home,person.home)>.001||item.rotation!==person.rotation;
        if(moved||!this.routes.clear(person.group.position))person.group.position.set(home.x,.115,home.z);
        person.planning=false;person.home=home;person.rotation=item.rotation;person.route=[];person.goal=null;person.returnRoute=[];person.failed.clear();person.wait=.3+person.seed*.4;
      }
      person.group.userData.home={...home};person.group.userData.visits=person.visits;
    }
    for(const [id,person] of this.people)if(!keep.has(id)){this.group.remove(person.group);person.group.clear();this.people.delete(id);}
    const center=Number.isFinite(this.selectionCenter.x)?this.selectionCenter:{x:0,z:0};this.selectActive(center);
  }
  private selectActive(center:StreetPoint){
    const distanceSquared=(p:Person)=>(p.group.position.x-center.x)**2+(p.group.position.z-center.z)**2;
    this.active=[...this.people.values()].filter(p=>distanceSquared(p)<65**2).sort((a,b)=>distanceSquared(a)-distanceSquared(b)).slice(0,96);
    const active=new Set(this.active);
    for(const person of this.people.values())if(!active.has(person)){
      if(person.group.parent){person.group.removeFromParent();person.group.clear();person.legs=[];person.arms=[];person.modeled=false;this.shadowsDirty=true;}
      person.group.visible=false;
    }
    for(const person of this.active)if(person.group.parent!==this.group)this.group.add(person.group);
    this.selectionCenter={...center};this.selectAfter=.25;this.buildModels();
  }
  private buildModels(){
    let built=0;
    for(const person of this.active)if(!person.modeled){
      const limbs=neighborModel(person.group,this.box,person.ownerId,['#c99978','#7e9b8a','#788da7','#bdac78'][Math.floor(person.seed*4)]);person.legs=limbs.legs;person.arms=limbs.arms;person.modeled=true;
      person.group.traverse(object=>{if(object instanceof THREE.Mesh){object.userData.owner=person.ownerId;object.userData.decoration=person.id;}});
      const shadow=new THREE.Mesh(this.shadow,this.shadowMaterial);shadow.position.y=.002;shadow.userData.noPick=true;person.group.add(shadow);this.shadowsDirty=true;
      if(++built>=8)break;
    }
  }

  private plan(person:Person){
    const nav=this.routes!;
    if(person.goal?.kind==='shop'||person.goal?.kind==='stroll'){
      const home:NeighborDestination={id:`home:${person.id}`,point:person.home,face:person.home,label:'Heading home',kind:'home'};
      const route=person.returnRoute.length&&distance(person.returnRoute.at(-1)!,person.home)<.03?person.returnRoute:nav.path(person.group.position,person.home);
      if(route){person.goal=home;person.route=route;person.step=1;person.returnRoute=[];return;}
    }
    const nearby=nav.shops.filter(shop=>distance(shop.point,person.home)<32&&!person.failed.has(shop.id)).sort((a,b)=>Number(Boolean(b.purchased))-Number(Boolean(a.purchased))||distance(a.point,person.home)-distance(b.point,person.home));
    const preferred=nearby.filter(shop=>shop.purchased),choices=preferred.length?preferred:nearby;
    const ordered=choices.length?[...choices.slice(person.trip%Math.min(4,choices.length)),...choices.slice(0,person.trip%Math.min(4,choices.length))]:[];
    const strolls=nav.strolls.filter(goal=>distance(goal.point,person.home)>2&&distance(goal.point,person.home)<8).sort((a,b)=>distance(a.point,person.home)-distance(b.point,person.home));
    if(this.planner?.available){
      const goals=[...ordered.slice(0,6),...strolls.slice(person.trip%Math.max(1,Math.min(5,strolls.length))).slice(0,5)],revision=this.revision;
      person.planning=true;
      this.planner.request(person.group.position,goals.map(g=>({id:g.id,point:g.point})),result=>{
        person.planning=false;this.invalidate();
        if(revision!==this.revision||!person.group.visible||!this.people.has(person.id))return;
        const goal=result?goals.find(g=>g.id===result.goalId):null;
        if(result&&goal){person.goal=goal;person.route=result.route;person.step=1;person.returnRoute=[...result.route].reverse().map(p=>({...p}));person.trip++;}
        else person.wait=8;
      });return;
    }
    for(const goal of ordered.slice(0,6)){

      const route=nav.path(person.group.position,goal.point);
      if(route){person.goal=goal;person.route=route;person.step=1;person.returnRoute=[...route].reverse().map(p=>({...p}));person.trip++;return;}
      person.failed.add(goal.id);
    }

    for(const goal of strolls.slice(person.trip%Math.max(1,Math.min(5,strolls.length))).slice(0,5)){
      const route=nav.path(person.group.position,goal.point);if(route){person.goal=goal;person.route=route;person.step=1;person.returnRoute=[...route].reverse().map(p=>({...p}));person.trip++;return;}
    }
    person.wait=8;person.route=[];
  }
  update(seconds:number,center:StreetPoint,heldId?:string,editingId?:string){
    this.nextUpdate=Infinity;if(!this.routes)return false;
    this.selectAfter-=seconds;
    if(this.selectAfter<=0||distance(center,this.selectionCenter)>2)this.selectActive(center);
    this.buildModels();
    let planned=false,moving=false;
    for(const person of this.active){

      const group=person.group,wasVisible=group.visible;group.visible=distance(group.position,center)<65&&person.id!==heldId&&person.id!==editingId;
      if(group.visible!==wasVisible)this.shadowsDirty=true;
      if(!group.visible)continue;
      person.wait=Math.max(0,person.wait-seconds);
      if(!person.route.length&&!person.wait&&!person.planning&&!this.planner?.busy&&!planned){this.plan(person);planned=true;}
      let remaining=Math.min(seconds,.25)*(.52+person.seed*.16),travelled=0;
      while(person.route.length&&remaining>0){
        const target=person.route[person.step],d=distance(group.position,target),step=Math.min(d,remaining);
        if(d>.0001){const dx=(target.x-group.position.x)/d,dz=(target.z-group.position.z)/d;group.position.x+=dx*step;group.position.z+=dz*step;group.rotation.y=Math.atan2(-dx,-dz);}
        remaining-=step;travelled+=step;
        if(d<=step+.0001){person.step++;if(person.step>=person.route.length){
          person.route=[];person.step=0;person.wait=person.goal?.kind==='shop'?4+person.seed*3:2+person.seed*2;
          if(person.goal?.kind==='shop'){person.visits++;group.userData.visits=person.visits;const face=person.goal.face;group.rotation.y=Math.atan2(group.position.x-face.x,group.position.z-face.z);}
          else if(person.goal?.kind==='home')group.rotation.y=person.rotation*Math.PI/2;
          break;
        }}
      }
      if(travelled||person.legs.some(leg=>leg.rotation.x!==0)||person.arms.some(arm=>arm.rotation.x!==0))this.shadowsDirty=true;
      person.stride+=travelled;const swing=travelled?Math.sin(person.stride*20)*.38:0;
      person.legs.forEach((leg,i)=>leg.rotation.x=swing*(i?1:-1));person.arms.forEach((arm,i)=>arm.rotation.x=swing*(i?-1:1));
      if(person.route.length||!person.modeled)moving=true;
      else if(person.wait>0)this.nextUpdate=Math.min(this.nextUpdate,person.wait);
      group.userData.activity=person.route.length?'walking':person.goal?.kind==='shop'?'visiting':'resting';group.userData.destination=person.goal?.label||'Home';group.userData.destinationId=person.goal?.id||null;

    }
    return moving;
  }
  dispose(){this.planner?.dispose();this.group.clear();this.people.clear();this.geometry.dispose();this.shadow.dispose();this.shadowMaterial.dispose();this.materials.forEach(m=>m.dispose());}
}
