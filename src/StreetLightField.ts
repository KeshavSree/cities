import * as THREE from 'three';

export interface LampSettings {intensity:number;distance:number;kind?:'lamp'|'window';direction?:{x:number;y:number;z:number};angle?:number;penumbra?:number;color?:string;}
const CELL_SIZE=4,MAX_CELLS=256,DATA_WIDTH=256;
export const LIGHTS_PER_CELL=8;
const PREVIEW_LIGHTS=2;
const isVisible=(source:THREE.Object3D)=>{for(let p:THREE.Object3D|null=source;p;p=p.parent)if(!p.visible)return false;return true;};
const texture=(data:Float32Array,width:number,height:number)=>{
  const result=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  result.minFilter=result.magFilter=THREE.NearestFilter;result.generateMipmaps=false;result.needsUpdate=true;return result;
};

const pars=/* glsl */`
uniform sampler2D streetLightData;
uniform sampler2D streetLightCells;
uniform vec2 streetLightOrigin;
uniform vec3 streetLightGrid;
uniform float streetLightsEnabled;
uniform float streetLightMaxHeight;
uniform int streetPreviewCount;
uniform vec4 streetPreviewData[6];
varying vec3 vStreetWorldPosition;
vec4 streetRecord(int index) {
  ivec2 size = textureSize(streetLightData, 0);
  return texelFetch(streetLightData, ivec2(index % size.x, index / size.x), 0);
}
vec3 streetContribution(vec4 positionPower, vec4 directionRange, vec4 colorCone, vec3 worldNormal) {
  vec3 delta = positionPower.xyz - vStreetWorldPosition;
  float squaredDistance = dot(delta, delta);
  float distanceToLight = sqrt(squaredDistance);
  if (positionPower.w <= 0.0 || distanceToLight >= directionRange.w) return vec3(0.0);
  vec3 toLight = delta / max(distanceToLight, 0.001);
  float cone = smoothstep(colorCone.w, mix(colorCone.w, 1.0, 0.7), dot(-toLight, directionRange.xyz));
  float cutoff = pow(clamp(1.0 - pow(distanceToLight / directionRange.w, 4.0), 0.0, 1.0), 2.0);
  return colorCone.rgb * positionPower.w * cone * cutoff * max(dot(worldNormal, toLight), 0.0) / max(squaredDistance, 0.09);
}
vec3 streetIrradiance(vec3 worldNormal) {
  vec3 light = vec3(0.0);
  if (streetLightsEnabled < 0.5 || vStreetWorldPosition.y > streetLightMaxHeight) return light;
  ivec2 cell = ivec2(floor((vStreetWorldPosition.xz - streetLightOrigin) / streetLightGrid.z));
  if (all(greaterThanEqual(cell, ivec2(0))) && all(lessThan(cell, ivec2(streetLightGrid.xy)))) {
    vec4 idsA = texelFetch(streetLightCells, ivec2(cell.x * 2, cell.y), 0);
    vec4 idsB = texelFetch(streetLightCells, ivec2(cell.x * 2 + 1, cell.y), 0);
    for (int i = 0; i < 8; i++) {
      float encoded = i < 4 ? idsA[i] : idsB[i - 4];
      if (encoded < 0.5) continue;
      int offset = (int(encoded) - 1) * 3;
      light += streetContribution(streetRecord(offset), streetRecord(offset + 1), streetRecord(offset + 2), worldNormal);
    }
  }
  for (int i = 0; i < 2; i++) {
    if (i >= streetPreviewCount) break;
    light += streetContribution(streetPreviewData[i * 3], streetPreviewData[i * 3 + 1], streetPreviewData[i * 3 + 2], worldNormal);
  }
  return light;
}
`;

/** A camera-independent light list per world cell, shared by every receiving material.
 * Eight local sources per surface bounds fragment work; no per-lamp draws or shadow passes.
 * Static uploads happen on item/layout edits, never on camera movement.
 */
export class StreetLightField {
  private data=new Float32Array(DATA_WIDTH*4);
  private dataTexture=texture(this.data,DATA_WIDTH,1);
  private cellTexture=texture(new Float32Array(8),2,1);
  private sources:THREE.Object3D[]=[];
  private visible:boolean[]=[];
  private staticMaxHeight=0;
  private materials=new WeakSet<THREE.MeshStandardMaterial>();
  private previewValues=new Float32Array(PREVIEW_LIGHTS*12);
  private preview=Array.from({length:PREVIEW_LIGHTS*3},()=>new THREE.Vector4());
  private position=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  private direction=new THREE.Vector3();
  private color=new THREE.Color();
  readonly stats={sources:0,cells:0,overflowCells:0,uploads:0,materials:0,maxLightsPerCell:LIGHTS_PER_CELL};
  readonly uniforms={streetLightData:{value:this.dataTexture},streetLightCells:{value:this.cellTexture},streetLightOrigin:{value:new THREE.Vector2()},streetLightGrid:{value:new THREE.Vector3(1,1,CELL_SIZE)},streetLightsEnabled:{value:0},streetLightMaxHeight:{value:0},streetPreviewCount:{value:0},streetPreviewData:{value:this.preview}};

  private record(source:THREE.Object3D,target:Float32Array,offset:number){
    const settings=source.userData.streetLamp as LampSettings;
    source.getWorldPosition(this.position);source.getWorldQuaternion(this.rotation);
    const d=settings.direction??{x:0,y:-1,z:0};this.direction.set(d.x,d.y,d.z).normalize().applyQuaternion(this.rotation);this.color.set(settings.color??'#ffd598');
    target.set([this.position.x,this.position.y,this.position.z,isVisible(source)?settings.intensity:0,this.direction.x,this.direction.y,this.direction.z,settings.distance,this.color.r,this.color.g,this.color.b,Math.cos(settings.angle??1.27)],offset);
  }
  setSources(sources:THREE.Object3D[]){
    this.sources=sources;this.visible=sources.map(isVisible);
    const height=Math.max(1,Math.ceil(sources.length*3/DATA_WIDTH));
    this.data=new Float32Array(DATA_WIDTH*height*4);
    sources.forEach((source,i)=>this.record(source,this.data,i*12));
    this.dataTexture.dispose();this.dataTexture=texture(this.data,DATA_WIDTH,height);this.uniforms.streetLightData.value=this.dataTexture;
    this.staticMaxHeight=sources.reduce((height,_,i)=>Math.max(height,this.data[i*12+1]+this.data[i*12+7]),0);
    let minX=0,minZ=0,maxX=0,maxZ=0;
    if(sources.length){
      minX=minZ=Infinity;maxX=maxZ=-Infinity;
      sources.forEach((_,i)=>{const x=this.data[i*12],z=this.data[i*12+2],range=this.data[i*12+7];minX=Math.min(minX,x-range);minZ=Math.min(minZ,z-range);maxX=Math.max(maxX,x+range);maxZ=Math.max(maxZ,z+range);});
    }
    const cellSize=Math.max(CELL_SIZE,Math.ceil(Math.max(maxX-minX,maxZ-minZ)/(MAX_CELLS-1)));
    minX=Math.floor(minX/cellSize)*cellSize;minZ=Math.floor(minZ/cellSize)*cellSize;
    const width=Math.max(1,Math.ceil((maxX-minX)/cellSize)),depth=Math.max(1,Math.ceil((maxZ-minZ)/cellSize));
    const cells=Array.from({length:width*depth},()=>[] as {id:number;distance:number}[]);
    sources.forEach((_,i)=>{
      const x=this.data[i*12],z=this.data[i*12+2],range=this.data[i*12+7];
      for(let iz=Math.max(0,Math.floor((z-range-minZ)/cellSize));iz<=Math.min(depth-1,Math.floor((z+range-minZ)/cellSize));iz++)for(let ix=Math.max(0,Math.floor((x-range-minX)/cellSize));ix<=Math.min(width-1,Math.floor((x+range-minX)/cellSize));ix++){
        const cx=minX+(ix+.5)*cellSize,cz=minZ+(iz+.5)*cellSize;
        const dx=Math.max(0,Math.abs(x-cx)-cellSize/2),dz=Math.max(0,Math.abs(z-cz)-cellSize/2);
        if(dx*dx+dz*dz<range*range)cells[iz*width+ix].push({id:i+1,distance:(x-cx)**2+(z-cz)**2});
      }
    });
    const indices=new Float32Array(width*depth*LIGHTS_PER_CELL);let overflow=0;
    cells.forEach((entries,i)=>{if(entries.length>LIGHTS_PER_CELL)overflow++;entries.sort((a,b)=>a.distance-b.distance||a.id-b.id);entries.slice(0,LIGHTS_PER_CELL).forEach((entry,j)=>indices[i*LIGHTS_PER_CELL+j]=entry.id);});
    this.cellTexture.dispose();this.cellTexture=texture(indices,width*2,depth);this.uniforms.streetLightCells.value=this.cellTexture;
    this.uniforms.streetLightOrigin.value.set(minX,minZ);this.uniforms.streetLightGrid.value.set(width,depth,cellSize);
    Object.assign(this.stats,{sources:sources.length,cells:cells.length,overflowCells:overflow,uploads:this.stats.uploads+1});
  }
  update(enabled:boolean,dynamicRoots:THREE.Object3D[]=[]){
    let changed=this.uniforms.streetLightsEnabled.value!==Number(enabled);this.uniforms.streetLightsEnabled.value=Number(enabled);
    let upload=false;
    for(let i=0;i<this.sources.length;i++){
      const visible=isVisible(this.sources[i]);if(visible===this.visible[i])continue;
      this.visible[i]=visible;this.data[i*12+3]=visible?this.sources[i].userData.streetLamp.intensity:0;upload=true;
    }
    if(upload){this.dataTexture.needsUpdate=true;this.stats.uploads++;changed=true;}
    const values=this.previewValues;values.fill(0);let count=0;
    if(enabled)for(const root of dynamicRoots){root.updateWorldMatrix(true,true);root.traverse(source=>{if(count<PREVIEW_LIGHTS&&source.userData.streetLamp&&isVisible(source))this.record(source,values,count++*12);});}
    this.uniforms.streetLightMaxHeight.value=this.staticMaxHeight;
    for(let i=0;i<count;i++)this.uniforms.streetLightMaxHeight.value=Math.max(this.uniforms.streetLightMaxHeight.value,values[i*12+1]+values[i*12+7]);
    if(count!==this.uniforms.streetPreviewCount.value)changed=true;this.uniforms.streetPreviewCount.value=count;
    for(let i=0;i<this.preview.length;i++){
      const v=this.preview[i],offset=i*4;
      if(v.x!==values[offset]||v.y!==values[offset+1]||v.z!==values[offset+2]||v.w!==values[offset+3])changed=true;
      v.fromArray(values,offset);
    }
    return changed;
  }
  bind(root:THREE.Object3D){
    root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!(material instanceof THREE.MeshStandardMaterial)||this.materials.has(material))continue;
      this.materials.add(material);this.stats.materials++;
      const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=(shader,renderer)=>{
        compile.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStreetWorldPosition;').replace('#include <project_vertex>',`#include <project_vertex>
          vec4 streetWorldPosition = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            streetWorldPosition = batchingMatrix * streetWorldPosition;
          #endif
          #ifdef USE_INSTANCING
            streetWorldPosition = instanceMatrix * streetWorldPosition;
          #endif
          vStreetWorldPosition = (modelMatrix * streetWorldPosition).xyz;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+pars).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          reflectedLight.directDiffuse += diffuseColor.rgb * (1.0 - metalnessFactor) * RECIPROCAL_PI * streetIrradiance(inverseTransformDirection(normal, viewMatrix));`);
      };
      material.customProgramCacheKey=()=>`${key}:street-field-v1`;material.needsUpdate=true;
    }});
  }
  dispose(){this.dataTexture.dispose();this.cellTexture.dispose();this.sources=[];}
}
