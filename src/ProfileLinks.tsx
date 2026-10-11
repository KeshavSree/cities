import { useState } from 'react';
import { Globe, Pencil } from 'lucide-react';
import type { Building } from '../shared/types';
import './profile-links.css';

type Links = { linkedin_url: string; github_url: string; website: string };
const fields = [
  { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'linkedin.com/in/your-name' },
  { key: 'github_url', label: 'GitHub', placeholder: 'github.com/your-name' },
  { key: 'website', label: 'Website', placeholder: 'your-site.com' },
] as const;
function LinkIcon({ kind }: { kind: string }) {
  if (kind === 'website') return <Globe size={15} aria-hidden="true"/>;
  if (kind === 'linkedin_url') return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 9h4v12H3zm7 0h4v1.6c.7-1.1 1.9-1.9 3.6-1.9 3.1 0 4.4 2 4.4 5.2V21h-4v-6.2c0-1.6-.5-2.7-1.9-2.7-1.5 0-2.1 1.1-2.1 2.7V21h-4Z"/></svg>;
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M9 21v-3c-4 1-4-2-6-2m12 5v-3c0-1-.3-1.5-.7-2 3-.4 5.7-1.5 5.7-6a5 5 0 0 0-1.4-3.5 4.5 4.5 0 0 0-.1-3s-1-.3-3.2 1.2a11 11 0 0 0-6.6 0C6.5 3.2 5.5 3.5 5.5 3.5a4.5 4.5 0 0 0-.1 3A5 5 0 0 0 4 10c0 4.5 2.7 5.6 5.7 6-.4.5-.7 1-.7 2"/></svg>;
}
export function ProfileLinks({ building, own, busy, onSave }: { building: Building; own: boolean; busy: boolean; onSave: (links: Links) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Links>({ linkedin_url: building.linkedin_url || '', github_url: building.github_url || '', website: building.website || '' });
  const [error, setError] = useState('');
  return <section className="tower-profile-links" aria-label="Profile links">
    <div className="tower-link-buttons">{fields.map(({key,label})=>{
      const url=building[key];
      return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><LinkIcon kind={key}/></a> : <button key={key} type="button" aria-label={label} disabled={!own || busy} title={own?`Set your ${label} link`:`No ${label} link added`} onClick={()=>setEditing(true)}><LinkIcon kind={key}/></button>;
    })}
    {own && !editing && <button className="profile-links-edit" type="button" aria-label="Edit links" title="Edit links" disabled={busy} onClick={()=>{setDraft({linkedin_url:building.linkedin_url||'',github_url:building.github_url||'',website:building.website||''});setError('');setEditing(true);}}><Pencil size={17}/></button>}
    </div>
    {own && editing && <form className="profile-links-form" onSubmit={async event=>{event.preventDefault();setError('');try{await onSave(draft);setEditing(false);}catch(e){setError(e instanceof Error?e.message:'Links could not be saved.');}}}>
      {fields.map(({key,label,placeholder})=><label key={key}>{label}<input type="text" inputMode="url" autoComplete="url" maxLength={2048} value={draft[key]} placeholder={placeholder} disabled={busy} onChange={event=>setDraft(prev=>({...prev,[key]:event.target.value}))}/></label>)}
      {error && <p role="alert">{error}</p>}
      <div><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button><button type="submit" disabled={busy}>{busy?'Saving…':'Save'}</button></div>
    </form>}
  </section>;
}
