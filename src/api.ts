export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'The city could not complete this request.');
  return result as T;
}

export async function uploadAvatar<T>(image: Blob): Promise<T> {
  const response = await fetch('/api/profile/avatar', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: image,
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Your profile picture could not be saved.');
  return result;
}
