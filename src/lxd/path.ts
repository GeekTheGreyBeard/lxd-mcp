/** Encode one untrusted resource identifier, never URL syntax. */
export function safePathSegment(value: string): string {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\\/\x00-\x1f\x7f?#%]/.test(value)) {
    throw new Error('Invalid LXD resource identifier');
  }
  return encodeURIComponent(value);
}

/** LXD collection URLs can carry ?project=...; do not use it as part of a name. */
export function resourceName(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  const name = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  safePathSegment(name);
  return name;
}
