import * as THREE from 'three';

/** Shared batch materials belong to the scene pool, not to individual cached parcels. */
export function disposeGroup(group:THREE.Group){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(object=>{
    if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){
      geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(!material.userData.sharedBatch)materials.add(material);
      if(object instanceof THREE.InstancedMesh)object.dispose();
    }
  });
  geometries.forEach(g=>g.dispose());
  materials.forEach(material=>{if(material.userData.ownedMap&&'map' in material&&material.map instanceof THREE.Texture)textures.add(material.map);material.dispose();});
  textures.forEach(t=>t.dispose());group.clear();
}
