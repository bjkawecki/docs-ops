function getCookieHeader(setCookie: string | string[] | undefined): string {
  if (Array.isArray(setCookie))
    return setCookie
      .map((value) => (typeof value === 'string' ? value.split(';')[0].trim() : ''))
      .filter(Boolean)
      .join('; ');
  if (typeof setCookie === 'string') return setCookie.split(';')[0].trim();
  return '';
}

export { getCookieHeader };
