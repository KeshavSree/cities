import * as THREE from 'three';
import { streetLamp, shopWindowLight } from './StreetLighting';
import { neighborModel } from './NeighborModel';
import { type DecorationKind } from '../shared/decorations';
import { detailSign, type DetailBox, type DetailMaterial } from './StreetDetails';

export function decorationModel(group:THREE.Group,kind:DecorationKind,lightsOn:boolean,box:DetailBox,mat:DetailMaterial,owner?:string,labels=true){
  const part=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>box(group,x,y,z,w,h,d,color,owner);
  const mesh=(geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number)=>{
    const object=new THREE.Mesh(geometry,mat(color));object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;if(owner)object.userData.owner=owner;group.add(object);return object;
  };
  if(kind==='planter'){
    part(0,.1,0,.36,.2,.36,'#c9b6a0');part(0,.21,0,.38,.04,.38,'#e0d3b9');part(0,.235,0,.3,.012,.3,'#786851');
    for(let i=0;i<7;i++){
      const angle=i*Math.PI*2/7,x=Math.cos(angle)*.11,z=Math.sin(angle)*.11;
      part(x,.29,z,.018,.1,.018,'#6f925f');mesh(new THREE.IcosahedronGeometry(.045,0),i%2?'#e1b66f':'#c77e8d',x,.36+(i%2)*.025,z);
    }
  }else if(kind==='bench'){
    for(const x of [-.27,.27]){part(x,.12,0,.035,.24,.23,'#465b54');part(x,.29,.09,.035,.29,.035,'#465b54');}
    for(const z of [-.085,0,.085])part(0,.25,z,.72,.035,.06,'#bd9266');
    for(const y of [.33,.41])part(0,y,.105,.72,.06,.035,'#bd9266');
  }else if(kind==='lamp'){
    part(0,.04,0,.16,.08,.16,'#465b54');part(0,.57,0,.035,1.08,.035,'#465b54');
    const bulb=part(0,1.07,0,.12,.13,.12,lightsOn?'#f0daab':'#e9dfb9');
    if(bulb.material instanceof THREE.MeshStandardMaterial){const material=bulb.material.clone();material.emissive.set('#ffd995');material.emissiveIntensity=lightsOn?1.8:0;bulb.material=material;}
    for(const x of [-.067,.067])for(const z of [-.067,.067])part(x,1.07,z,.018,.17,.018,'#465b54');
    part(0,.98,0,.16,.025,.16,'#465b54');part(0,1.18,0,.18,.04,.18,'#465b54');
    streetLamp(group,0,.94,0);
  }else if(kind==='tree'){
    part(0,.025,0,.48,.05,.48,'#bea78c');part(0,.055,0,.41,.02,.41,'#8b9c70');part(0,.37,0,.07,.6,.07,'#a3815f');
    const leaves=mesh(new THREE.IcosahedronGeometry(.25,1),'#82a66c',0,.79,0);leaves.scale.y=1.35;
  }else if(kind==='storefront'){
    part(0,.36,0,.88,.72,.48,'#e5c7a4');part(0,.45,-.249,.64,.42,.018,lightsOn?'#edcf91':'#799fa1');
    part(-.31,.28,-.265,.18,.54,.025,'#50736b');part(-.3,.29,-.285,.11,.35,.015,'#acc9bd');
    part(.15,.34,-.275,.44,.035,.055,'#dbc492');part(.15,.48,-.275,.018,.29,.02,'#dbc492');
    part(.14,.16,-.27,.45,.2,.04,'#bf9870');
    for(let i=0;i<8;i++)part(-.42+i*.12,.78,-.055,.115,.045,.56,i%2?'#f3e6c9':'#ae7c68');
    part(0,.91,.02,.72,.2,.06,'#496d61');part(0,.91,-.015,.52,.025,.008,'#e4d9b6');
    if(labels){const sign=detailSign(group,'CORNER SHOP',.69,.17,'#496d61','#f3e6c9',owner);if(sign){sign.position.set(0,.91,-.018);sign.rotation.y=Math.PI;}}
    for(const x of [.04,.16,.28])part(x,.24,-.3,.07,.07,.08,x<.2?'#c6a563':'#8f9f70');
    shopWindowLight(group,.1,.48,-.35);
  }else if(kind==='base_shop'){
    part(0,.45,0,.96,.9,.12,'#496d61');part(.12,.4,-.075,.61,.65,.025,lightsOn?'#edcf91':'#8bafb0');
    part(-.32,.36,-.08,.21,.72,.03,'#335950');part(-.32,.44,-.1,.14,.46,.02,'#a7c7c2');
    part(-.25,.3,-.125,.022,.08,.02,'#e5c994');part(.12,.42,-.095,.025,.65,.025,'#d8c399');
    for(let i=0;i<8;i++)part(-.42+i*.12,.94,-.075,.12,.05,.32,i%2?'#f0dfb7':'#9a6f55');
    part(0,.85,-.23,.96,.13,.025,'#9a6f55');part(0,.1,-.08,.96,.12,.14,'#c4ae8b');
    if(labels){const sign=detailSign(group,'LOCAL SHOP',.76,.12,'#496d61','#f4e6c6',owner);if(sign){sign.position.set(0,.86,-.246);sign.rotation.y=Math.PI;}}
    shopWindowLight(group,.1,.43,-.16);
  }else if(kind==='person'){
    neighborModel(group,box,owner);
  }else{
    part(0,.11,0,.38,.22,.38,'#c6c3b3');part(0,.24,0,.32,.05,.32,'#ded8c6');
    const sculpture=mesh(new THREE.OctahedronGeometry(.22,0),'#9cae9f',0,.53,0);sculpture.scale.y=1.3;sculpture.rotation.y=Math.PI/4;
    part(0,.83,0,.09,.04,.09,'#c5a76a');
  }
  group.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});
}
