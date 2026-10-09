import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import './segment-menu.css';

export function SegmentMenu({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const anchor=useRef<HTMLSpanElement>(null),back=useRef<HTMLButtonElement>(null),titleId=useId();
  const [host,setHost]=useState<HTMLElement|null>(null),[visible,setVisible]=useState(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{setHost(anchor.current?.closest<HTMLElement>('.tower-drawer')??null);},[]);
  useEffect(()=>{
    if(!host)return;
    const previous=document.activeElement as HTMLElement|null;
    const frame=requestAnimationFrame(()=>{setVisible(true);back.current?.focus();});
    return()=>{
      cancelAnimationFrame(frame);
      if(closeTimer.current)clearTimeout(closeTimer.current);
      if(previous?.isConnected)previous.focus();
    };
  },[host]);
  const close=()=>{
    if(closeTimer.current)return;
    setVisible(false);
    closeTimer.current=setTimeout(()=>closeRef.current(),180);
  };
  return <><span ref={anchor} hidden/>{host&&createPortal(
    <aside className={`segment-menu ${visible?'is-open':''}`} aria-labelledby={titleId}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
      <header><h2 id={titleId}>{title}</h2><button ref={back} type="button" title="Back to tower" aria-label="Back to tower" onClick={close}><ChevronRight size={20}/></button></header>
      {children}
    </aside>,host)}</>;
}
