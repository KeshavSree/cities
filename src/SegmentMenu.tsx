import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './segment-menu.css';

export function SegmentMenu({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{
    const element=dialog.current!;element.showModal();
    return()=>element.close();
  },[]);
  return createPortal(<dialog ref={dialog} className="segment-menu" aria-modal="true" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{
      if(event.target!==event.currentTarget)return;
      const box=event.currentTarget.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();
    }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close tier customization" onClick={onClose}><X size={18}/></button></header>
    {children}
  </dialog>,document.body);
}
