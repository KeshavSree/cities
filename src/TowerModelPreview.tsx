import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Building } from '../shared/types';
import { plotPosition } from '../shared/world';
import { buildingForm } from './buildingForm';
import { buildCity } from './cityGeometry';
import { disposeGroup } from './sceneResources';

interface PreviewEngine {
  renderer:THREE.WebGLRenderer;
  scene:THREE.Scene;
  camera:THREE.OrthographicCamera;
  segments:THREE.Group[];
  street:THREE.Group;
}

export function TowerModelPreview({building,activeSegment,onLayout}:{building:Building;activeSegment:number;onLayout:(centers:number[],street:number)=>void}){
  const host=useRef<HTMLDivElement>(null),engine=useRef<PreviewEngine|null>(null);

  useEffect(()=>{
    const element=host.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});}catch{return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);

    const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);
    scene.add(new THREE.HemisphereLight(0xffffff,0x9aab9d,2.35));
    const sun=new THREE.DirectionalLight(0xffffff,2.15);sun.position.set(-8,14,10);scene.add(sun);
    buildCity(model,[building],false,false,()=>0,[],0,{layer:'building',id:building.id,preserveSegments:true,includeDecorations:true});
    const position=plotPosition(building.x,building.z);model.position.set(-position.x,0,-position.z);

    const form=buildingForm(building,0),segments=form.sections.map(()=>new THREE.Group()),street=new THREE.Group();
    for(const group of [...segments,street])model.add(group);
    model.updateMatrixWorld(true);
    const meshes:THREE.Mesh[]=[];model.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    for(const mesh of meshes){
      const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const tagged=mesh.userData.segment;
      const index=Number.isInteger(tagged)&&tagged>=0&&tagged<segments.length?tagged:center.y>=form.sections.at(-1)!.y+form.sections.at(-1)!.h
        ?segments.length-1
        :form.sections.findIndex(section=>center.y>=section.y&&center.y<section.y+section.h);
      if(tagged===-1)street.attach(mesh);else if(index>=0)segments[index].attach(mesh);
    }
    model.scale.y=.62;
    // Compress the tower without flattening the people, trees, lamps, and shops around its base.
    street.scale.y=1/.62;model.updateMatrixWorld(true);

    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,200),box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const resize=()=>{
      const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight),aspect=width/height;
      renderer.setSize(width,height,false);
      const viewHeight=Math.max(size.y*1.08,size.x/aspect*.88,size.z/aspect*.88,4);
      camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;
      const framingCenter=center.clone();framingCenter.y-=viewHeight*.045;
      camera.position.copy(framingCenter).add(new THREE.Vector3(1,.72,1).normalize().multiplyScalar(60));camera.lookAt(framingCenter);camera.updateProjectionMatrix();
      model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const project=(group:THREE.Group)=>{
        const point=new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3()).project(camera);
        return THREE.MathUtils.clamp((1-point.y)/2,0,1);
      };
      onLayout(segments.map(project),project(street));
      renderer.render(scene,camera);
    };
    const contextLost=(event:Event)=>event.preventDefault(),contextRestored=()=>resize();
    renderer.domElement.addEventListener('webglcontextlost',contextLost);
    renderer.domElement.addEventListener('webglcontextrestored',contextRestored);
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    engine.current={renderer,scene,camera,segments,street};
    return()=>{
      observer.disconnect();engine.current=null;
      renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);
      disposeGroup(model);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[building,onLayout]);

  useEffect(()=>{
    const current=engine.current;if(!current)return;
    let frame=0;
    const animate=()=>{
      let moving=false;
      current.segments.forEach((segment,index)=>{
        const target=index===activeSegment ? .46 : 0,next=THREE.MathUtils.lerp(segment.position.x,target,.24);
        if(Math.abs(next-target)>.006)moving=true;
        segment.position.x=Math.abs(next-target)<=.006?target:next;
      });
      const streetTarget=activeSegment===-1 ? .46 : 0,streetNext=THREE.MathUtils.lerp(current.street.position.x,streetTarget,.24);
      if(Math.abs(streetNext-streetTarget)>.006)moving=true;
      current.street.position.x=Math.abs(streetNext-streetTarget)<=.006?streetTarget:streetNext;
      current.renderer.render(current.scene,current.camera);
      if(moving)frame=requestAnimationFrame(animate);
    };
    animate();return()=>cancelAnimationFrame(frame);
  },[activeSegment]);

  return <div ref={host} className="tower-model-preview" aria-hidden="true"/>;
}
