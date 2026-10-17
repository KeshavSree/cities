export interface Bounds2D {minX:number;maxX:number;minZ:number;maxZ:number;}
/** A bounded query visits nearby cells, then tests exact extents. */
export class SpatialIndex<T> {
  private cells=new Map<string,{value:T;bounds:Bounds2D}[]>();
  constructor(private cellSize=8){}
  clear(){this.cells.clear();}
  insert(value:T,bounds:Bounds2D){
    const entry={value,bounds};
    for(let x=Math.floor(bounds.minX/this.cellSize);x<=Math.floor(bounds.maxX/this.cellSize);x++)for(let z=Math.floor(bounds.minZ/this.cellSize);z<=Math.floor(bounds.maxZ/this.cellSize);z++){
      const key=`${x},${z}`;let cell=this.cells.get(key);if(!cell){cell=[];this.cells.set(key,cell);}cell.push(entry);
    }
  }
  query(bounds:Bounds2D,result=new Set<T>()){
    result.clear();
    for(let x=Math.floor(bounds.minX/this.cellSize);x<=Math.floor(bounds.maxX/this.cellSize);x++)for(let z=Math.floor(bounds.minZ/this.cellSize);z<=Math.floor(bounds.maxZ/this.cellSize);z++){
      for(const entry of this.cells.get(`${x},${z}`)||[]){const b=entry.bounds;if(b.maxX>=bounds.minX&&b.minX<=bounds.maxX&&b.maxZ>=bounds.minZ&&b.minZ<=bounds.maxZ)result.add(entry.value);}
    }
    return result;
  }
}
export function pointBounds(points:{x:number;z:number}[],padding=0):Bounds2D {
  return {minX:Math.min(...points.map(p=>p.x))-padding,maxX:Math.max(...points.map(p=>p.x))+padding,minZ:Math.min(...points.map(p=>p.z))-padding,maxZ:Math.max(...points.map(p=>p.z))+padding};
}
