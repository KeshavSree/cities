import { plotPosition, PLOT_SPACING } from './world';

export const PUBLIC_PROJECTS=[
  {id:'riverside-commons',name:'Riverside commons',kind:'park',x:3.5,z:.5,goal:600,description:'A shared garden, trees and a gathering pavilion.',minX:3,maxX:4,minZ:0,maxZ:1},
  {id:'makers-square',name:'Makers square',kind:'plaza',x:-4.5,z:-3.5,goal:900,description:'A public plaza with a sculpture and community seating.',minX:-5,maxX:-4,minZ:-4,maxZ:-3},
] as const;
export const isReservedPlot=(x:number,z:number)=>PUBLIC_PROJECTS.some(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ);
export const PROJECT_RADIUS=PLOT_SPACING*5;
/** Counterclockwise street nodes enclosing the reserved project plots. */
export function projectBoundary(id:string){
  const zone=PUBLIC_PROJECTS.find(p=>p.id===id);if(!zone)return [] as {x:number;z:number}[];
  const nodes:{x:number;z:number}[]=[];
  for(let x=zone.minX;x<=zone.maxX;x++)nodes.push({x,z:zone.minZ});
  for(let z=zone.minZ;z<=zone.maxZ;z++)nodes.push({x:zone.maxX+1,z});
  for(let x=zone.maxX+1;x>zone.minX;x--)nodes.push({x,z:zone.maxZ+1});
  for(let z=zone.maxZ+1;z>zone.minZ;z--)nodes.push({x:zone.minX,z});
  return nodes;
}

/** Contribution range starts at the project's land boundary, not its center. */
export function projectDistance(tower:{x:number;z:number},project:{id:string;x:number;z:number}){
  const point=plotPosition(tower.x,tower.z);
  const boundary=projectBoundary(project.id).map(p=>plotPosition(p.x,p.z));
  if(boundary.length<3){const center=plotPosition(project.x,project.z);return Math.hypot(point.x-center.x,point.z-center.z);}
  let inside=false,distance=Infinity;
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length];
    if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    const dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
    const t=lengthSquared?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/lengthSquared)):0;
    distance=Math.min(distance,Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t));
  }
  return inside?0:distance;
}

export const canContributeToProject=(tower:{x:number;z:number},project:{id:string;x:number;z:number})=>projectDistance(tower,project)<=PROJECT_RADIUS;
