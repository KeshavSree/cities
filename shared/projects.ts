export const PUBLIC_PROJECTS=[
  {id:'riverside-commons',name:'Riverside commons',kind:'park',x:3.5,z:.5,goal:600,description:'A shared garden, trees and a gathering pavilion.',minX:3,maxX:4,minZ:0,maxZ:1},
  {id:'makers-square',name:'Makers square',kind:'plaza',x:-4.5,z:-3.5,goal:900,description:'A public plaza with a sculpture and community seating.',minX:-5,maxX:-4,minZ:-4,maxZ:-3},
] as const;
export const isReservedPlot=(x:number,z:number)=>PUBLIC_PROJECTS.some(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ);
export const PROJECT_RADIUS=35;
