import * as THREE from 'three';
import { CYBERPUNK_CROWN_HEIGHTS } from '../shared/progression';

type Point={x:number;z:number};
type CrownTools={
  box:(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>THREE.Mesh;
  prism:(outline:Point[],bottom:number,height:number,color:string)=>void;
  mat:(color:string)=>THREE.MeshStandardMaterial;
  group:THREE.Group;owner:string;
};
const steel='#292a3b',armor='#4b465e',violet='#c06aff',white='#effcff',darkGlass='#49346b';

/** Ten distinct roof silhouettes: machinery becomes a connected vertical city. */
export function cyberpunkCrown(tier:number,outline:Point[],y:number,tools:CrownTools,detailed:boolean){
  const {box,prism,group,mat,owner}=tools;
  const center={x:outline.reduce((sum,p)=>sum+p.x,0)/outline.length,z:outline.reduce((sum,p)=>sum+p.z,0)/outline.length};
  const w=Math.max(...outline.map(p=>p.x))-Math.min(...outline.map(p=>p.x));
  const d=Math.max(...outline.map(p=>p.z))-Math.min(...outline.map(p=>p.z));
  const scale=(factor:number)=>outline.map(p=>({x:center.x+(p.x-center.x)*factor,z:center.z+(p.z-center.z)*factor}));
  const cuboid=(dx:number,dy:number,dz:number,width:number,height:number,depth:number,color:string)=>box(center.x+dx,y+dy,center.z+dz,width,height,depth,color);
  const beam=(a:Point,b:Point,height:number,thickness:number,color:string)=>{
    const length=Math.hypot(b.x-a.x,b.z-a.z);
    const mesh=box((a.x+b.x)/2,height,(a.z+b.z)/2,length,thickness,thickness,color);mesh.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);return mesh;
  };
  const rim=(factor:number,height:number,color:string,thickness=.045)=>{
    const points=scale(factor);points.forEach((p,i)=>beam(p,points[(i+1)%points.length],y+height,thickness,color));
  };
  const mast=(dx:number,dz:number,height:number)=>{
    cuboid(dx,height/2,dz,.07,height,.07,armor);
    cuboid(dx,height-.04,dz,.09,.08,.09,white);
  };
  const vent=(dx:number,dz:number,width:number,height:number)=>{
    cuboid(dx,.12+height/2,dz,width,height,width*.7,armor);
    if(detailed)for(let i=0;i<3;i++)cuboid(dx,.14+height*(i+1)/4,dz+width*.36,width*.8,.025,.025,steel);
  };
  const blade=(dx:number,dz:number,height:number,width:number)=>{
    cuboid(dx,.16+height/2,dz,width,height,.12,steel);
    cuboid(dx-width/2,.16+height/2,dz+.065,.035,height,.025,white);
    cuboid(dx+width/2,.16+height/2,dz+.065,.035,height,.025,violet);
    cuboid(dx,.16+height*.7,dz+.07,width*.48,height*.45,.025,darkGlass);
  };
  prism(scale(.98),y,.12,steel);rim(.96,.14,violet);
  // 1: a tiny inhabitable relay shed, floating awning and white threshold.
  if(tier===0){
    cuboid(-w*.16,.27,0,w*.42,.30,d*.5,armor);
    cuboid(-w*.16,.46,0,w*.52,.08,d*.62,steel);
    cuboid(-w*.16,.43,d*.32,w*.46,.025,.025,white);
    vent(w*.25,-d*.18,Math.min(.22,w*.2),.22);mast(w*.27,d*.16,.62);
    return;
  }
  // 2: sloping photovoltaic canopy over exposed rooftop machinery.
  if(tier===1){
    const canopy=cuboid(-w*.12,.49,0,w*.65,.065,d*.7,darkGlass);canopy.rotation.z=.16;
    for(const sign of [-1,1])cuboid(-w*.12+sign*w*.26,.28,0,.045,.32,d*.58,steel);
    rim(.80,.17,white);vent(w*.29,-d*.16,.24,.3);mast(w*.26,d*.24,.93);
    if(detailed)for(let i=0;i<4;i++)cuboid(-w*.36+i*w*.15,.53,0,.025,.025,d*.62,violet);
    return;
  }
  // 3: stacked cantilever decks and a visible horizontal communications dish.
  if(tier===2){
    cuboid(-w*.08,.42,-d*.1,w*.48,.6,d*.46,steel);
    cuboid(-w*.08,.76,-d*.1,w*.74,.09,d*.62,armor);
    cuboid(-w*.08,.82,d*.22,w*.72,.035,.035,white);
    blade(w*.27,d*.16,.95,.18);mast(-w*.25,-d*.21,1.32);
    const dish=new THREE.Mesh(new THREE.CylinderGeometry(.22,.12,.05,8),mat(darkGlass));dish.position.set(center.x-w*.08,y+1.02,center.z-d*.1);dish.rotation.z=.3;dish.userData.owner=owner;group.add(dish);
    return;
  }
  // 4: an open gate crown, with an inset luminous portal rather than a gable.
  if(tier===3){
    const gateW=w*.55,gateH=1.25;
    for(const sign of [-1,1]){cuboid(sign*gateW/2,.15+gateH/2,0,.15,gateH,d*.35,steel);cuboid(sign*(gateW/2-.06),.15+gateH/2,d*.18,.025,gateH,.03,white);}
    cuboid(0,1.46,0,gateW+.2,.18,d*.42,armor);cuboid(0,1.39,d*.22,gateW,.035,.03,violet);
    vent(-w*.27,-d*.28,.22,.4);mast(w*.3,-d*.2,1.8);return;
  }
  // 5: three asymmetric vertical blades around a recessed rooftop atrium.
  if(tier===4){
    prism(scale(.48),y+.12,.55,darkGlass);rim(.55,.72,white);
    blade(-w*.28,-d*.20,2.28,.22);blade(w*.26,-d*.18,1.78,.20);blade(w*.20,d*.24,1.15,.18);
    cuboid(0,.85,0,w*.72,.065,.13,armor);return;
  }
  // 6: a suspended double-ring beacon held up by four mechanical pylons.
  if(tier===5){
    for(const p of scale(.62)){box(p.x,y+1.28,p.z,.13,2.3,.13,steel);box(p.x,y+1.30,p.z+.07,.025,2.2,.025,white);}
    rim(.72,1.55,violet,.075);rim(.72,2.42,white,.055);
    prism(scale(.38),y+.15,.7,darkGlass);blade(-w*.15,0,3.22,.24);blade(w*.15,0,2.7,.20);return;
  }
  // 7–10 grow the same open-frame beacon as tier 6. The silhouette remains
  // a pair of blades inside suspended polygon rings, rather than separate towers.
  const height=CYBERPUNK_CROWN_HEIGHTS[tier],frameHeight=height*.76;
  const frame=scale(.62),ribWidth=Math.min(.22,.13+(tier-5)*.018);
  for(const p of frame){
    box(p.x,y+.16+frameHeight/2,p.z,ribWidth,frameHeight,ribWidth,steel);
    box(p.x,y+.18+frameHeight/2,p.z+ribWidth*.55,.028,frameHeight*.96,.03,white);
    if(detailed){
      for(const fraction of [.32,.68]){
        box(p.x,y+height*fraction,p.z,ribWidth*1.6,.14,ribWidth*1.6,armor);
        box(p.x,y+height*fraction+.08,p.z+ribWidth*.82,ribWidth*.8,.025,.03,violet);
      }
    }
  }
  prism(scale(.38),y+.15,height*.20,darkGlass);
  rim(.42,height*.22,white,.045);
  // The two familiar rings remain visible at every stage.
  rim(.72,height*.43,violet,.09);
  rim(.72,height*.75,white,.065);
  // Tier 8 adds a third tier of suspended structure; tier 9 splits the upper
  // halo into two nested crowns, and tier 10 adds a smaller elevated beacon.
  if(tier>=7)rim(.78,height*.27,white,.065);
  if(tier>=8){
    rim(.53,height*.61,violet,.065);
    for(let i=0;i<frame.length;i++){
      const p=frame[i],q={x:center.x+(p.x-center.x)*.53/.62,z:center.z+(p.z-center.z)*.53/.62};
      beam(p,q,y+height*.61,.095,armor);
    }
  }
  if(tier===9){
    rim(.42,height*.87,white,.055);
    for(const p of scale(.42)){
      box(p.x,y+height*.805,p.z,.07,height*.13,.07,armor);
      box(p.x,y+height*.87,p.z,.10,.055,.10,violet);
    }
  }
  // Unequal luminous blades preserve tier 6's central composition. Width and
  // depth scale with the roof so the crown reads as machinery, not antennae.
  const bladeWidth=Math.max(.18,Math.min(.38,w*.16));
  blade(-w*.15,0,height-.20,bladeWidth);
  blade(w*.15,0,height*.82-.20,bladeWidth*.85);
  if(tier>=8)blade(0,-d*.20,height*.64-.20,bladeWidth*.72);
  // Broad cross-members make the rings feel carried by the mechanical frame.
  if(tier>=7){
    const points=scale(.62),a=points[0],b=points[Math.floor(points.length/2)];
    beam(a,b,y+height*.43,.12,armor);
    beam({x:a.x,z:a.z+.065},{x:b.x,z:b.z+.065},y+height*.43+.07,.025,white);
  }
}
