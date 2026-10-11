import { useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import type { Building } from '../shared/types';
import { AVATAR_MAX_BYTES, BIO_MAX_LENGTH } from '../shared/profile';
import './resident-profile.css';

export function ProfileAvatar({ avatar, name, className = '' }: { avatar: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={`resident-avatar ${className}`}>
    {avatar && failed !== avatar ? <img src={avatar} alt={`${name}'s profile picture`} onError={() => setFailed(avatar)} /> :
      <svg viewBox="0 0 48 48" aria-label="No profile picture" role="img"><circle cx="24" cy="17" r="8" /><path d="M8 48v-9a16 16 0 0 1 32 0v9Z" /></svg>}
  </span>;
}

async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); } catch { throw new Error('This image could not be opened. Try another photo.'); }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the photo.');
    const size = Math.min(image.width, image.height);
    context.fillStyle = '#e6e9eb'; context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error('This photo could not be resized. Try another image.');
    return blob;
  } finally { image.close(); }
}

export function ResidentProfile({ building, own, busy, onSaveBio, onUpload, nameAction, headerActions }: {
  building: Building; own: boolean; busy: boolean;
  onSaveBio: (bio: string) => Promise<void>; onUpload: (image: Blob) => Promise<void>;
  nameAction: ReactNode;
  headerActions: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(building.bio);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const save = async () => {
    setSaving(true); setError('');
    try { await onSaveBio(draft); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your bio could not be saved.'); }
    finally { setSaving(false); }
  };
  const upload = async (file: File) => {
    setSaving(true); setError('');
    try { await onUpload(await prepareAvatar(file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your photo could not be saved.'); }
    finally { setSaving(false); }
  };
  return <>
    <div className="profile">
      {own ? <>
        <button className="profile-photo-edit" type="button" aria-label="Upload profile picture" title="Upload profile picture" disabled={busy || saving} onClick={() => input.current?.click()}>
          <ProfileAvatar avatar={building.avatar} name={building.name} className="profile-photo" />
          <span className={`profile-photo-overlay ${saving ? 'is-saving' : ''}`}>{saving ? <LoaderCircle size={18} className="spin" /> : <Pencil size={18} />}</span>
        </button>
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose profile picture" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
      </> : building.github_url ? <a className="profile-photo-link" href={building.github_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${building.name}’s GitHub profile`} title="View GitHub profile"><ProfileAvatar avatar={building.avatar} name={building.name} className="profile-photo" /></a> : <ProfileAvatar avatar={building.avatar} name={building.name} className="profile-photo" />}
      <div className="profile-name"><div className="profile-title-row"><h2>{building.name}</h2>{nameAction}<div className="profile-title-actions">{headerActions}</div></div><span>@{building.username}</span></div>
    </div>
    {editing && own ? <form className="bio-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
      <textarea autoFocus aria-label="Your bio" maxLength={BIO_MAX_LENGTH} value={draft} disabled={busy || saving} onChange={event => setDraft(event.target.value)} />
      <div className="bio-editor-actions"><span>{draft.length}/{BIO_MAX_LENGTH}</span><button type="button" disabled={busy || saving} onClick={() => { setEditing(false); setError(''); }}>Cancel</button><button className="bio-save" type="submit" disabled={busy || saving}>{saving ? 'Saving…' : 'Save'}</button></div>
    </form> : <div className={`profile-bio-row ${own && !building.bio ? 'is-empty' : ''}`}><p>{building.bio || (own ? 'Add a bio' : 'A new idea has moved into the neighborhood.')}</p>{own && <button type="button" className="bio-edit-button" aria-label="Edit your bio" title="Edit bio" disabled={busy || saving} onClick={() => { setDraft(building.bio); setEditing(true); setError(''); }}><Pencil size={14} /></button>}</div>}
    {error && <p className="profile-error" role="alert">{error}</p>}
  </>;
}
