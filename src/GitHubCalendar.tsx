// Adapted from Kian Kasad's GitHubContributions.astro (BSD-2-Clause-Patent).
// Full copyright and license: public/licenses/kasad-website.txt.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Building } from '../shared/types';
import type { ContributionCalendar, ContributionDay } from '../shared/github';
import './github-calendar.css';
const formatter=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const intensity=(count:number)=>count>=20?4:count>=10?3:count>=5?2:count>0?1:0;
export function GitHubCalendar({building}:{building:Building}) {
  const [calendar,setCalendar]=useState<ContributionCalendar|null>(null);
  const [error,setError]=useState('');
  const [active,setActive]=useState<ContributionDay|null>(null);
  const scroll=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(building.is_demo)return;
    let cancelled=false;
    setError('');
    api<{calendar:ContributionCalendar}>(`/github/calendar/${encodeURIComponent(building.id)}`).then(data=>{if(!cancelled)setCalendar(data.calendar);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Activity could not be loaded.');});
    return()=>{cancelled=true;};
  },[building.id,building.is_demo,building.synced_at]);
  useEffect(()=>{if(scroll.current)scroll.current.scrollLeft=scroll.current.scrollWidth;},[calendar]);
  if(building.is_demo)return <p className="github-calendar-message">Connect GitHub to show real activity.</p>;
  if(!calendar)return <p className="github-calendar-message" role="status">{error||'Loading GitHub activity…'}</p>;
  let lastMonth='';
  return <section className="github-calendar" aria-label="GitHub contribution calendar">
    <div className="github-calendar-summary">{calendar.totalContributions.toLocaleString()} contributions in the past year</div>
    <div className="github-calendar-scroll" ref={scroll} onMouseLeave={()=>setActive(null)}>
      <div className="github-calendar-weeks">{calendar.weeks.map((week,index)=>{
        const anchor=week.contributionDays.find(day=>new Date(day.date+'T00:00:00Z').getUTCDate()<=7);
        const month=anchor?anchor.date.slice(0,7):'';
        const label=month && month!==lastMonth?new Intl.DateTimeFormat(undefined,{month:'short',timeZone:'UTC'}).format(new Date(anchor!.date+'T00:00:00Z')):'';
        if(month)lastMonth=month;
        const days=Array.from({length:7},(_,weekday)=>week.contributionDays.find(day=>new Date(day.date+'T00:00:00Z').getUTCDay()===weekday));
        return <div className="github-calendar-week" key={index}><span className="github-calendar-month">{label}</span>{days.map((day,weekday)=>day?<button key={day.date} type="button" className={`github-calendar-tile c${intensity(day.contributionCount)}`} aria-label={`${day.contributionCount} contributions on ${formatter.format(new Date(day.date+'T00:00:00Z'))}`} onPointerEnter={()=>setActive(day)} onFocus={()=>setActive(day)} onBlur={()=>setActive(null)} onClick={()=>setActive(day)}/>:<span key={weekday} className="github-calendar-empty"/>)}</div>;
      })}</div>
    </div>
    <div className="github-calendar-detail" aria-live="polite">{active?`${active.contributionCount} contribution${active.contributionCount===1?'':'s'} on ${formatter.format(new Date(active.date+'T00:00:00Z'))}`:''}</div>
    <div className="github-calendar-legend"><span>Less</span>{[0,1,2,3,4].map(n=><i key={n} className={`c${n}`}/>)}<span>More</span></div>
  </section>;
}
