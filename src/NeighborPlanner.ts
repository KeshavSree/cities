import type { Building } from '../shared/types';
import type { StreetPoint } from './streetNavigation';
export interface RouteChoice {id:string;point:StreetPoint;}
export interface RouteResult {goalId:string;route:StreetPoint[];}
export type NavigationMessage={type:'world';generation:number;buildings:Building[]}|{type:'path';generation:number;start:StreetPoint;goals:RouteChoice[]};
export type NavigationReply={generation:number;result:RouteResult|null};
/** One outstanding request bounds the queue; stale worlds can never apply old routes. */
export class NeighborPlanner {
  private worker:Worker|null=null;
  private generation=0;
  private callback:((result:RouteResult|null)=>void)|null=null;
  get busy(){return Boolean(this.callback);}
  get available(){return Boolean(this.worker);}
  constructor(){
    if(typeof Worker==='undefined')return;
    try{
      this.worker=new Worker(new URL('./neighborNavigation.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=(event:MessageEvent<NavigationReply>)=>{if(event.data.generation!==this.generation)return;const callback=this.callback;this.callback=null;callback?.(event.data.result);};
      this.worker.onerror=()=>{const callback=this.callback;this.callback=null;this.worker?.terminate();this.worker=null;callback?.(null);};
    }catch{/* Environments without workers use the same checked navigation synchronously. */}
  }
  reset(buildings:Building[]){this.generation++;this.callback=null;this.worker?.postMessage({type:'world',generation:this.generation,buildings} satisfies NavigationMessage);}
  request(start:StreetPoint,goals:RouteChoice[],callback:(result:RouteResult|null)=>void){
    if(!this.worker||this.busy)return false;
    this.callback=callback;this.worker.postMessage({type:'path',generation:this.generation,start:{...start},goals} satisfies NavigationMessage);return true;
  }
  dispose(){this.generation++;this.callback=null;this.worker?.terminate();this.worker=null;}
}
