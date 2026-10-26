const key = 'cities-pending-invite';
const validToken = (value: string) => /^[a-zA-Z0-9-]{1,80}$/.test(value);

// This is navigation context only. The Worker still validates admission and OAuth.
export function inviteLogin(search: string, storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  const params = new URLSearchParams(search);
  let token = '';
  try { token = storage().getItem(key) || ''; } catch { /* Storage may be disabled. */ }
  if (params.has('invite')) token = params.get('invite') || '';
  if (!validToken(token) || params.get('auth_error_code') === 'INVALID_INVITATION') token = '';
  const persist = () => {
    try { if (token) storage().setItem(key, token); else storage().removeItem(key); } catch { /* Keep in-memory context for this page. */ }
  };
  persist();
  return {
    get token() { return token; },
    clear() { token = ''; persist(); },
    url(reconnect = false) {
      if (reconnect) return '/api/auth/github';
      persist();
      return token ? `/api/auth/github?invite=${encodeURIComponent(token)}` : '/api/auth/github';
    },
  };
}
