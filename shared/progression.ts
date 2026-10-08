import type { Building, Color } from './types';
export const MAX_LEVEL=20;
export const xpForNextLevel=(level:number)=>100+50*(level-1);
export const xpAtLevel=(level:number)=>{const n=Math.max(0,Math.min(MAX_LEVEL,level)-1);return n*100+25*n*(n-1);};
export const levelForXp=(xp:number)=>{let level=1;while(level<MAX_LEVEL&&xp>=xpAtLevel(level+1))level++;return level;};
export const TIERS=[
  {name:'Cottage',kind:'rural',ground:'Meadow garden',groundColor:'#b4cba1',stone:'#c3b18f',paving:.08},
  {name:'Townhouse',kind:'suburban',ground:'Lawn & brick patio',groundColor:'#b9c7a4',stone:'#c5a995',paving:.28},
  {name:'Apartments',kind:'suburban',ground:'Shared courtyard',groundColor:'#c5c9b7',stone:'#c4c5b6',paving:.55},
  {name:'High-rise',kind:'urban',ground:'Stone plaza',groundColor:'#ccd0c8',stone:'#aebdbb',paving:.8},
  {name:'Skyscraper',kind:'urban',ground:'Raised civic terrace',groundColor:'#d2d7d2',stone:'#b8c7c9',paving:.95},
] as const;
export const tierIndex=(level:number)=>Math.min(4,Math.max(0,Math.floor((level-1)/4)));
export const tierForLevel=(level:number)=>TIERS[tierIndex(level)];
export const segmentCount=(level:number)=>tierIndex(level)+1;
export type SegmentStyle='classic'|'glass'|'balcony';
export interface SegmentDesign{color:Color;style:SegmentStyle;}
export const SEGMENT_STYLES:Record<SegmentStyle,string>={classic:'Classic windows',glass:'Glass facade',balcony:'Balconies'};
export const SEGMENT_COST=20;
export const REWARDS={commit:5,invite:200,like:50,construction:12,project:200,dailyXp:30,dailyBricks:30};
export function segmentDesigns(building:Building):SegmentDesign[]{
  let saved:(SegmentDesign|null)[]=[];try{saved=JSON.parse(building.segments);}catch{/* Legacy defaults. */}
  return Array.from({length:segmentCount(building.level)},(_,i)=>saved[i]||{color:building.color,style:building.style==='modern'?'glass':'classic'});
}
