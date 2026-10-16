export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export interface CityLighting {
  phase: TimeOfDay;
  daylight: number;
  night: boolean;
  lightsOn: boolean;
  sunPhase: number;
  sunColor: string;
  ambientSky: string;
  ambientGround: string;
  skyCenter: string;
  skyEdge: string;
}

type Palette = Pick<CityLighting, 'daylight' | 'sunColor' | 'ambientSky' | 'ambientGround' | 'skyCenter' | 'skyEdge'>;
const night:Palette={daylight:0,sunColor:'#b2c6ed',ambientSky:'#8096bd',ambientGround:'#53634e',skyCenter:'#17273f',skyEdge:'#273857'};
const day:Palette={daylight:1,sunColor:'#fff3df',ambientSky:'#f2f7ff',ambientGround:'#93aa80',skyCenter:'#f1f5f3',skyEdge:'#dce9ee'};
const morning:Palette={daylight:.25,sunColor:'#ffd0a0',ambientSky:'#ead9e3',ambientGround:'#a6a484',skyCenter:'#f0d4c0',skyEdge:'#d4b6c9'};
const evening:Palette={daylight:.6,sunColor:'#ffc18a',ambientSky:'#dfb8c7',ambientGround:'#9e8b73',skyCenter:'#edc7aa',skyEdge:'#bd96b2'};
const dusk:Palette={daylight:.14,sunColor:'#e5b2ab',ambientSky:'#8b83b6',ambientGround:'#5a6353',skyCenter:'#5b547f',skyEdge:'#3f4969'};
const frames:{hour:number;palette:Palette}[]=[{hour:0,palette:night},{hour:5.5,palette:night},{hour:6,palette:morning},{hour:9,palette:day},{hour:17,palette:day},{hour:18,palette:evening},{hour:20,palette:dusk},{hour:21,palette:night},{hour:24,palette:night}];

/** Browser-local clock: morning 06–09, day 09–18, evening 18–21, night 21–06.
 * Local getters automatically follow the viewer's timezone and daylight saving changes.
 * Fixed clock times intentionally do not need location access or a server timezone.
 */
export function lightingAt(date: Date): CityLighting {
  const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600+date.getMilliseconds()/3600000;
  const phase:TimeOfDay=hour<6||hour>=21?'night':hour<9?'morning':hour<18?'day':'evening';
  const index=frames.findIndex((frame,i)=>i<frames.length-1&&hour>=frame.hour&&hour<frames[i+1].hour);
  const start=frames[Math.max(0,index)],end=frames[Math.max(0,index)+1],progress=(hour-start.hour)/(end.hour-start.hour),amount=progress*progress*(3-2*progress);
  const colors={} as Omit<Palette,'daylight'>;
  for(const key of ['sunColor','ambientSky','ambientGround','skyCenter','skyEdge'] as const)colors[key]=mix(start.palette[key],end.palette[key],amount);
  return {...colors,phase,night:phase==='night',lightsOn:phase==='evening'||phase==='night',daylight:start.palette.daylight+(end.palette.daylight-start.palette.daylight)*amount,sunPhase:(hour-6)/12*Math.PI};
}
function mix(from:string,to:string,amount:number){
  const channel=(color:string,index:number)=>parseInt(color.slice(index,index+2),16);
  return '#'+[1,3,5].map(i=>Math.round(channel(from,i)*(1-amount)+channel(to,i)*amount).toString(16).padStart(2,'0')).join('');
}
