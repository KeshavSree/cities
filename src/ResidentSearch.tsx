import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Building } from '../shared/types';
import { ProfileAvatar } from './ResidentProfile';
import './resident-search.css';

export function ResidentSearch({open,query,results,onOpenChange,onQuery,onSelect}:{open:boolean;query:string;results:Building[];onOpenChange:(open:boolean)=>void;onQuery:(value:string)=>void;onSelect:(building:Building)=>void}){
  const input=useRef<HTMLInputElement>(null),button=useRef<HTMLButtonElement>(null),root=useRef<HTMLDivElement>(null);
  const [active,setActive]=useState(0),listId=useId();
  useEffect(()=>{if(open)input.current?.focus();},[open]);
  useEffect(()=>{setActive(0);},[query]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onOpenChange(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open,onOpenChange]);
  const close=()=>{onOpenChange(false);button.current?.focus();};
  const activeIndex=Math.min(active,Math.max(0,results.length-1));
  return <div ref={root} className={`nav-search ${open?'is-open':''}`} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  }}>
    <button ref={button} className="icon-button search-toggle" title="Find a neighbor" aria-label="Find a neighbor" aria-expanded={open} aria-controls={listId} onClick={()=>onOpenChange(!open)}><Search size={19}/></button>
    <div className="nav-search-field" inert={!open} aria-hidden={!open}>
      <input ref={input} placeholder="Name or username" value={query} onChange={event=>onQuery(event.target.value)} aria-label="Search residents" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&results.length?`${listId}-${activeIndex}`:undefined} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();setActive(previous=>Math.max(0,Math.min(results.length-1,previous+(event.key==='ArrowDown'?1:-1))));
        }else if(event.key==='Enter'&&results[activeIndex]){event.preventDefault();onSelect(results[activeIndex]);}
      }}/>
    </div>
    <div className="search-suggestions" inert={!open} aria-hidden={!open}>
      <div id={listId} className="resident-results" role="listbox" aria-label="Matching residents">
        {results.length?results.map((building,index)=><button id={`${listId}-${index}`} key={building.id} className="resident-result" role="option" aria-selected={index===activeIndex} onPointerMove={()=>setActive(index)} onClick={()=>onSelect(building)}>
          <ProfileAvatar avatar={building.avatar} name={building.name} className="small"/><span><strong>{building.name}</strong><small>@{building.username}</small></span><span className="level-label">Lv. {building.level}</span>
        </button>):<p className="empty-search">No neighbors match that name.</p>}
      </div>
    </div>
  </div>;
}
