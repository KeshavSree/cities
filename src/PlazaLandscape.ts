import * as THREE from 'three';
import { streetLamp } from './StreetLighting';
import type { GroundPoint } from './neighborhood';

type Box = (parent: THREE.Group, x: number, y: number, z: number, width: number, height: number, depth: number, color: string) => THREE.Mesh;
type Material = (color: string) => THREE.Material;

/** A fitted civic square with permanent details revealed at each funding milestone. */
export function buildPlazaLandscape(site:THREE.Group,boundary:GroundPoint[],entrance:GroundPoint,funded:number,night:boolean,box:Box,material:Material,simplified=false){
  const inside=(point:GroundPoint)=>{
    let result=false;
    for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){
      const a=boundary[i],b=boundary[j];
      if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)result=!result;
    }
    return result;
  };
  const distanceToSegment=(p:GroundPoint,a:GroundPoint,b:GroundPoint)=>{
    const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,length?((p.x-a.x)*dx+(p.z-a.z)*dz)/length:0));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  };
  const clearance=(p:GroundPoint)=>inside(p)?Math.min(...boundary.map((a,i)=>distanceToSegment(p,a,boundary[(i+1)%boundary.length]))):0;
  const minX=Math.min(...boundary.map(p=>p.x)),maxX=Math.max(...boundary.map(p=>p.x));
  const minZ=Math.min(...boundary.map(p=>p.z)),maxZ=Math.max(...boundary.map(p=>p.z));
  const candidates:GroundPoint[]=[];
  for(let z=minZ+.6;z<maxZ;z+=.7)for(let x=minX+.6;x<maxX;x+=.7){const p={x,z};if(clearance(p)>.35)candidates.push(p);}
  if(!candidates.length)return;
  const anchor=candidates.reduce((best,p)=>clearance(p)>clearance(best)?p:best);
  const radius=Math.min(4,Math.max(1.8,clearance(anchor)-.35));
  const heading=Math.atan2(entrance.z-anchor.z,entrance.x-anchor.x);
  const point=(x:number,z:number):GroundPoint=>({
    x:anchor.x+Math.cos(heading)*x-Math.sin(heading)*z,
    z:anchor.z+Math.sin(heading)*x+Math.cos(heading)*z,
  });
  const disc=(p:GroundPoint,size:number,y:number,color:string,sides=12)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(size,size,.045,sides),material(color));
    mesh.position.set(p.x,y,p.z);mesh.receiveShadow=true;site.add(mesh);return mesh;
  };
  const path=(a:GroundPoint,b:GroundPoint,width:number,color:string)=>{
    const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/.3));
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
      if(!inside(p))continue;
      const strip=box(site,p.x,.115,p.z,length/steps+.015,.05,width,color);strip.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
    }
  };
  path(entrance,anchor,.95,'#d6d0c0');
  const courtRadius=Math.min(2.65,radius*.72);
  disc(anchor,courtRadius,.12,'#d8d8cf',16);
  disc(anchor,courtRadius*.72,.145,'#c1cbc8',16);
  disc(anchor,courtRadius*.26,.17,'#e2ded1',12);
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,p={x:anchor.x+Math.cos(angle)*courtRadius*.7,z:anchor.z+Math.sin(angle)*courtRadius*.7};
    const inlay=box(site,p.x,.172,p.z,courtRadius*.55,.025,.075,i%2?'#a9b8b5':'#bbb0c9');inlay.rotation.y=-angle;
  }

  const planter=(p:GroundPoint,index:number,withTree:boolean)=>{
    disc(p,.72,.14,'#a8aaa0',10);disc(p,.57,.18,'#66765b',10);
    if(withTree){
      box(site,p.x,.73,p.z,.16,1.08,.16,'#8f7358');
      const geometry=simplified?new THREE.SphereGeometry(.72,8,6):new THREE.IcosahedronGeometry(.72,0);
      const leaves=new THREE.Mesh(geometry,material(index%2?'#718d5e':'#819c68'));
      leaves.position.set(p.x,1.48,p.z);leaves.scale.y=1.12;leaves.castShadow=true;site.add(leaves);
    }else{
      for(let j=0;j<5;j++){
        const angle=j*Math.PI*.4,shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(.2,0),material(j%2?'#8ea66e':'#748f60'));
        shrub.position.set(p.x+Math.cos(angle)*.3,.38,p.z+Math.sin(angle)*.3);shrub.scale.y=.7;site.add(shrub);
      }
    }
  };
  const ringPoints=Array.from({length:12},(_,i)=>{
    const angle=heading+i*Math.PI/6,r=courtRadius+1.25;
    return {x:anchor.x+Math.cos(angle)*r,z:anchor.z+Math.sin(angle)*r};
  }).filter(p=>clearance(p)>.8&&Math.hypot(p.x-entrance.x,p.z-entrance.z)>1.15);
  ringPoints.forEach((p,i)=>planter(p,i,funded>=.25&&i%2===0));
  // Carry the planting rhythm into the parcel's irregular outer wings.
  const wingPoints:GroundPoint[]=[];
  for(const p of [...candidates].sort((a,b)=>Math.hypot(b.x-anchor.x,b.z-anchor.z)-Math.hypot(a.x-anchor.x,a.z-anchor.z))){
    if(clearance(p)<.78||Math.hypot(p.x-anchor.x,p.z-anchor.z)<courtRadius+1.65||Math.hypot(p.x-entrance.x,p.z-entrance.z)<1.1)continue;
    if(ringPoints.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<1.35)||wingPoints.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<1.55))continue;
    wingPoints.push(p);
    if(wingPoints.length===10)break;
  }
  wingPoints.slice(0,3).forEach(p=>path(anchor,p,.48,'#c8c8be'));
  wingPoints.forEach((p,i)=>planter(p,i+20,funded>=.25&&i%3!==1));

  const bench=(p:GroundPoint,angle:number)=>{
    const seat=new THREE.Group();seat.position.set(p.x,0,p.z);seat.rotation.y=angle;site.add(seat);
    for(const x of [-.55,.55])box(seat,x,.28,0,.08,.32,.42,'#65736f');
    for(const z of [-.14,0,.14])box(seat,0,.45,z,1.45,.075,.1,'#a98d69');
    for(const y of [.64,.78])box(seat,0,y,.2,1.45,.08,.06,'#a98d69');
  };
  const lamp=(p:GroundPoint)=>{
    box(site,p.x,.92,p.z,.07,1.62,.07,'#667773');
    box(site,p.x,1.77,p.z,.24,.18,.24,night?'#f3d795':'#e9e1c9');
    box(site,p.x,1.89,p.z,.31,.06,.31,'#667773');
    streetLamp(site,p.x,1.66,p.z,8,6.5);
  };
  if(funded>=.5){
    for(let i=0;i<8;i+=2){
      const angle=heading+i*Math.PI/4,r=courtRadius+.42,p={x:anchor.x+Math.cos(angle)*r,z:anchor.z+Math.sin(angle)*r};
      if(clearance(p)>.8)bench(p,Math.PI/2-angle);
      const light={x:anchor.x+Math.cos(angle+Math.PI/4)*(courtRadius+.72),z:anchor.z+Math.sin(angle+Math.PI/4)*(courtRadius+.72)};
      if(clearance(light)>.35)lamp(light);
    }
    // Shared worktables make the square useful before its landmark is complete.
    for(const side of [-1,1]){
      const p=point(side*(courtRadius+1.25),-.4);
      if(clearance(p)<1.05)continue;
      const table=new THREE.Group();table.position.set(p.x,0,p.z);table.rotation.y=-heading;site.add(table);
      box(table,0,.72,0,1.55,.12,.78,'#b4936d');
      for(const x of [-.58,.58])box(table,x,.39,0,.11,.66,.58,'#66736f');
      box(table,-.35,.86,0,.34,.16,.34,side<0?'#b8917e':'#91aaa5');
      box(table,.25,.84,.08,.46,.1,.28,'#c6b278');
    }
  }

  if(funded>=.75){
    const canopy=point(0,-(courtRadius+1.55));
    if(clearance(canopy)>1.55){
      const pavilion=new THREE.Group();pavilion.position.set(canopy.x,0,canopy.z);pavilion.rotation.y=-heading;site.add(pavilion);
      for(const x of [-1.25,1.25])for(const z of [-.8,.8])box(pavilion,x,1.1,z,.12,1.95,.12,'#788681');
      for(const z of [-.8,.8])box(pavilion,0,2.08,z,2.75,.14,.14,'#788681');
      for(let i=0;i<8;i++)box(pavilion,-1.3+i*.37,2.17,0,.1,.1,1.85,i%2?'#a79bc7':'#9bb4b0');
      box(pavilion,0,.72,0,1.9,.12,.85,'#b4936d');
    }
  }

  if(funded<1){
    // Neat material pallets communicate construction without enclosing the whole parcel.
    const staging=point(-(courtRadius+1.5),1.1);
    if(clearance(staging)>.7)for(let i=0;i<Math.max(2,Math.ceil(funded*8));i++){
      const x=staging.x+(i%3)*.48,z=staging.z+Math.floor(i/3)*.42;
      box(site,x,.18,z,.4,.12,.32,'#8d765e');
      box(site,x,.34,z,.36,.2,.28,i%2?'#ad9380':'#91aaa5');
    }
  }else{
    const pedestal=disc(anchor,.92,.27,'#aebbb8',10);pedestal.castShadow=true;
    const lower=new THREE.Mesh(new THREE.DodecahedronGeometry(.72,0),material('#a79bc7'));
    lower.position.set(anchor.x,1.15,anchor.z);lower.scale.set(1,.72,1);lower.rotation.y=Math.PI/5;lower.castShadow=true;site.add(lower);
    const upper=new THREE.Mesh(new THREE.OctahedronGeometry(.62,0),material('#789f9d'));
    upper.position.set(anchor.x,2.05,anchor.z);upper.rotation.set(.35,0,.22);upper.castShadow=true;site.add(upper);
    const crown=new THREE.Mesh(new THREE.TorusGeometry(.48,.09,5,12),material(night?'#f3d795':'#c6ad72'));
    crown.position.set(anchor.x,2.58,anchor.z);crown.rotation.x=Math.PI/2;crown.castShadow=true;site.add(crown);
  }
}
