import { ChevronRight, Landmark, LocateFixed, TreePine, Users } from 'lucide-react';
import type { Building, PublicProject } from '../shared/types';
import { ProjectBoard } from './ProjectBoard';
import './project-panel.css';

const projectKind = (p: PublicProject) => p.kind === 'park' ? 'Community garden' : 'Public plaza';

export function ProjectDetails({project,projects,me,busy,onSelect,onFocus,onContribute}:{
  project:PublicProject|undefined;projects:PublicProject[];me:Building|undefined;busy:boolean;
  onSelect:(id:string)=>void;onFocus:(project:PublicProject)=>void;
  onContribute:(id:string,amount:number)=>void;
}){
  const ProjectIcon = project?.kind === 'park' ? TreePine : Landmark;
  return <aside className="inspector project-inspector" aria-label={project?`${project.name} public project`:'Public projects'}>
    <div className="profile">
      <span className="project-avatar"><ProjectIcon size={23}/></span>
      <div className="profile-name"><div className="profile-title-row">
        <h2>{project?.name??'Public projects'}</h2>
        {project&&<span className="project-contributors" aria-label={`${project.contributors} contributors`} title={`${project.contributors} contributors`}><Users size={17}/><span>{project.contributors}</span></span>}
        {project&&<div className="profile-title-actions"><button className="icon-button" title="Focus this project" aria-label="Focus this project" onClick={()=>onFocus(project)}><LocateFixed size={20}/></button></div>}
      </div><span>{project?projectKind(project):'Shared places in your city'}</span></div>
    </div>
    {project?<>
      <p className="project-description">{project.description}</p>
      <ProjectBoard project={project} me={me} busy={busy} onContribute={onContribute}/>
      <button className="project-directory-link" onClick={()=>onSelect('projects')}>All public projects<ChevronRight size={15}/></button>
    </>:<div className="project-list">
      {projects.length?projects.map(p=>{
        const percent=Math.min(100,p.funded/p.goal*100);
        return <button className="project-list-row" key={p.id} onClick={()=>onSelect(p.id)}>
          <div className="project-list-title"><strong>{p.name}</strong><ChevronRight size={16}/></div>
          <div className="project-list-meta"><span>{projectKind(p)}</span><span><Users size={13}/>{p.contributors}</span></div>
          <div className="level-progress-track" aria-hidden="true"><span style={{width:`${percent}%`}}/></div>
          <div className="project-list-funding"><span>{p.funded.toLocaleString()} / {p.goal.toLocaleString()} bricks</span><span>{p.funded>=p.goal?'Complete':`${Math.round(percent)}%`}</span></div>
        </button>;
      }):<p className="project-empty">No public projects yet.</p>}
    </div>}
  </aside>;
}
