export interface StreetInteractionState {target:string|null;carrying:string|null;error:string|null;saving:boolean;purchase:boolean;cost:number;attached?:boolean;}
export const emptyStreetInteraction:StreetInteractionState={target:null,carrying:null,error:null,saving:false,purchase:false,cost:0};
