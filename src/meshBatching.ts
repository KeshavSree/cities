import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLOT_SPACING } from '../shared/world';
import { streetLampMarkers } from './StreetLighting';

function materialKey(material:THREE.MeshStandardMaterial){
  const emissive=material.emissiveIntensity&&material.emissive.getHex()?`${material.emissive.getHex()}:${material.emissiveIntensity}`:'0';
  return [material.type,emissive,material.roughness,material.metalness,material.opacity,material.transparent,material.side,material.flatShading,material.depthWrite,material.depthTest,material.map?.uuid,material.alphaTest,material.wireframe,material.polygonOffset,material.polygonOffsetFactor,material.polygonOffsetUnits].join(':');
}
function coloredMaterial(source:THREE.MeshStandardMaterial){
  const material=source.clone();material.color.set('#ffffff');material.vertexColors=true;
  if(!source.emissiveIntensity||!source.emissive.getHex()){material.emissive.set('#000000');material.emissiveIntensity=0;}
  return material;
}
/** Identical surface properties share one material across every cached city asset. */
export class BatchMaterials {
  private materials=new Map<string,THREE.MeshStandardMaterial>();
  get(source:THREE.MeshStandardMaterial){
    const key=materialKey(source);let material=this.materials.get(key);
    if(!material){material=coloredMaterial(source);material.userData.sharedBatch=true;this.materials.set(key,material);}
    return material;
  }
  get size(){return this.materials.size;}
  dispose(){this.materials.forEach(m=>m.dispose());this.materials.clear();}
}

/** Bake surface colors into vertices, retaining ownership, light sources and shadow behavior. */
export function batchCityMeshes(group:THREE.Group,pool?:BatchMaterials,preserveSegments=false){
  type Batch={material:THREE.Material;owner?:string;project?:string;decoration?:string;segment?:number;castShadow:boolean;receiveShadow:boolean;geometries:THREE.BufferGeometry[]};
  const batches=new Map<string,Batch>(),originals=new Set<THREE.BufferGeometry>(),sourceMaterials=new Set<THREE.Material>(),localMaterials=new Map<string,THREE.MeshStandardMaterial>();
  const center=new THREE.Vector3();group.updateMatrixWorld(true);
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshStandardMaterial))return;
    const source=object.material,key=materialKey(source);
    let material=pool&&!source.map?pool.get(source):localMaterials.get(key);
    if(!material){material=coloredMaterial(source);localMaterials.set(key,material);}
    // toNonIndexed already allocates a copy; cloning it first doubled transient buffers.
    const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const count=geometry.attributes.position.count,colors=new Float32Array(count*3),previous=geometry.getAttribute('color');
    for(let i=0;i<count;i++){colors[i*3]=source.color.r*(previous?.getX(i)??1);colors[i*3+1]=source.color.g*(previous?.getY(i)??1);colors[i*3+2]=source.color.b*(previous?.getZ(i)??1);}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if(!source.map)geometry.deleteAttribute('uv');
    else if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
    const owner=object.userData.owner as string|undefined,project=object.userData.project as string|undefined,decoration=object.userData.decoration as string|undefined;
    const segment=preserveSegments&&Number.isInteger(object.userData.segment)?object.userData.segment as number:undefined;
    let chunk='pickable';
    if(!owner&&!project){geometry.computeBoundingBox();geometry.boundingBox!.getCenter(center);chunk=`${Math.floor(center.x/(PLOT_SPACING*8))},${Math.floor(center.z/(PLOT_SPACING*8))}`;}
    const batchKey=`${material.uuid}:${owner||''}:${project||''}:${decoration||''}:${segment??''}:${+object.castShadow}:${+object.receiveShadow}:${chunk}`;
    if(!batches.has(batchKey))batches.set(batchKey,{material,owner,project,decoration,segment,castShadow:object.castShadow,receiveShadow:object.receiveShadow,geometries:[]});
    batches.get(batchKey)!.geometries.push(geometry);originals.add(object.geometry);sourceMaterials.add(source);
  });
  const markers=streetLampMarkers(group);group.clear();if(markers.length)group.add(...markers);
  originals.forEach(g=>g.dispose());sourceMaterials.forEach(m=>m.dispose());
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.geometries);batch.geometries.forEach(g=>g.dispose());if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=batch.castShadow;mesh.receiveShadow=batch.receiveShadow;
    if(batch.owner)mesh.userData.owner=batch.owner;if(batch.project)mesh.userData.project=batch.project;if(batch.decoration)mesh.userData.decoration=batch.decoration;if(batch.segment!==undefined)mesh.userData.segment=batch.segment;
    mesh.matrixAutoUpdate=false;group.add(mesh);
  }
}
