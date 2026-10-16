import * as THREE from 'three';

/** All lamps retain cheap ground illumination, independent of the nearby dynamic-light budget. */
export class AmbientStreetLights {
  readonly group=new THREE.Group();
  private geometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  private material=new THREE.ShaderMaterial({
    uniforms:{warmth:{value:new THREE.Color('#ffd598')}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:true,
    vertexShader:`#include <common>
      #include <fog_pars_vertex>
      varying vec2 poolUv;
      void main(){poolUv=uv;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`#include <common>
      #include <fog_pars_fragment>
      uniform vec3 warmth;varying vec2 poolUv;
      void main(){float radius=length(poolUv*2.0-1.0);float fade=1.0-smoothstep(0.0,1.0,radius);if(fade<0.005)discard;gl_FragColor=vec4(warmth,fade*fade*0.26);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  private mesh:THREE.InstancedMesh;
  private entries:{source:THREE.Object3D;matrix:THREE.Matrix4;visible:boolean}[]=[];
  private hidden=new THREE.Matrix4().makeScale(0,0,0);
  constructor(){this.group.name='Ambient street illumination';this.group.userData.noPick=true;this.mesh=this.create(1);}
  private create(capacity:number){const mesh=new THREE.InstancedMesh(this.geometry,this.material,capacity);mesh.count=0;mesh.renderOrder=1;mesh.userData.noPick=true;mesh.matrixAutoUpdate=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;}
  setSources(sources:THREE.Object3D[]){
    if(sources.length>this.mesh.instanceMatrix.count){this.mesh.removeFromParent();this.mesh.dispose();this.mesh=this.create(2**Math.ceil(Math.log2(sources.length)));}
    const transform=new THREE.Object3D(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),normal=new THREE.Vector3();
    this.entries=sources.map(source=>{
      source.getWorldPosition(position);source.getWorldQuaternion(rotation);
      const window=source.userData.streetLamp.kind==='window';normal.set(0,0,-1).applyQuaternion(rotation);
      transform.position.set(position.x+(window?normal.x*.7:0),.118,position.z+(window?normal.z*.7:0));transform.quaternion.copy(rotation);transform.scale.set(window?2.8:3.8,1,window?1.8:3.8);transform.updateMatrix();
      return {source,matrix:transform.matrix.clone(),visible:true};
    });
    this.mesh.count=this.entries.length;
    this.entries.forEach((entry,i)=>this.mesh.setMatrixAt(i,entry.matrix));this.mesh.instanceMatrix.needsUpdate=true;
    this.mesh.computeBoundingSphere();this.group.userData.sourceCount=sources.length;
  }
  update(enabled:boolean){
    this.group.visible=enabled&&this.entries.length>0;if(!enabled)return;
    let changed=false;
    for(let i=0;i<this.entries.length;i++){
      const entry=this.entries[i];let visible=true;
      for(let parent:THREE.Object3D|null=entry.source;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
      if(visible!==entry.visible){entry.visible=visible;this.mesh.setMatrixAt(i,visible?entry.matrix:this.hidden);changed=true;}
    }
    this.group.visible=this.entries.some(entry=>entry.visible);
    if(changed)this.mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.group.clear();this.entries=[];}
}
