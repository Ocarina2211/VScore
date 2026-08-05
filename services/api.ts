import { auth } from './firebase';

const VSCORE_API_BASE_URL = 'https://vscore-api.matthieu-decesco.workers.dev';
const REQUEST_TIMEOUT_MS = 20_000;

async function request(path: string, init: RequestInit, forceRefresh: boolean): Promise<Response> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Tu dois être connecté pour utiliser ce service.');

  const token = await user.getIdToken(forceRefresh);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${VSCORE_API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await request(path, init, false);
  if (response.status === 401) response = await request(path, init, true);

  const body = await response.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Le serveur VScore a renvoyé une réponse invalide (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Erreur serveur VScore (${response.status}).`);
  }
  return data as T;
}
