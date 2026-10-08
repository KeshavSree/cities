import { ChevronRight, Landmark, LocateFixed, MapPin, X } from 'lucide-react';
import type { Building, PublicProject } from '../shared/types';
import { ProjectBoard } from './ProjectBoard';

export function ProjectDetails({project,projects,me,busy,onSelect,onFocus,onClose,onContribute}:{
  project:PublicProject|undefined;projects:PublicProject[];me:Building|undefined;busy:boolean;
  onSelect:(id:string)=>void;onFocus:(project:PublicProject)=>void;onClose:()=>void;
  onContribute:(id:string,amount:number)=>void;
}){
  return <aside className="inspector project-inspector" aria-label={project?`${project.name} public project`:'Public projects'}>
    <div className="inspector-heading"><span><span className="small-dot"/>{project?'Public project':'Public projects'}</span><div className="drawer-heading-actions">
      {project&&<button className="icon-button" title="Focus this project" aria-label="Focus this project" onClick={()=>onFocus(project)}><LocateFixed size={17}/></button>}
      <button className="icon-button" aria-label="Close project details" onClick={onClose}><X size={18}/></button>
    </div></div>
    <div className="profile"><span className="avatar profile-avatar"><Landmark size={24}/></span><div className="profile-name"><h2>{project?.name??'Build together'}</h2><span>{project?(project.kind==='park'?'Community garden':'Public plaza'):'Places made by nearby residents'}</span></div></div>
    {project?<>
      <div className="project-detail-body"><ProjectBoard projects={[project]} me={me} busy={busy} onContribute={onContribute} showHeading={false}/></div>
      <button className="project-back" onClick={()=>onSelect('projects')}>All public projects</button>
      <footer className="inspector-footer"><MapPin size={13}/>Plot {project.x}, {project.z}<span>{project.funded>=project.goal?'Complete':'Under construction'}</span></footer>
    </>:<div className="project-directory"><p>Pool bricks to build shared places near your tower.</p>{projects.map(p=><button className="project-directory-item" key={p.id} onClick={()=>onSelect(p.id)}><span><strong>{p.name}</strong><small>{p.funded} / {p.goal} bricks · {p.contributors} contributors</small></span><ChevronRight size={16}/></button>)}</div>}
  </aside>;
}
