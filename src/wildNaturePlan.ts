import type { Building } from '../shared/types';
import { coastZ, worldHash } from '../shared/world';
import { plotPlan } from '../shared/plots';
import { PUBLIC_PROJECTS } from '../shared/projects';
import { neighborhoodDensity, streetNetwork, roadWidth, roadShoulder, type GroundPoint } from './neighborhood';

export const WILD_LAKE={x:-98,z:-126,radiusX:25,radiusZ:18};
export interface WildPlant extends GroundPoint { kind:'broadleaf'|'pine'|'bush';height:number;radius:number;tint:number;angle:number; }
interface Exclusion { polygon:GroundPoint[];margin:number; }
const BUCKET=14;
function segmentDistance(p:GroundPoint,a:GroundPoint,b:GroundPoint){
  const dx=b.x-a.x,dz=b.z-a.z,square=dx*dx+dz*dz;
  const t=square?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/square)):0;
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
function inside(p:GroundPoint,polygon:GroundPoint[]){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)result=!result;
  }
  return result;
}

/** Natural growth belongs to undeveloped land, never to purchased/private items. */
export class WildNaturePlan {
  private buckets=new Map<string,Exclusion[]>();
  constructor(buildings:Building[]){
    const reserve=(polygon:GroundPoint[],margin=0)=>{
      const item={polygon,margin},padding=margin+1.6;
      const minX=Math.floor((Math.min(...polygon.map(p=>p.x))-padding)/BUCKET),maxX=Math.floor((Math.max(...polygon.map(p=>p.x))+padding)/BUCKET);
      const minZ=Math.floor((Math.min(...polygon.map(p=>p.z))-padding)/BUCKET),maxZ=Math.floor((Math.max(...polygon.map(p=>p.z))+padding)/BUCKET);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
        const key=`${x},${z}`;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key)!.push(item);
      }
    };
    for(const b of buildings){const plan=plotPlan(b.x,b.z);reserve(plan.corners,.15);}
    for(const project of PUBLIC_PROJECTS)for(let x=project.minX;x<=project.maxX;x++)for(let z=project.minZ;z<=project.maxZ;z++){
      const plan=plotPlan(x,z);reserve(plan.corners,.15);
    }
    const {roads,junctions}=streetNetwork(buildings,neighborhoodDensity(buildings));
    for(const road of roads.values()){
      const density=Math.max(...road.densities);reserve(road.points,roadWidth(density)/2+roadShoulder(density)+.2);
    }
    for(const node of junctions.values())reserve([node.position],roadWidth(node.density)/2+roadShoulder(node.density)+.3);
  }
  clear(point:GroundPoint,radius:number){
    // Keep the beach and the irregular lake's entire bank free of canopy.
    if(point.z+radius+2.5>Math.min(coastZ(point.x-radius),coastZ(point.x+radius)))return false;
    if(Math.hypot((point.x-WILD_LAKE.x)/(WILD_LAKE.radiusX*1.2+radius),(point.z-WILD_LAKE.z)/(WILD_LAKE.radiusZ*1.2+radius))<1)return false;
    return !(this.buckets.get(`${Math.floor(point.x/BUCKET)},${Math.floor(point.z/BUCKET)}`)||[]).some(({polygon,margin})=>
      polygon.length>=3&&inside(point,polygon)||polygon.some((a,i)=>segmentDistance(point,a,polygon[(i+1)%polygon.length])<radius+margin));
  }
  plants(minX:number,maxX:number,minZ:number,maxZ:number):WildPlant[]{
    const plants:WildPlant[]=[],spacing=3.4;
    for(let ix=Math.floor(minX/spacing);ix<=Math.ceil(maxX/spacing);ix++)for(let iz=Math.floor(minZ/spacing);iz<=Math.ceil(maxZ/spacing);iz++){
      const x=(ix+.15+worldHash(ix+17,iz)*.7)*spacing,z=(iz+.15+worldHash(ix,iz+53)*.7)*spacing;
      if(x<minX||x>=maxX||z<minZ||z>=maxZ)continue;
      // Broad swathes of forest, small sunny clearings and scattered undergrowth.
      const density=.65+.17*Math.sin(x/17+Math.sin(z/23))+.12*Math.cos(z/13-x/29);
      const seed=worldHash(ix+137,iz-59);if(seed>density)continue;
      const kind=worldHash(ix-91,iz+36)<.17?'bush':worldHash(ix+5,iz+83)<.4?'pine':'broadleaf';
      const height=kind==='bush'?.4+worldHash(ix+52,iz)*.55:1.9+worldHash(ix+52,iz)*2.4;
      const radius=kind==='bush'?height*.8:kind==='pine'?height*.27:.7+worldHash(ix,iz-67)*.7;
      const plant:WildPlant={x,z,kind,height,radius,tint:worldHash(ix+18,iz+78),angle:worldHash(ix-32,iz+10)*Math.PI*2};
      if(this.clear(plant,radius))plants.push(plant);
    }
    return plants;
  }
}
