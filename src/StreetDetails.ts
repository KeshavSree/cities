import * as THREE from 'three';

export type DetailBox=(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string,owner?:string)=>THREE.Mesh;
export type DetailMaterial=(color:string)=>THREE.Material;

/** Canvas lettering stays sharp close up without external images or font requests. */
export function detailSign(parent:THREE.Group,text:string,width:number,height:number,background:string,foreground:string,owner?:string){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const context=canvas.getContext('2d');if(!context)return;
  context.fillStyle=background;context.fillRect(0,0,512,128);
  context.strokeStyle=foreground;context.lineWidth=3;context.strokeRect(9,9,494,110);
  context.fillStyle=foreground;context.textAlign='center';context.textBaseline='middle';
  context.font=`600 ${Math.min(50,700/Math.max(1,text.length))}px system-ui, sans-serif`;context.fillText(text,256,67,465);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:1});material.userData.ownedMap=true;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
  const reverse=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);reverse.rotation.y=Math.PI;reverse.position.z=-.04;
  if(owner){mesh.userData.owner=owner;reverse.userData.owner=owner;}mesh.add(reverse);parent.add(mesh);return mesh;
}
