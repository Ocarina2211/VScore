import { auth } from './firebase';

const VSCORE_API_BASE_URL = 'https://vscore-api.matthieu-decesco.workers.dev';
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: 'http' | 'network' | 'timeout' | 'invalid-response',
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request(path: string, init: RequestInit, forceRefresh: boolean): Promise<Response> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new ApiRequestError('Tu dois être connecté pour utiliser ce service.', 401, 'http');
  }

  const token = await user.getIdToken(forceRefresh);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
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
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new ApiRequestError(
        timedOut ? 'Le serveur Ratecade met trop de temps à répondre.' : 'Impossible de joindre le serveur Ratecade.',
        null,
        timedOut ? 'timeout' : 'network',
      );
    }
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
    throw new ApiRequestError(
      `Le serveur Ratecade a renvoyé une réponse invalide (${response.status}).`,
      response.status,
      'invalid-response',
    );
  }

  if (!response.ok) {
    throw new ApiRequestError(
      typeof data?.error === 'string' ? data.error : `Erreur serveur Ratecade (${response.status}).`,
      response.status,
      'http',
    );
  }
  return data as T;
}
