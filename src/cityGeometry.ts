import * as THREE from 'three';
import { COLORS, type Building, type PublicProject } from '../shared/types';
import { coastZ, plotPosition, PLOT_SPACING } from '../shared/world';
import { buildParkLandscape } from './ParkLandscape';
import { buildPlazaLandscape } from './PlazaLandscape';
import { neighborhoodDensity, streetNetwork, streetDensity, roadWidth, roadShoulder, roadColor, shoulderColor, lotPolygon, projectPolygon, mixGroundColor, SETTLEMENT_THRESHOLDS, type GroundPoint } from './neighborhood';
import { buildingForm } from './buildingForm';
import { cyberpunkCrown } from './CyberpunkCrown';
import { clearRoadSurface, inRoadObstacle, roadObstacles } from './roadClearance';
import { plotPlan } from '../shared/plots';
import type { BuildingTheme } from '../shared/progression';
import { shopAttachment } from '../shared/shopAttachments';
import { placedDecorations } from '../shared/decorations';
import { decorationModel } from './DecorationModels';
import { windowIsLit } from './windowOccupancy';
import { batchCityMeshes, type BatchMaterials } from './meshBatching';
import { SpatialIndex, pointBounds } from './SpatialIndex';
const LOW_DETAIL_MIN_COMPONENT_VOLUME=.02;
const LOW_DETAIL_MIN_CROSS_SECTION=.12;
const LOW_DETAIL_LARGE_SLAB_VOLUME=.18;
export const CITY_CHUNK=PLOT_SPACING*8;
export const cityChunk=(p:GroundPoint)=>`${Math.floor(p.x/CITY_CHUNK)},${Math.floor(p.z/CITY_CHUNK)}`;
export function cityBuildContext(buildings:Building[]){
  const densityAt=neighborhoodDensity(buildings),network=streetNetwork(buildings,densityAt),obstacles=roadObstacles(buildings,densityAt),obstacleIndex=new SpatialIndex<GroundPoint[]>(CITY_CHUNK);
  for(const polygon of obstacles)obstacleIndex.insert(polygon,pointBounds(polygon));
  return {...network,densityAt,obstacles,obstacleIndex};
}
export type CityBuildContext=ReturnType<typeof cityBuildContext>;
export interface CityBuildOptions {materials?:BatchMaterials;context?:CityBuildContext;layer?:'streets'|'building'|'decoration'|'project';id?:string;chunk?:string;}

export function buildCity(group: THREE.Group, buildings: Building[], night: boolean,lightsOn:boolean,densityAt:(x:number,z:number)=>number,projects:PublicProject[],detail:0|1|2,options:CityBuildOptions={}) {
  const materials = new Map<string,THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({
      color,flatShading:true,roughness:1,
      emissive:(lightsOn||color==='#effcff'||color==='#c06aff')&&['#f3d795','#f3c982','#edcf91','#f0daab','#90d9d8','#bcb0e9','#a4d0ad','#99cfe4','#c06aff','#bb68f2','#ad6de8','#effcff'].includes(color)?color:'#000000',emissiveIntensity:color==='#effcff'?(lightsOn?1.1:.35):color==='#c06aff'?(lightsOn?.85:.25):.55,
    }));
    return materials.get(color)!;
  };
  const cube=new THREE.BoxGeometry(1,1,1);cube.computeBoundingBox();
  const box = (parent: THREE.Group, x:number,y:number,z:number,w:number,h:number,d:number,color:string,owner?:string) => {
    const mesh = new THREE.Mesh(cube,mat(color)); mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
    mesh.castShadow = h>.3&&Math.min(w,d)>.075; mesh.receiveShadow = true;
    if (owner) mesh.userData.owner = owner; parent.add(mesh); return mesh;
  };
  const themeVisuals:Record<BuildingTheme,{wall:string;trim:string;metal:string;windowDay:string;windowNight:string;ground:string}>={
    contemporary:{wall:'#e3e2d7',trim:'#e3e2d7',metal:'#708a89',windowDay:'#627e8a',windowNight:'#f3d795',ground:'#c7cbb9'},
    earthen:{wall:'#bd8562',trim:'#e0b789',metal:'#755f52',windowDay:'#584f48',windowNight:'#f3c982',ground:'#c79c72'},
    deco:{wall:'#d8d0bd',trim:'#c5a76a',metal:'#506166',windowDay:'#405b66',windowNight:'#f0daab',ground:'#c7c5ba'},
    metabolism:{wall:'#e2e5df',trim:'#c7d0ca',metal:'#647e80',windowDay:'#5d7e86',windowNight:'#90d9d8',ground:'#b8c5c2'},
    cyberpunk:{wall:'#252335',trim:'#746391',metal:'#312c49',windowDay:'#af65ed',windowNight:'#c06aff',ground:'#5f586f'},
    nocturne:{wall:'#575563',trim:'#777084',metal:'#4b4d5b',windowDay:'#514d68',windowNight:'#bcb0e9',ground:'#777580'},
  };
  const prism=(parent:THREE.Group,points:GroundPoint[],bottom:number,height:number,color:string,owner:string)=>{
    const vertices:number[]=[],top=bottom+height;
    const vertex=(p:GroundPoint,y:number)=>vertices.push(p.x,y,p.z);
    for(let i=1;i<points.length-1;i++){
      vertex(points[0],top);vertex(points[i+1],top);vertex(points[i],top);
      vertex(points[0],bottom);vertex(points[i],bottom);vertex(points[i+1],bottom);
    }
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      vertex(a,bottom);vertex(b,top);vertex(b,bottom);
      vertex(a,bottom);vertex(a,top);vertex(b,top);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    // Match the box mesh attributes so podiums and upper walls can share a batch.
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.owner=owner;parent.add(mesh);
  };
  const context=options.context??cityBuildContext(buildings),{roads,junctions}=context;
  let obstacles=context.obstacles;
  const drawStreets=!options.layer||options.layer==='streets';
  const selectedRoads=drawStreets?[...roads.values()].filter(r=>!options.chunk||cityChunk({x:(r.points[0].x+r.points[1].x)/2,z:(r.points[0].z+r.points[1].z)/2})===options.chunk):[];
  const selectedNodes=drawStreets?[...junctions.values()].filter(n=>!options.chunk||cityChunk(n.position)===options.chunk):[];
  const selectObstacles=(points:GroundPoint[],padding=2)=>{obstacles=[...context.obstacleIndex.query(pointBounds(points,padding))];};
  const drawItem=(b:Building,item:ReturnType<typeof placedDecorations>[number],parent:THREE.Group,local:boolean)=>{
    const attachment=item.kind==='base_shop'?shopAttachment(b,item):null,origin=plotPosition(b.x,b.z),decoration=new THREE.Group();
    decoration.position.set(item.x+(local?0:origin.x),attachment?.y??.115,item.z+(local?0:origin.z));decoration.rotation.y=attachment?.angle??item.rotation*Math.PI/2;parent.add(decoration);
    decorationModel(decoration,item.kind,lightsOn,box,mat,b.id);
    decoration.traverse(object=>{if(object instanceof THREE.Mesh||object.userData.streetLamp){object.userData.decoration=item.id;object.userData.owner=b.id;}});
  };
  if(options.layer==='decoration')for(const b of buildings)for(const item of placedDecorations(b))if(item.kind!=='person'&&item.id===options.id)drawItem(b,item,group,false);

  const surface=(parent:THREE.Group,points:GroundPoint[],height:number,color:string,concave=false)=>{
    if(points.length<3)return;
    const vertices:number[]=[];
    if(concave){
      const triangles=THREE.ShapeUtils.triangulateShape(points.map(p=>new THREE.Vector2(p.x,p.z)),[]);
      for(const [i,j,k] of triangles){
        const a=points[i],b=points[j],c=points[k],area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
        for(const point of area>0?[a,c,b]:[a,b,c])vertices.push(point.x,height,point.z);
      }
    }else for(let i=1;i<points.length-1;i++)for(const point of [points[0],points[i+1],points[i]])vertices.push(point.x,height,point.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat(color));mesh.receiveShadow=true;parent.add(mesh);
  };
  const strip=(a:GroundPoint,b:GroundPoint,startWidth:number,endWidth:number,height:number,color:string)=>{
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    const polygon=[{x:a.x+nx*startWidth/2,z:a.z+nz*startWidth/2},{x:a.x-nx*startWidth/2,z:a.z-nz*startWidth/2},
      {x:b.x-nx*endWidth/2,z:b.z-nz*endWidth/2},{x:b.x+nx*endWidth/2,z:b.z+nz*endWidth/2}];
    for(const piece of clearRoadSurface(polygon,obstacles))surface(group,piece,height,color);
  };
  for(const road of selectedRoads){
    if(road.kind!=='street')continue;
    selectObstacles(road.points);
    const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2},density=streetDensity(road,.5),width=roadWidth(density);
    // Taper toward the shared junction width; each small polygon has one solid color.
    for(let i=0;i<8;i++){
      const start=i/8,end=(i+1)/8,d0=streetDensity(road,start),d1=streetDensity(road,end),dm=streetDensity(road,(start+end)/2);
      const p={x:a.x+dx*start,z:a.z+dz*start},q={x:a.x+dx*end,z:a.z+dz*end};
      strip(p,q,roadWidth(d0)+roadShoulder(d0),roadWidth(d1)+roadShoulder(d1),.055,shoulderColor(dm));
      strip(p,q,roadWidth(d0),roadWidth(d1),.078,roadColor(dm));
      if(detail===0){
        // Separate raised pavement ribbons leave the carriageway open. The
        // same obstacle clipping used by roads keeps narrow passages intact.
        const nx=-dz/length,nz=dx/length;
        for(const sign of [-1,1]){
          const inner0=roadWidth(d0)/2,inner1=roadWidth(d1)/2;
          const outer0=inner0+roadShoulder(d0)/2,outer1=inner1+roadShoulder(d1)/2;
          const ribbon=[
            {x:p.x+nx*inner0*sign,z:p.z+nz*inner0*sign},
            {x:q.x+nx*inner1*sign,z:q.z+nz*inner1*sign},
            {x:q.x+nx*outer1*sign,z:q.z+nz*outer1*sign},
            {x:p.x+nx*outer0*sign,z:p.z+nz*outer0*sign},
          ];
          if(sign<0)ribbon.reverse();
          for(const piece of clearRoadSurface(ribbon,obstacles))prism(group,piece,.055,.055,shoulderColor(dm),'');
        }
      }
    }

  }
  if(detail===0){
    // Crossings, lane markings and utility covers give the road a readable scale.
    for(const road of selectedRoads){
      if(road.kind!=='street')continue;
      selectObstacles(road.points);
      const [a,b]=road.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
      for(const t of [.08,.92]){
        const width=roadWidth(streetDensity(road,t));
        if(width<.65||length<3)continue;
        for(let i=-2;i<=2;i++){
          const point={x:a.x+dx*t-dz/length*i*width/6,z:a.z+dz*t+dx/length*i*width/6};
          if(inRoadObstacle(point,obstacles,.08))continue;
          const stripe=box(group,point.x,.082,point.z,.28,.004,width/10,'#e6e1cb');stripe.rotation.y=angle;
        }
      }
      if(length>3){
        const x=a.x+dx*.53,z=a.z+dz*.53;
        if(!inRoadObstacle({x,z},obstacles,.12)){
          const cover=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.008,12),mat('#687c72'));cover.position.set(x,.084,z);group.add(cover);
          for(const i of [-1,0,1])box(group,x+i*.04,.09,z,.012,.004,.13,'#435d50');
        }
      }
    }
  }
  for(const {position,density,turnRadius=0,cap:drawCap} of selectedNodes){
    selectObstacles([position],turnRadius+3);
    if(drawCap===false)continue;
    const cap=(radius:number,height:number,color:string)=>{
      const polygon=Array.from({length:12},(_,i)=>({
      x:position.x+Math.cos(i/12*Math.PI*2)*radius,z:position.z+Math.sin(i/12*Math.PI*2)*radius,
      }));
      for(const piece of clearRoadSurface(polygon,obstacles))surface(group,piece,height,color);
    };
    cap(turnRadius+(roadWidth(density)+roadShoulder(density))/2+.035,.0555,shoulderColor(density));
    cap(turnRadius+roadWidth(density)/2+.025,.079,roadColor(density));
  }
  obstacles=context.obstacles;
  for(const b of buildings.filter(b=>!options.layer||options.layer==='building'&&b.id===options.id)){
    const plan=plotPlan(b.x,b.z),plot=new THREE.Group(),position=plan.position;
    const density=densityAt(b.x,b.z),form=buildingForm(b,density),{kind,footprint,foundationHeight,baseY}=form;
    plot.position.set(position.x,0,position.z);group.add(plot);
    const color=COLORS[b.color]?.hex || COLORS.sand.hex; const h=form.height;
    const groundTheme=form.segments[0].theme,crownTheme=form.segments[form.segments.length-1].theme,groundVisual=themeVisuals[groundTheme];
    const urban=Math.min(1,density/SETTLEMENT_THRESHOLDS.urban),coastal=Math.max(0,1-(coastZ(position.x)-position.z)/15);
    const grass=mixGroundColor(night?'#637e6c':'#bfd2ae',night?'#969078':'#d4c39a',coastal*.45);
    const basePaving=b.style==='modern'?'#cbd2ce':b.style==='terrace'?'#d4d1bf':'#ccc7bc';
    const paving=mixGroundColor(basePaving,groundVisual.ground,groundTheme==='contemporary'?0:.52);
    const tierGround=mixGroundColor(form.definition.groundColor,groundVisual.ground,groundTheme==='contemporary'?0:.38);
    const lotColor=mixGroundColor(grass,tierGround,form.definition.paving);
    const lot=lotPolygon(b,roads).map(p=>({x:p.x-position.x,z:p.z-position.z}));
    surface(plot,lot,.085,lotColor);
    const architecture=new THREE.Group();architecture.rotation.y=plan.rotation;plot.add(architecture);
    if(!options.layer)for(const item of placedDecorations(b).filter(item=>item.kind!=='person'))drawItem(b,item,plot,true);
    // Rotate the rectangular building independently of its irregular ground lot.
    const soilStone=mixGroundColor(form.definition.stone,paving,urban*.2);
    const foundationColor=mixGroundColor(soilStone,groundVisual.wall,groundTheme==='contemporary'?(b.style==='modern'?.12:.07):.28);
    const padding=form.foundationPadding;
    const localOutline=(outline:GroundPoint[])=>outline.map(p=>{
      const x=p.x-position.x,z=p.z-position.z,c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);
      return {x:x*c-z*s,z:x*s+z*c};
    });
    const podium=form.podium?localOutline(form.podium):null;
    if(form.podiumFoundation){
      const outline=form.podiumFoundation.map(p=>({x:p.x-position.x,z:p.z-position.z})),band=form.tier>=6?.07:0;
      if(band)prism(plot,outline,.085,band,['#90d9d8','#bcb0e9','#a4d0ad','#99cfe4','#c06aff','#bb68f2','#ad6de8','#effcff'][form.tier-6],b.id);
      prism(plot,outline,.085+band,foundationHeight-band,foundationColor,b.id);
    }
    else box(architecture,0,.085+foundationHeight/2,0,footprint.w+padding*2,foundationHeight,footprint.d+padding*2,foundationColor,b.id);
    const parts=form.sections.map(section=>({...section,polygon:localOutline(section.outline),cap:localOutline(section.cornice)}));
    const concrete='#e3e2d7',timber='#b39a78';
    // Early models use punched windows in substantial walls. Glazing grows
    // with the building's overall tier, including when glass details are chosen.
    const glazing=[
      {bay:1.15,width:.26,height:.30,ratio:.38},
      {bay:1.10,width:.30,height:.34,ratio:.43},
      {bay:.98,width:.34,height:.40,ratio:.50},
      {bay:.90,width:.38,height:.46,ratio:.56},
      {bay:.78,width:.43,height:.53,ratio:.64},
      {bay:.70,width:.46,height:.59,ratio:.69},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
      {bay:.62,width:.46,height:.62,ratio:.73},
    ][form.tier];
    const edgeBeam=(a:GroundPoint,end:GroundPoint,y:number,width:number,height:number,color:string,inset=0)=>{
      const dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz);
      const mesh=box(architecture,(a.x+end.x)/2-dz/length*inset,y,(a.z+end.z)/2+dx/length*inset,length,height,width,color,b.id);
      mesh.rotation.y=-Math.atan2(dz,dx);return mesh;
    };
    for(const p of parts){
      const design=form.segments[p.segment],visual=themeVisuals[design.theme];
      const bodyMix=design.theme==='contemporary'?(form.tier>=3?.35:.08):design.theme==='cyberpunk'?.94:design.theme==='nocturne'?.72:.58;
      const bodyColor=mixGroundColor(COLORS[design.color].hex,visual.wall,bodyMix);
      const darkGlass=mixGroundColor(visual.windowDay,'#182431',.68);
      const roomColor=(edge:number,floor:number,u:number,bay:number,start:number)=>!lightsOn?visual.windowDay:windowIsLit(b.id,p.segment,edge,floor,Math.round((start+u)/bay))?visual.windowNight:darkGlass;
      const loggiaHeight=p.loggia?Math.min(.42,p.h*.18):0;
      const center={x:p.polygon.reduce((sum,v)=>sum+v.x,0)/p.polygon.length,z:p.polygon.reduce((sum,v)=>sum+v.z,0)/p.polygon.length};
      if(p.loggia){
        const recessed=p.polygon.map(v=>({x:center.x+(v.x-center.x)*.80,z:center.z+(v.z-center.z)*.80}));
        prism(architecture,recessed,p.y,loggiaHeight,'#617f80',b.id);
        // Slender perimeter columns make the shared garden floor legible and carry the rooms above.
        for(const v of p.polygon){
          const x=center.x+(v.x-center.x)*.93,z=center.z+(v.z-center.z)*.93;
          box(architecture,x,p.y+loggiaHeight/2,z,.10,loggiaHeight,.10,visual.trim,b.id);
        }
        prism(architecture,p.polygon,p.y+loggiaHeight,.09,visual.trim,b.id);
      }
      prism(architecture,p.polygon,p.y+loggiaHeight,p.h-loggiaHeight,bodyColor,b.id);
      const usable=p.h-loggiaHeight,floors=Math.max(1,Math.floor(usable/.78)),floorHeight=usable/floors;
      if(design.theme==='nocturne')for(const v of p.polygon)box(architecture,v.x,p.y+loggiaHeight+usable/2,v.z,.13,usable+.08,.13,visual.trim,b.id);
      for(let edge=0;edge<p.polygon.length;edge++){
        const a=p.polygon[edge],end=p.polygon[(edge+1)%p.polygon.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
        if(length<.14)continue;
        // Anchor the facade bays to a building-wide datum so adjacent tiers
        // share mullion lines even when one end of the wall steps back.
        const tx=dx/length,tz=dz/length,start=a.x*tx+a.z*tz,bay=glazing.bay;
        const bays:number[]=[];
        for(let u=Math.ceil((start+.19)/bay)*bay;u<start+length-.19;u+=bay)bays.push(u-start);
        if(design.theme==='cyberpunk'){
          const orient=(u:number,y:number,width:number,height:number,depth:number,offset:number,color:string)=>{
            const mesh=box(architecture,a.x+tx*u+nx*offset,y,a.z+tz*u+nz*offset,width,height,depth,color,b.id);
            mesh.rotation.y=-Math.atan2(dz,dx);return mesh;
          };
          const mid=p.y+loggiaHeight+usable/2;
          for(let i=0;i<bays.length;i++){
            const u=bays[i],ww=Math.min(glazing.width*(form.tier<3?.92:.82),length*.28);
            // Glass sits behind projecting armor cheeks; the reveal remains
            // dark while violet mullions stitch the floors into a single bay.
            orient(u,mid,ww+.17,usable*.96,.07,.045,'#141724');
            for(let floor=0;floor<floors;floor++)orient(u,p.y+loggiaHeight+floorHeight*(floor+.5),ww,floorHeight*.88,.055,.085,roomColor(edge,floor,u,bay,start));
            for(const sign of [-1,1])orient(u+sign*(ww/2+.06),mid,.075,usable,.16,.12,'#494358');
            if(i%3===0)orient(u-ww/2-.06,mid,.026,usable*.8,.025,.208,'#effcff');
            if(detail===0&&form.tier>=3&&i%2===1){
              const podHeight=Math.min(.65,usable*.28),podY=p.y+loggiaHeight+usable*(.30+(p.segment%2)*.35);
              orient(u,podY,ww+.15,podHeight,.30,.23,'#363749');
              orient(u,podY+podHeight/2,ww+.20,.055,.34,.23,'#665a79');
              orient(u,podY,ww*.6,podHeight*.56,.025,.395,roomColor(edge,Math.min(floors-1,Math.floor((podY-p.y-loggiaHeight)/floorHeight)),u,bay,start));
              orient(u,podY+podHeight/2+.03,ww*.65,.025,.025,.41,'#effcff');
            }
          }
          // Larger mechanical end bays make the skin visibly asymmetric.
          if(form.tier>=4&&edge%2===0&&length>1.2){
            orient(length*.18,mid,.19,usable*.76,.26,.19,'#39384d');
            orient(length*.18+.10,mid,.025,usable*.68,.025,.33,'#effcff');
            if(detail===0)for(let i=0;i<3;i++)orient(length*.18,p.y+loggiaHeight+usable*(.25+i*.22),.26,.10,.30,.19,'#62556f');
          }
          edgeBeam(a,end,p.y+p.h-.04,.14,.075,'#343246',-.10);
          if(edge%2===0)edgeBeam(a,end,p.y+p.h+.015,.025,.025,'#effcff',-.17);
          continue;
        }
        for(let i=0;i<floors;i++){
          const heightFactor={contemporary:1,earthen:.78,deco:1.12,metabolism:.92,nocturne:1.34,cyberpunk:1.5}[design.theme];
          const widthFactor={contemporary:1,earthen:.74,deco:.84,metabolism:.92,nocturne:.56,cyberpunk:.65}[design.theme];
          const y=p.y+loggiaHeight+floorHeight*(i+.5),windowHeight=Math.min(glazing.height*heightFactor,floorHeight*Math.min(.86,glazing.ratio*heightFactor));
          for(const u of bays){
            const x=a.x+tx*u,z=a.z+tz*u;
            if(p.segment===0&&i===0&&nz>.9&&Math.abs(x)<.55)continue;
            const ww=Math.min(length*.35,glazing.width*widthFactor*(design.style==='glass'?(form.tier<4?1.12:1.20):1));
            if(design.theme==='earthen'){
              const recess=box(architecture,x+nx*.018,y,z+nz*.018,ww+.12,windowHeight+.12,.045,'#725b4e',b.id);recess.rotation.y=-Math.atan2(dz,dx);
            }else if(design.theme==='metabolism'&&(i+Math.round(u/bay)+edge)%3===0){
              const pod=box(architecture,x+nx*.11,y,z+nz*.11,ww+.22,Math.min(floorHeight*.82,windowHeight+.20),.22,visual.trim,b.id);pod.rotation.y=-Math.atan2(dz,dx);
            }
            const window=box(architecture,x+nx*.024,y,z+nz*.024,ww,windowHeight,.04,roomColor(edge,i,u,bay,start),b.id);window.rotation.y=-Math.atan2(dz,dx);
            if(form.tier>=5||design.style==='glass'&&form.tier>=3){
              const mullion=box(architecture,x+tx*ww/2+nx*.05,y,z+tz*ww/2+nz*.05,.035,windowHeight+.04,.055,visual.metal,b.id);mullion.rotation.y=window.rotation.y;
            }
          }
          if(form.tier>=3){
            // Recessed glazing, a continuous sill, and a quiet slab edge read as inhabited floors.
            edgeBeam(a,end,p.y+loggiaHeight+floorHeight*i+.08,.08,.055,visual.trim,-.025);
          }
          if(design.style==='balcony'&&length>1.2){
            const insetA={x:a.x+dx*.13,z:a.z+dz*.13},insetB={x:end.x-dx*.13,z:end.z-dz*.13};
            edgeBeam(insetA,insetB,y-windowHeight/2-.05,.28,.065,visual.trim,-.14);
            edgeBeam(insetA,insetB,y-windowHeight/2+.17,.035,.19,visual.metal,-.26);
          }
        }
        // A narrow timber bay gives each volume a warm end and a shared material language.
        if(design.theme==='contemporary'&&form.tier>=3&&edge===0&&length>1.1)for(let strip=0;strip<3;strip++){
          const u=.15+strip*.10,x=a.x+tx*u,z=a.z+tz*u;
          const slat=box(architecture,x+nx*.052,p.y+loggiaHeight+usable/2,z+nz*.052,.045,usable-.12,.07,timber,b.id);slat.rotation.y=-Math.atan2(dz,dx);
        }
        if(design.theme==='deco'&&length>.9)for(const t of [.18,.82]){
          const x=a.x+dx*t,z=a.z+dz*t;
          const rib=box(architecture,x+nx*.055,p.y+loggiaHeight+usable/2,z+nz*.055,.055,usable+.08,.075,visual.trim,b.id);rib.rotation.y=-Math.atan2(dz,dx);
        }
        if(design.theme==='metabolism'&&edge===0&&length>1){
          const x=a.x+tx*.13,z=a.z+tz*.13;
          const service=box(architecture,x+nx*.075,p.y+loggiaHeight+usable/2,z+nz*.075,.12,usable+.04,.12,visual.metal,b.id);service.rotation.y=-Math.atan2(dz,dx);
        }
      }
      // Only meaningful setbacks get a projecting roof slab. Flush tiers join visually.
      if(p.terrace)prism(architecture,p.cap,p.y+p.h+.004,.065,visual.trim,b.id);
      const above=parts[p.segment+1]?.polygon,roofY=p.y+p.h+.07;
      const fitsRoof=(x:number,z:number,margin=.17)=>{
        const inside=p.polygon.every((a,i)=>{const end=p.polygon[(i+1)%p.polygon.length];return ((end.x-a.x)*(z-a.z)-(end.z-a.z)*(x-a.x))/Math.hypot(end.x-a.x,end.z-a.z)>margin;});
        return inside&&!(above&&inRoadObstacle({x,z},[above],margin+.08));
      };
      if(p.terrace&&design.theme==='cyberpunk'){
        for(let edge=0;edge<p.polygon.length;edge++){
          const a=p.polygon[edge],end=p.polygon[(edge+1)%p.polygon.length];
          edgeBeam(a,end,roofY+.04,.06,.035,edge%2?'#c06aff':'#effcff',-.025);
          if(detail===0){
            const x=center.x+(a.x-center.x)*.76,z=center.z+(a.z-center.z)*.76;
            if(fitsRoof(x,z,.20)){
              box(architecture,x,roofY+.17,z,.28,.28,.24,'#434052',b.id);
              box(architecture,x,roofY+.32,z,.34,.035,.29,'#effcff',b.id);
            }
          }
        }
      }else if(p.terrace&&form.tier>=3&&design.theme==='contemporary'){
        for(let edge=0;edge<p.polygon.length;edge++){
          const a=p.polygon[edge],end=p.polygon[(edge+1)%p.polygon.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
          const steps=Math.max(1,Math.floor(length/.6));
          for(let i=0;i<steps;i++){
            const t=(i+.5)/steps,x=a.x+dx*t+nx*.29,z=a.z+dz*t+nz*.29;
            if(!fitsRoof(x,z,.19))continue;
            const railA={x:a.x+dx*i/steps+nx*.065,z:a.z+dz*i/steps+nz*.065},railB={x:a.x+dx*(i+1)/steps+nx*.065,z:a.z+dz*(i+1)/steps+nz*.065};
            edgeBeam(railA,railB,roofY+.37,.03,.035,visual.metal);
            box(architecture,railA.x,roofY+.20,railA.z,.035,.35,.035,visual.metal,b.id);
          }
        }
      }else if(p.terrace&&form.tier>=3&&design.theme==='earthen'){
        for(let edge=0;edge<p.polygon.length;edge++)edgeBeam(p.polygon[edge],p.polygon[(edge+1)%p.polygon.length],roofY+.15,.13,.22,visual.trim,-.03);
      }else if(p.terrace&&form.tier>=3&&design.theme==='metabolism'&&fitsRoof(center.x,center.z,.3)){
        box(architecture,center.x,roofY+.18,center.z,.62,.28,.46,visual.metal,b.id);
      }
    }
    const top=parts[parts.length-1],roofY=baseY+h;
    const topCenter={x:top.polygon.reduce((sum,p)=>sum+p.x,0)/top.polygon.length,z:top.polygon.reduce((sum,p)=>sum+p.z,0)/top.polygon.length};
    const roofW=Math.max(...top.polygon.map(p=>p.x))-Math.min(...top.polygon.map(p=>p.x)),roofD=Math.max(...top.polygon.map(p=>p.z))-Math.min(...top.polygon.map(p=>p.z));
    const crownVisual=themeVisuals[crownTheme],crownLight=lightsOn?crownVisual.windowNight:crownVisual.windowDay;
    const cone=(x:number,y:number,z:number,height:number,radius:number,color:string)=>{
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(radius,height,4),mat(color));mesh.geometry.rotateY(Math.PI/4);mesh.position.set(x,y,z);mesh.userData.owner=b.id;mesh.castShadow=true;architecture.add(mesh);return mesh;
    };
    if(crownTheme==='cyberpunk'){
      cyberpunkCrown(form.tier,top.polygon,roofY,{
        box:(x,y,z,w,h,d,color)=>box(architecture,x,y,z,w,h,d,color,b.id),
        prism:(outline,bottom,height,color)=>{prism(architecture,outline,bottom,height,color,b.id);},
        mat,group:architecture,owner:b.id,
      },detail===0);
    }else if(crownTheme==='earthen'){
      box(architecture,topCenter.x,roofY+.07,topCenter.z,roofW+.12,.14,roofD+.12,crownVisual.trim,b.id);
      for(const side of [-1,1]){
        box(architecture,topCenter.x+side*roofW*.45,roofY+.25,topCenter.z,.13,.36,roofD*.82,crownVisual.wall,b.id);
        box(architecture,topCenter.x,roofY+.25,topCenter.z+side*roofD*.45,roofW*.82,.36,.13,crownVisual.wall,b.id);
      }
      box(architecture,topCenter.x,roofY+.36,topCenter.z,Math.max(.38,roofW*.28),.46,Math.max(.34,roofD*.25),crownVisual.wall,b.id);
    }else if(crownTheme==='deco'){
      box(architecture,topCenter.x,roofY+.18,topCenter.z,Math.max(.48,roofW*.62),.36,Math.max(.42,roofD*.58),crownVisual.wall,b.id);
      box(architecture,topCenter.x,roofY+.48,topCenter.z,Math.max(.32,roofW*.40),.25,Math.max(.30,roofD*.36),crownVisual.trim,b.id);
      box(architecture,topCenter.x,roofY+.88,topCenter.z,.12,.68,.12,crownLight,b.id);
    }else if(crownTheme==='metabolism'){
      box(architecture,topCenter.x,roofY+.34,topCenter.z,Math.max(.42,roofW*.34),.62,Math.max(.38,roofD*.34),crownVisual.metal,b.id);
      for(const side of [-1,1])box(architecture,topCenter.x+side*Math.max(.28,roofW*.27),roofY+.25,topCenter.z,Math.max(.28,roofW*.24),.34,Math.max(.30,roofD*.30),crownVisual.trim,b.id);
      box(architecture,topCenter.x,roofY+.86,topCenter.z,.07,.58,.07,crownLight,b.id);
    }else if(crownTheme==='nocturne'){
      const spireHeight=form.tier<3?.92:1.62;
      cone(topCenter.x,roofY+spireHeight/2+.06,topCenter.z,spireHeight,Math.max(.22,Math.min(roofW,roofD)*.32),crownVisual.wall);
      if(form.tier>=3)for(const side of [-1,1])cone(topCenter.x+side*roofW*.32,roofY+.46,topCenter.z,.82,.13,crownVisual.trim);
      box(architecture,topCenter.x,roofY+.28,topCenter.z+Math.min(.2,roofD*.16),.09,.48,.08,crownLight,b.id);
    }else if(form.tier===0){
      const roof=box(architecture,topCenter.x,roofY+.12,topCenter.z,roofW+.16,.13,roofD+.16,'#9b8970',b.id);roof.rotation.x=.09;
      for(const sign of [-1,1])box(architecture,sign*footprint.w*.28,baseY+h/2,footprint.d/2+.03,.075,h,.055,'#b6a186',b.id);
    }else if(form.tier<=2){
      const roof=new THREE.Mesh(new THREE.ConeGeometry(1,.7,4),mat('#b98e77'));
      roof.geometry.rotateY(Math.PI/4);roof.scale.set((roofW+.1)/Math.SQRT2,1,(roofD+.1)/Math.SQRT2);
      roof.position.set(topCenter.x,roofY+.425,topCenter.z);roof.userData.owner=b.id;roof.castShadow=true;architecture.add(roof);
    }else{
      // A small inhabited pavilion finishes the composition, leaving a roof garden around it.
      const pavilion=top.polygon.map(p=>({x:topCenter.x+(p.x-topCenter.x)*.48,z:topCenter.z+(p.z-topCenter.z)*.48}));
      const pavilionHeight=b.style==='spire'?.95:.65;
      const glazedPavilion=form.tier>=5;
      prism(architecture,pavilion,roofY+.08,pavilionHeight,glazedPavilion?crownVisual.windowDay:mixGroundColor(color,concrete,.35),b.id);
      if(!glazedPavilion)for(let i=0;i<pavilion.length;i++){
        const a=pavilion[i],end=pavilion[(i+1)%pavilion.length],dx=end.x-a.x,dz=end.z-a.z,length=Math.hypot(dx,dz);
        if(length<.45)continue;
        const window=box(architecture,(a.x+end.x)/2+dz/length*.024,roofY+.08+pavilionHeight*.55,(a.z+end.z)/2-dx/length*.024,Math.min(.38,length*.40),pavilionHeight*.43,.04,crownLight,b.id);
        window.rotation.y=-Math.atan2(dz,dx);
      }
      const canopy=pavilion.map(p=>({x:topCenter.x+(p.x-topCenter.x)*1.14,z:topCenter.z+(p.z-topCenter.z)*1.14}));
      prism(architecture,canopy,roofY+.09+pavilionHeight,.09,concrete,b.id);
      for(const v of pavilion)box(architecture,v.x,roofY+.08+pavilionHeight/2,v.z,.055,pavilionHeight,.055,timber,b.id);
    }
    const front=podium?Math.max(...podium.map(p=>p.z)):footprint.d/2;
    if(groundTheme!=='cyberpunk'){
      // Fit the entrance to a real facade edge, including skewed podiums.
      const wall=parts[0].polygon;
      const edge=wall.map((a,i)=>({a,b:wall[(i+1)%wall.length]}))
        .filter(({a,b})=>b.x-a.x<-.01)
        .sort((a,b)=>(b.a.z+b.b.z)-(a.a.z+a.b.z))[0];
      if(edge){
        const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,length=Math.hypot(dx,dz);
        const entrance=new THREE.Group();entrance.position.set((edge.a.x+edge.b.x)/2,baseY,(edge.a.z+edge.b.z)/2);
        entrance.rotation.y=Math.atan2(dz,-dx);architecture.add(entrance);
        const doorH=Math.min(.8,parts[0].h*.82),doorW=Math.min(.46,length*.48);
        box(entrance,0,doorH/2,.024,doorW+.1,doorH+.07,.055,groundVisual.trim,b.id);
        box(entrance,0,doorH/2,.06,doorW,doorH,.025,'#36464b',b.id);
        box(entrance,0,doorH*.63,.078,doorW*.76,doorH*.58,.014,lightsOn?groundVisual.windowNight:groundVisual.windowDay,b.id);
        box(entrance,doorW*.32,doorH*.4,.1,.025,.11,.035,groundVisual.trim,b.id);
        box(entrance,0,doorH+.11,.13,doorW+.23,.065,.34,groundVisual.trim,b.id);
        box(entrance,0,.025,.16,doorW+.18,.05,.32,foundationColor,b.id);

      }
    }
    if(groundTheme==='cyberpunk'){
      const entranceH=Math.min(.85,h*.82),entranceW=Math.min(.72,footprint.w*.52);
      box(architecture,0,baseY+entranceH/2,front+.045,entranceW,entranceH,.065,'#141724',b.id);
      for(const sign of [-1,1])box(architecture,sign*entranceW/2,baseY+entranceH/2,front+.10,.045,entranceH,.08,'#effcff',b.id);
      box(architecture,0,baseY+entranceH,front+.18,entranceW+.16,.07,.38,'#363749',b.id);
      box(architecture,0,baseY+entranceH-.015,front+.38,entranceW+.12,.025,.025,'#c06aff',b.id);
    }
    if(kind==='rural'&&form.tier>0){
      box(architecture,0,baseY+.06,front+.35,1.25,.12,.7,foundationColor,b.id);
      box(architecture,0,baseY+.98,front+.3,1.3,.1,.7,'#ece4d5',b.id);
      for(const x of [-.55,.55])box(architecture,x,baseY+.52,front+.53,.07,.92,.07,'#c6b996',b.id);
    }
    const pathColor=mixGroundColor('#c7bc9e',paving,urban);
    const frontageRoad=roads.get(plan.frontage.key)!;
    const [a,boundary]=frontageRoad.points,dx=boundary.x-a.x,dz=boundary.z-a.z;
    const roadT=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz)));
    const frontageDensity=streetDensity(frontageRoad,roadT);
    const pathEnd=plan.frontage.distance-(roadWidth(frontageDensity)+roadShoulder(frontageDensity))/2;
    if(kind==='rural'&&pathEnd>front+.25){
      const count=Math.max(2,Math.ceil((pathEnd-front)/.45));
      for(let i=0;i<count;i++)box(architecture,0,.115,front+.18+(pathEnd-front-.3)*i/(count-1),.66,.05,.25,pathColor);
    }
    else if(pathEnd>front)box(architecture,0,.12,(front+pathEnd)/2,b.style==='modern'?1.05:.78,.07,pathEnd-front,pathColor);
    if(b.style==='spire'&&form.tier<5)box(architecture,0,baseY-.02,front+.24,.83,.06,.42,foundationColor);
    if(detail===1){
      const removed:THREE.Mesh[]=[];
      architecture.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||!object.userData.owner)return;
        if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
        const size=new THREE.Vector3();object.geometry.boundingBox?.getSize(size);size.set(Math.abs(size.x*object.scale.x),Math.abs(size.y*object.scale.y),Math.abs(size.z*object.scale.z));
        const dimensions=[size.x,size.y,size.z].sort((a,b)=>a-b),volume=size.x*size.y*size.z;
        const substantial=volume>=LOW_DETAIL_MIN_COMPONENT_VOLUME&&dimensions[1]>=LOW_DETAIL_MIN_CROSS_SECTION;
        if(!substantial&&volume<LOW_DETAIL_LARGE_SLAB_VOLUME)removed.push(object);
      });
      for(const object of removed){object.removeFromParent();if(object.geometry!==cube)object.geometry.dispose();}
    }
  }
  const residentPositions=buildings.map(b=>plotPosition(b.x,b.z));
  for(const project of projects.filter(p=>!options.layer||options.layer==='project'&&p.id===options.id)){
    const center=plotPosition(project.x,project.z),ratio=project.funded/project.goal;
    const boundary=projectPolygon(project.id,roads).map(p=>({x:p.x-center.x,z:p.z-center.z}));
    if(boundary.length<3)continue;
    const site=new THREE.Group();site.position.set(center.x,0,center.z);group.add(site);
    surface(site,boundary,.085,project.kind==='park'?'#afc69d':'#c6ccc1',true);
    // Choose an entrance on the road side nearest the residents, then connect inward.
    const midpoints=boundary.map((a,i)=>{const b=boundary[(i+1)%boundary.length];return {x:(a.x+b.x)/2,z:(a.z+b.z)/2};});
    const distanceToResidents=(p:GroundPoint)=>Math.min(...residentPositions.map(pos=>Math.hypot(center.x+p.x-pos.x,center.z+p.z-pos.z)));
    const entrance=midpoints.reduce((best,p)=>distanceToResidents(p)<distanceToResidents(best)?p:best);
    if(project.kind==='park'){
      buildParkLandscape(site,boundary,entrance,ratio,lightsOn,box,mat,detail===1);
      site.traverse(object=>{if(object instanceof THREE.Mesh||object.userData.streetLamp)object.userData.project=project.id;});
      continue;
    }
    buildPlazaLandscape(site,boundary,entrance,ratio,lightsOn,box,mat,detail===1);
    site.traverse(object=>{if(object instanceof THREE.Mesh||object.userData.streetLamp)object.userData.project=project.id;});
  }
  batchCityMeshes(group,options.materials);
}
function tree(parent:THREE.Group,x:number,z:number,scale:number,box:(p:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>THREE.Mesh,mat:(c:string)=>THREE.Material,base=0,simplified=false){
  box(parent,x,base+.5*scale,z,.16*scale,scale,.16*scale,'#ae9172');
  const canopy=simplified?new THREE.SphereGeometry(.78*scale,8,6):new THREE.IcosahedronGeometry(.78*scale,0);
  const leaf=new THREE.Mesh(canopy,mat('#87a875'));leaf.position.set(x,base+1.25*scale,z);leaf.scale.y=1.25;leaf.castShadow=true;parent.add(leaf);
}
