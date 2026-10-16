import { Flower2, Armchair, Lamp, TreePine, Shapes, Package, Move, Archive, Store, PersonStanding } from 'lucide-react';
import type { Building } from '../shared/types';
import { DECORATIONS, decorationsOf, decorationSpace, MAX_DECORATIONS, type Decoration, type DecorationKind } from '../shared/decorations';
import './decorations.css';
const icons={planter:Flower2,bench:Armchair,lamp:Lamp,tree:TreePine,sculpture:Shapes,storefront:Store,base_shop:Store,person:PersonStanding};
export function DecorationShop({building,busy,onChoose,onStore}:{building:Building;busy:boolean;onChoose:(kind:DecorationKind,item?:Decoration)=>void;onStore:(item:Decoration)=>void}){
  const owned=decorationsOf(building);
  return <section className="decoration-shop" aria-label="Garden decorations">
    <div className="section-heading"><h3>Neighborhood shop</h3><span><Package size={13}/>{building.bricks??0} bricks</span></div>
    <p>Your street starts empty. Add lamps, neighbors, yard shops, or a storefront attached to your tower. Bricks are spent when placed.</p>
    <div className="decoration-catalog">{Object.entries(DECORATIONS).map(([id,definition])=>{
      const kind=id as DecorationKind,Icon=icons[kind];
      return <button key={kind} disabled={busy||owned.length>=MAX_DECORATIONS||(kind==='base_shop'&&building.level<4)} onClick={()=>onChoose(kind)} aria-label={`Preview ${definition.label}, ${definition.cost} bricks`}><span className={`decoration-icon ${kind}`}><Icon size={22}/></span><strong>{definition.label}</strong><span><Package size={12}/>{definition.cost}</span></button>;
    })}</div>
    {owned.length>0&&<div className="decoration-inventory"><h4>Your collection <span>{owned.length}/{MAX_DECORATIONS}</span></h4>{owned.map((item,index)=>{
      const definition=DECORATIONS[item.kind],placed=item.x!==null&&item.z!==null,needsSpace=placed&&Boolean(decorationSpace(building,item.kind,{x:item.x!,z:item.z!,rotation:item.rotation})),Icon=icons[item.kind];
      return <div className="owned-decoration" key={item.id}><Icon size={19}/><div><strong>{definition.label}</strong><small>{needsSpace?'Needs a new spot':placed?item.kind==='person'?'Home placed':item.kind==='base_shop'?'Attached to your tower':'In your garden':'Stored'}</small></div><button disabled={busy} aria-label={`Move ${definition.label} ${index+1}`} onClick={()=>onChoose(item.kind,item)}><Move size={15}/>{placed?'Move':'Place'}</button>{placed&&<button disabled={busy} aria-label={`Put away ${definition.label} ${index+1}`} title="Put away for later" onClick={()=>onStore(item)}><Archive size={15}/></button>}</div>;
    })}<p>Neighbors walk from their placed home to nearby shops. Move or store owned items for free. If your building grows into a spot, the decoration stays in your collection.</p></div>}
    {owned.length>=MAX_DECORATIONS&&<p>Your collection is full. You can keep moving and storing these decorations.</p>}
  </section>;
}
