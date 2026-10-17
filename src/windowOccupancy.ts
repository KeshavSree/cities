/** Room occupancy is tied to its address, so changing the time never rerolls it. */
export function windowIsLit(owner:string,segment:number,edge:number,floor:number,bay:number){
  const address=`${owner}:${segment}:${edge}:${floor}:${bay}`;
  let hash=2166136261;
  for(let i=0;i<address.length;i++)hash=Math.imul(hash^address.charCodeAt(i),16777619);
  // Mix neighboring room addresses before choosing roughly three occupied rooms in five.
  hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;
  return (hash>>>0)/4294967296<.6;
}
