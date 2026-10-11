import type { Building, Color } from './types';
export const LEVELS_PER_TIER=3;
export const MAX_LEVEL=30;
export const xpForNextLevel=(level:number)=>100+50*(level-1);
export const xpAtLevel=(level:number)=>{const n=Math.max(0,Math.min(MAX_LEVEL,level)-1);return n*100+25*n*(n-1);};
export const levelForXp=(xp:number)=>{let level=1;while(level<MAX_LEVEL&&xp>=xpAtLevel(level+1))level++;return level;};
export const TIERS=[
  {name:'Shack',kind:'rural',ground:'Wild clearing',groundColor:'#a9c398',stone:'#b5a182',paving:.02},
  {name:'Cottage',kind:'rural',ground:'Meadow garden',groundColor:'#b4cba1',stone:'#c3b18f',paving:.08},
  {name:'Townhouse',kind:'suburban',ground:'Lawn & brick patio',groundColor:'#b9c7a4',stone:'#c5a995',paving:.28},
  {name:'Apartments',kind:'suburban',ground:'Shared courtyard',groundColor:'#c5c9b7',stone:'#c4c5b6',paving:.55},
  {name:'High-rise',kind:'urban',ground:'Stone plaza',groundColor:'#ccd0c8',stone:'#aebdbb',paving:.8},
  {name:'Skyscraper',kind:'urban',ground:'Raised civic terrace',groundColor:'#d2d7d2',stone:'#b8c7c9',paving:.95},
  {name:'Skybridge tower',kind:'urban',ground:'Illuminated plaza',groundColor:'#bed1d0',stone:'#92b4b8',paving:.96},
  {name:'Vertical campus',kind:'urban',ground:'Faceted transit court',groundColor:'#c5c7da',stone:'#a6adc9',paving:.97},
  {name:'Sky garden',kind:'urban',ground:'Terraced biosphere',groundColor:'#b4caba',stone:'#9ebdb3',paving:.9},
  {name:'Arcology',kind:'urban',ground:'Civic energy platform',groundColor:'#c3d6dc',stone:'#95b5c4',paving:1},
] as const;
export const tierIndex=(level:number)=>Math.min(TIERS.length-1,Math.max(0,Math.floor((level-1)/LEVELS_PER_TIER)));
export const tierStartLevel=(index:number)=>index*LEVELS_PER_TIER+1;
export const tierForLevel=(level:number)=>TIERS[tierIndex(level)];
export const segmentCount=(level:number)=>tierIndex(level)+1;
export type SegmentStyle='classic'|'glass'|'balcony';
export const CYBERPUNK_CROWN_HEIGHTS=[.65,.95,1.35,1.85,2.5,3.4,4.8,6.4,8.4,10.5];
export const THEME_PRICE_TIERS={1:90,2:180,3:360,4:540} as const;
export const BUILDING_THEMES={
  contemporary:{label:'Terraced Contemporary',description:'Offset volumes, planted terraces, and continuous facade lines.',priceTier:0,cost:0},
  earthen:{label:'Earthen Citadel',description:'Tapered mineral walls, deep openings, shaded courts, and clustered towers.',priceTier:1,cost:THEME_PRICE_TIERS[1]},
  deco:{label:'Art Deco',description:'Axial setbacks, vertical ribs, geometric entrances, and a stepped metal crown.',priceTier:2,cost:THEME_PRICE_TIERS[2]},
  metabolism:{label:'Metabolism',description:'Permanent service cores carry projecting modular rooms, pods, and bridges.',priceTier:3,cost:THEME_PRICE_TIERS[3]},
  cyberpunk:{label:'Cyberpunk',description:'Layered armor, recessed violet glazing, luminous white ribs, suspended decks, and a skyline of connected spires.',priceTier:0,cost:0},
  nocturne:{label:'Nocturne Spire',description:'Buttressed dark masonry rises toward luminous recesses and split pointed crowns.',priceTier:4,cost:THEME_PRICE_TIERS[4]},
} as const;
export type BuildingTheme=keyof typeof BUILDING_THEMES;
export interface SegmentDesign{color:Color;style:SegmentStyle;theme:BuildingTheme;}
export const SEGMENT_STYLES:Record<SegmentStyle,string>={classic:'Classic windows',glass:'Glass facade',balcony:'Balconies'};
export const DEFAULT_UNLOCKED_THEMES:BuildingTheme[]=['contemporary'];
export const GITHUB_DAILY_COMMIT_LIMIT=20;
export const REWARDS={commit:10,commitBricks:10,invite:200,like:50,construction:20,project:200,dailyXp:30,dailyBricks:30};
export function segmentDesigns(building:Building):SegmentDesign[]{
  let saved:(SegmentDesign|null)[]=[];try{const parsed=JSON.parse(building.segments);if(Array.isArray(parsed))saved=parsed;}catch{/* Legacy defaults. */}
  return Array.from({length:segmentCount(building.level)},(_,i)=>({color:saved[i]?.color??building.color,style:saved[i]?.style??(building.style==='modern'||tierIndex(building.level)>=6?'glass':'classic'),theme:saved[i]?.theme&&Object.hasOwn(BUILDING_THEMES,saved[i]!.theme)?saved[i]!.theme:'contemporary'}));
}
