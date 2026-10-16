import { NeighborRoutes } from './neighborRoutes';
import type { NavigationMessage,NavigationReply,RouteResult } from './NeighborPlanner';
let routes:NeighborRoutes|null=null,generation=0;
self.onmessage=(event:MessageEvent<NavigationMessage>)=>{
  const data=event.data;
  if(data.type==='world'){generation=data.generation;routes=new NeighborRoutes(data.buildings);return;}
  if(data.generation!==generation||!routes)return;
  let result:RouteResult|null=null;
  for(const goal of data.goals){const route=routes.path(data.start,goal.point);if(route){result={goalId:goal.id,route};break;}}
  self.postMessage({generation,result} satisfies NavigationReply);
};
