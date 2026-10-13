import { useEffect, useRef } from 'react';
import { ChevronUp } from 'lucide-react';
import entries from './data/changelog.json';
import './changelog.css';

type Entry={id:string;date:string;title:string;summary:string;changes:string[]};
export function Changelog(){
  const updates=(entries as Entry[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(!updates.length)return <div className="changelog-empty"><span className="changelog-empty-mark" aria-hidden="true">✦</span><h3>The city is still growing.</h3><p>No changelogs yet. Check back here for the latest updates.</p></div>;
  return <div className="changelog-entries">{updates.map(entry=><article className="changelog-entry" key={entry.id}>
    <time dateTime={entry.date}>{new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${entry.date}T12:00:00Z`))}</time>
    <h3>{entry.title}</h3>{entry.summary&&<p>{entry.summary}</p>}
    {entry.changes.length>0&&<ul>{entry.changes.map((change,index)=><li key={index}>{change}</li>)}</ul>}
  </article>)}</div>;
}

export function ChangelogPane({open,onClose}:{open:boolean;onClose:()=>void}){
  const closeButton=useRef<HTMLButtonElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    closeButton.current?.focus({preventScroll:true});
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeRef.current();}};
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('keydown',escape);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open]);
  return <div className={`changelog-drawer ${open?'is-open':''}`} aria-hidden={!open}>
    <aside id="changelog-pane" className="changelog-pane" aria-labelledby="changelog-heading" inert={!open}>
      <div className="changelog-scroll"><h2 id="changelog-heading">Changelog</h2><Changelog/></div>
      <button ref={closeButton} className="changelog-collapse" type="button" aria-label="Slide changelog closed" title="Slide changelog closed" onClick={onClose}><ChevronUp size={20}/></button>
    </aside>
  </div>;
}
