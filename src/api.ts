export class ApiError extends Error { constructor(message:string,public status:number,public code?:string){super(message);} }
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  const result = await response.json() as T & { error?: string; code?:string };
  if (!response.ok) throw new ApiError(result.error || 'The city could not complete this request.',response.status,result.code);
  return result as T;
}

export async function uploadAvatar<T>(image: Blob): Promise<T> {
  const response = await fetch('/api/profile/avatar', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: image,
  });
  const result = await response.json() as T & { error?: string; code?:string };
  if (!response.ok) throw new Error(result.error || 'Your profile picture could not be saved.');
  return result;
}

type NeighborhoodSnapshot=Pick<import('../shared/types').Bootstrap,'buildings'|'projects'>;
type PersonalSnapshot=Omit<import('../shared/types').Bootstrap,'buildings'|'projects'> & {
  own:import('../shared/types').Building|null;
  projectContributions:Record<string,number>;
};
function mergePersonal(publicData:NeighborhoodSnapshot,personal:PersonalSnapshot):import('../shared/types').Bootstrap{
  const buildings=publicData.buildings.filter(b=>b.id!==personal.own?.id);
  if(personal.own)buildings.push(personal.own);
  if(personal.pendingPlacement&&!buildings.some(b=>b.id===personal.pendingPlacement!.origin.id))buildings.push(personal.pendingPlacement.origin);
  const {own,projectContributions,...settings}=personal;
  return {...settings,buildings,projects:publicData.projects.map(p=>({...p,myContribution:projectContributions[p.id]||0}))};
}
export async function readSnapshot(x=0,z=0,previous?:import('../shared/types').Bootstrap):Promise<import('../shared/types').Bootstrap>{
  if(!previous){
    const [publicData,personal]=await Promise.all([api<NeighborhoodSnapshot>(`/neighborhood?x=${x}&z=${z}`),api<PersonalSnapshot>('/self')]);
    return mergePersonal(publicData,personal);
  }
  const publicData=await api<NeighborhoodSnapshot>(`/neighborhood?x=${x}&z=${z}`);
  return mergePersonal(publicData,{...previous,own:previous.buildings.find(b=>b.id===previous.me)||null,projectContributions:Object.fromEntries(previous.projects.map(p=>[p.id,p.myContribution]))});
}
export async function refreshPersonal(previous:import('../shared/types').Bootstrap){
  return mergePersonal(previous,await api<PersonalSnapshot>('/self'));
}
