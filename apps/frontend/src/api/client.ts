/**
 * API-Basis-URL: Szenario B (eine Origin) = leer oder window.location.origin.
 * Caddy routet /api → Backend, gleiche Domain → Cookie wird mitgeschickt.
 */
const getBase = (): string => {
  const env = import.meta.env.VITE_API_URL;
  if (env !== undefined && env !== '') return env;
  return '';
};

export const apiBase = getBase();

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${apiBase}${path}`;
  const hasBody = init?.body != null && init.body !== '';
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...(hasBody && { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
}
