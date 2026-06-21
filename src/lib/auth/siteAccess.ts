const ACCESS_COOKIE = 'site-access';

export { ACCESS_COOKIE };

export async function createAccessToken(password: string) {
  const data = new TextEncoder().encode(`site-access:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function getSitePassword() {
  return process.env.SITE_PASSWORD?.trim() || '';
}

export function isSiteAccessEnabled() {
  return getSitePassword().length > 0;
}

export async function isValidAccessCookie(cookieValue: string | undefined) {
  if (!cookieValue || !isSiteAccessEnabled()) return false;
  const expected = await createAccessToken(getSitePassword());
  return cookieValue === expected;
}
