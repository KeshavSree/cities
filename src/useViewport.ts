import { useEffect, useState } from 'react';
const measure=()=>({width:window.innerWidth,height:Math.round(window.visualViewport?.height??window.innerHeight),keyboardOpen:(window.visualViewport?.height??window.innerHeight)<window.innerHeight-100});
export function useViewport(){
  const [viewport,setViewport]=useState(measure);
  useEffect(()=>{
    const resize=()=>setViewport(previous=>{const next=measure();return previous.width===next.width&&previous.height===next.height&&previous.keyboardOpen===next.keyboardOpen?previous:next;});
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
    return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);};
  },[]);
  return {...viewport,mobile:viewport.width<=760};
}
