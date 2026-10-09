import { AVATAR_MAX_BYTES } from '../shared/profile';

export class PhotoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function saveAvatar(req: Request, db: D1Database, userId: string) {
  if (req.headers.get('Content-Type') !== 'image/jpeg') throw new PhotoError('Upload a JPEG profile picture.');
  if (Number(req.headers.get('Content-Length')) > AVATAR_MAX_BYTES) throw new PhotoError('Profile picture is too large.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new PhotoError('Choose a profile picture.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > AVATAR_MAX_BYTES) { await reader.cancel(); throw new PhotoError('Profile picture is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (size < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[size - 2] !== 0xff || bytes[size - 1] !== 0xd9) throw new PhotoError('Choose a valid profile picture.');
  const version = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO profile_photos(user_id,image,version) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image,version=excluded.version').bind(userId, bytes.buffer, version),
    db.prepare('UPDATE users SET avatar=? WHERE id=?').bind(`/api/profile/avatar/${encodeURIComponent(userId)}?v=${version}`, userId),
    db.prepare("UPDATE buildings SET updated_at=datetime('now') WHERE user_id=?").bind(userId),
  ]);
}

export async function avatarResponse(req: Request, db: D1Database, userId: string) {
  const photo = await db.prepare('SELECT image,version FROM profile_photos WHERE user_id=?').bind(userId).first<{ image: number[]; version: string }>();
  if (!photo) return new Response(null, { status: 404 });
  const headers = { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: `"${photo.version}"` };
  if (req.headers.get('If-None-Match') === headers.ETag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : new Uint8Array(photo.image), { headers });
}
