import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import './segment-menu.css';
import { useViewport } from './useViewport';

export function SegmentMenu({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const {mobile}=useViewport();
  const anchor=useRef<HTMLSpanElement>(null),back=useRef<HTMLButtonElement>(null),titleId=useId();
  const [host,setHost]=useState<HTMLElement|null>(null),[visible,setVisible]=useState(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{setHost(anchor.current?.closest<HTMLElement>('.tower-drawer')??null);},[]);
  useEffect(()=>{
    if(!host)return;
    const previous=document.activeElement as HTMLElement|null;
    const content=host.querySelector<HTMLElement>(':scope > .drawer-content');
    const wasInert=content?.inert??false,wasHidden=content?.getAttribute('aria-hidden');
    if(mobile&&content){content.inert=true;content.setAttribute('aria-hidden','true');}
    const frame=requestAnimationFrame(()=>{setVisible(true);back.current?.focus();});
    return()=>{
      cancelAnimationFrame(frame);
      if(closeTimer.current)clearTimeout(closeTimer.current);
      if(mobile&&content){
        content.inert=wasInert||!host.classList.contains('is-open');
        if(!host.classList.contains('is-open'))content.setAttribute('aria-hidden','true');
        else if(wasHidden===null||wasHidden===undefined)content.removeAttribute('aria-hidden');else content.setAttribute('aria-hidden',wasHidden);
      }
      if(host.classList.contains('is-open')&&previous?.isConnected)previous.focus();
    };
  },[host,mobile]);
  const close=()=>{
    if(closeTimer.current)return;
    setVisible(false);
    closeTimer.current=setTimeout(()=>closeRef.current(),180);
  };
  return <><span ref={anchor} hidden/>{host&&createPortal(
    <aside className={`segment-menu ${visible?'is-open':''}`} aria-labelledby={titleId} role={mobile?'dialog':undefined} aria-modal={mobile?true:undefined}
      onKeyDown={event=>{
        if(mobile&&event.key==='Tab'){const all=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')];const first=all[0],last=all[all.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}>
      <header><h2 id={titleId}>{title}</h2><button ref={back} type="button" title="Back to tower" aria-label="Back to tower" onClick={close}><ChevronRight size={20}/></button></header>
      {children}
    </aside>,host)}</>;
}
