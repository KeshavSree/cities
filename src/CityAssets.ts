import * as THREE from 'three';
import type { Building,PublicProject } from '../shared/types';
import { plotPosition } from '../shared/world';
import { plotPlan } from '../shared/plots';
import { placedDecorations } from '../shared/decorations';
import { projectPolygon } from './neighborhood';
import { buildCity,cityBuildContext,cityChunk,type CityBuildContext,type CityBuildOptions } from './cityGeometry';
import { BatchMaterials } from './meshBatching';
import { disposeGroup } from './sceneResources';
import { pointBounds } from './SpatialIndex';
import { cityLayoutKey,buildingDesignKey } from './cityRevisions';

type Entry={key:string;revision:string;build:()=>THREE.Group;priority:number;};
type Asset={revision:string;objects:THREE.Object3D[];};


/** Independent assets survive camera pans, unchanged snapshots, purchases and financial updates. */
export class CityAssets {
  private records=new Map<string,Asset>();
  private jobs=new Map<string,Entry>();
  private materials=new BatchMaterials();
  private layoutKey='';
  private context:CityBuildContext|null=null;
  readonly stats={built:0,removed:0,reused:0,lastBuildMs:0,maxBuildMs:0,pending:0,materials:0};
  constructor(private root:THREE.Group){root.userData.assetStats=this.stats;root.userData.revision=0;}
  get pending(){return this.jobs.size>0;}
  reconcile(buildings:Building[],night:boolean,lightsOn:boolean,projects:PublicProject[],detail:0|1|2,center:{x:number;z:number}){
    const layout=cityLayoutKey(buildings);
    if(!this.context||layout!==this.layoutKey){this.layoutKey=layout;this.context=cityBuildContext(buildings);}
    const context=this.context,phase=`${night}:${lightsOn}:${detail}`,entries:Entry[]=[],origin=plotPosition(center.x,center.z);
    const priority=(p:{x:number;z:number})=>(p.x-origin.x)**2+(p.z-origin.z)**2;
    const entry=(key:string,revision:string,position:{x:number;z:number},options:CityBuildOptions,offset=0)=>entries.push({key,revision,priority:priority(position)+offset,build:()=>{
      const group=new THREE.Group();buildCity(group,buildings,night,lightsOn,context.densityAt,projects,detail,{...options,context,materials:this.materials});return group;
    }});
    const chunks=new Map<string,{roads:typeof context.roads extends Map<string,infer R>?R[]:never;nodes:typeof context.junctions extends Map<string,infer N>?N[]:never}>();
    const chunk=(key:string)=>{let value=chunks.get(key);if(!value){value={roads:[],nodes:[]};chunks.set(key,value);}return value;};
    for(const road of context.roads.values())chunk(cityChunk({x:(road.points[0].x+road.points[1].x)/2,z:(road.points[0].z+road.points[1].z)/2})).roads.push(road);
    for(const node of context.junctions.values())chunk(cityChunk(node.position)).nodes.push(node);
    for(const [key,{roads,nodes}] of chunks){
      const points=[...roads.flatMap(r=>r.points),...nodes.map(n=>n.position)],bounds=pointBounds(points,6);
      const obstacles=[...context.obstacleIndex.query(bounds)];
      const revision=JSON.stringify([detail,lightsOn,roads.map(r=>[r.key,r.densities]),nodes.map(n=>[n.key,n.density]),obstacles]);
      entry(`streets:${key}`,revision,{x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2},{layer:'streets',chunk:key},-1000);
    }
    for(const b of buildings){
      const position=plotPosition(b.x,b.z),design=buildingDesignKey(b),borders=plotPlan(b.x,b.z).roads.map(r=>context.roads.get(r.key)?.densities);
      entry(`building:${b.id}`,JSON.stringify([design,phase,context.densityAt(b.x,b.z),borders]),position,{layer:'building',id:b.id});
      for(const item of placedDecorations(b))if(item.kind!=='person')entry(`decoration:${item.id}`,JSON.stringify([design,lightsOn,item]),{x:position.x+item.x,z:position.z+item.z},{layer:'decoration',id:item.id},-20);
    }
    const residents=buildings.map(b=>[b.x,b.z]);
    for(const p of projects)entry(`project:${p.id}`,JSON.stringify([p.kind,p.x,p.z,p.funded,p.goal,phase,projectPolygon(p.id,context.roads),residents]),plotPosition(p.x,p.z),{layer:'project',id:p.id});
    const keep=new Set(entries.map(e=>e.key));
    for(const [key,asset] of this.records)if(!keep.has(key)){this.release(asset);this.records.delete(key);this.stats.removed++;}
    for(const key of this.jobs.keys())if(!keep.has(key))this.jobs.delete(key);
    for(const item of entries){
      if(this.records.get(item.key)?.revision===item.revision){this.jobs.delete(item.key);this.stats.reused++;}
      else this.jobs.set(item.key,item);
    }
    this.stats.pending=this.jobs.size;
  }
  /** At least one job makes progress; the remaining work yields to input and painting. */
  process(budgetMs=5){
    if(!this.jobs.size)return false;
    const start=performance.now(),ordered=[...this.jobs.values()].sort((a,b)=>a.priority-b.priority);let built=0;
    for(const job of ordered){
      const started=performance.now(),group=job.build(),previous=this.records.get(job.key);
      if(previous)this.release(previous);
      const objects=[...group.children];if(objects.length)this.root.add(...objects);this.records.set(job.key,{revision:job.revision,objects});this.jobs.delete(job.key);
      this.stats.lastBuildMs=performance.now()-started;this.stats.maxBuildMs=Math.max(this.stats.maxBuildMs,this.stats.lastBuildMs);this.stats.built++;built++;
      this.root.userData.revision++;
      if(built>=8||performance.now()-start>=budgetMs)break;
    }
    this.stats.pending=this.jobs.size;this.stats.materials=this.materials.size;return built>0;
  }
  private release(asset:Asset){const group=new THREE.Group();if(asset.objects.length)group.add(...asset.objects);disposeGroup(group);this.root.userData.revision++;}
  dispose(){this.jobs.clear();for(const asset of this.records.values())this.release(asset);this.records.clear();this.materials.dispose();this.root.clear();}
}
