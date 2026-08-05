const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RAWG_BASE_URL = 'https://api.rawg.io/api';
const RAWG_API_KEY = defineSecret('RAWG_API_KEY');
const RAWG_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const RAWG_DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RAWG_FETCH_TIMEOUT_MS = 12_000;
const MAX_CACHE_BYTES = 650_000;
const ALLOWED_RAWG_PARAMS = new Set([
  'dates',
  'genres',
  'lang',
  'metacritic',
  'ordering',
  'page',
  'page_size',
  'platforms',
  'search',
  'tags',
]);

function normalizeRawgRequest(data) {
  const path = typeof data?.path === 'string' ? data.path : '';
  if (!/^\/games(?:\/\d+)?(?:\/(?:screenshots|stores|suggested))?$/.test(path)) {
    throw new HttpsError('invalid-argument', 'Unsupported RAWG path.');
  }

  const rawQuery = data?.query && typeof data.query === 'object' ? data.query : {};
  const query = {};
  for (const [key, rawValue] of Object.entries(rawQuery)) {
    if (!ALLOWED_RAWG_PARAMS.has(key) || rawValue == null || rawValue === '') continue;
    const value = String(rawValue);
    if (value.length > 200) throw new HttpsError('invalid-argument', `RAWG parameter too long: ${key}`);
    query[key] = value;
  }

  const page = Number(query.page ?? 1);
  const pageSize = Number(query.page_size ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    throw new HttpsError('invalid-argument', 'Invalid RAWG page.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60) {
    throw new HttpsError('invalid-argument', 'Invalid RAWG page size.');
  }
  query.page = String(page);
  query.page_size = String(pageSize);

  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return { path, query, canonicalQuery };
}

function rawgCacheTtl(path) {
  return /^\/games\/\d+/.test(path) ? RAWG_DETAIL_TTL_MS : RAWG_LIST_TTL_MS;
}

async function fetchRawg(path, query) {
  const url = new URL(`${RAWG_BASE_URL}${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('key', RAWG_API_KEY.value());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RAWG_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'VScore/1.0' },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`RAWG HTTP ${response.status}`);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('RAWG returned non-JSON data');
    }
  } finally {
    clearTimeout(timeout);
  }
}

exports.rawgProxy = onCall(
  {
    region: REGION,
    secrets: [RAWG_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { path, query, canonicalQuery } = normalizeRawgRequest(request.data);
    const cacheId = crypto.createHash('sha256').update(`${path}?${canonicalQuery}`).digest('hex');
    const cacheRef = db.collection('rawg_cache').doc(cacheId);
    const cacheSnap = await cacheRef.get();
    const cached = cacheSnap.exists ? cacheSnap.data() : null;
    const cachedAt = Number(cached?.fetchedAtMs ?? 0);
    const isFresh = cached?.data != null && Date.now() - cachedAt < rawgCacheTtl(path);

    if (isFresh) return { data: cached.data, cache: 'hit', fetchedAt: cachedAt };

    try {
      const data = await fetchRawg(path, query);
      const serializedBytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (serializedBytes <= MAX_CACHE_BYTES) {
        const now = Date.now();
        await cacheRef.set({
          path,
          query,
          data,
          fetchedAt: FieldValue.serverTimestamp(),
          fetchedAtMs: now,
          expiresAtMs: now + rawgCacheTtl(path),
          sizeBytes: serializedBytes,
        });
        return { data, cache: 'refresh', fetchedAt: now };
      }
      return { data, cache: 'too-large', fetchedAt: Date.now() };
    } catch (error) {
      if (cached?.data != null) {
        console.warn(`RAWG unavailable; serving stale cache for ${path}:`, error?.message ?? error);
        return { data: cached.data, cache: 'stale', fetchedAt: cachedAt };
      }
      console.error(`RAWG unavailable and cache empty for ${path}:`, error?.message ?? error);
      throw new HttpsError('unavailable', 'RAWG is unavailable and no cached response exists.');
    }
  }
);

function isExpoPushToken(value) {
  return typeof value === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value);
}

async function claimEvent(eventId) {
  if (!eventId) return true;
  try {
    await db.collection('notification_events').doc(eventId).create({ createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch (error) {
    if (error?.code === 6 || error?.code === 'already-exists') return false;
    throw error;
  }
}

async function sendPushToUser(uid, content) {
  if (!uid) return;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;

  const user = userSnap.data();
  if (user.notificationsEnabled === false) return;
  const tokens = [...new Set((user.expoPushTokens ?? []).filter(isExpoPushToken))];
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: content.title,
    body: content.body,
    data: content.data ?? {},
    priority: 'high',
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo push request failed: ${response.status}`);

  const result = await response.json();
  const tickets = Array.isArray(result.data) ? result.data : [result.data];
  const invalidTokens = tokens.filter((_, index) => tickets[index]?.details?.error === 'DeviceNotRegistered');
  if (invalidTokens.length > 0) {
    await userRef.update({ expoPushTokens: FieldValue.arrayRemove(...invalidTokens) });
  }
}

async function getPseudo(uid, fallback) {
  if (!uid) return fallback;
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data().pseudo || fallback) : fallback;
}

async function localizedContent(uid, french, english) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists && snap.data().notificationLanguage === 'en' ? english : french;
}

exports.onFriendRequestCreated = onDocumentCreated(
  { document: 'friend_requests/{requestId}', region: REGION },
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== 'pending' || !(await claimEvent(event.id))) return;
    const pseudo = await getPseudo(request.fromUid, 'Quelqu’un');
    const content = await localizedContent(request.toUid,
      { title: '👥 Demande d’ami', body: `${pseudo} vous a envoyé une demande d’ami.` },
      { title: '👥 Friend request', body: `${pseudo} sent you a friend request.` });
    await sendPushToUser(request.toUid, { ...content, data: { route: '/friends' } });
  }
);

exports.onFriendRequestUpdated = onDocumentUpdated(
  { document: 'friend_requests/{requestId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.status === after.status || !['accepted', 'rejected'].includes(after.status)) return;
    if (!(await claimEvent(event.id))) return;

    const pseudo = await getPseudo(after.toUid, 'Quelqu’un');
    const accepted = after.status === 'accepted';
    const content = accepted
      ? await localizedContent(after.fromUid,
          { title: '🎉 Demande acceptée !', body: `${pseudo} a accepté votre demande d’ami.` },
          { title: '🎉 Request accepted!', body: `${pseudo} accepted your friend request.` })
      : await localizedContent(after.fromUid,
          { title: 'Demande refusée', body: `${pseudo} a refusé votre demande d’ami.` },
          { title: 'Request declined', body: `${pseudo} declined your friend request.` });
    await sendPushToUser(after.fromUid, { ...content, data: { route: '/friends' } });
  }
);

exports.onRatingCreated = onDocumentCreated(
  { document: 'ratings/{userId}/games/{gameId}', region: REGION },
  async (event) => {
    const rating = event.data?.data();
    const userId = event.params.userId;
    if (!rating || !(await claimEvent(event.id))) return;

    const [sent, received, pseudo] = await Promise.all([
      db.collection('friend_requests').where('fromUid', '==', userId).where('status', '==', 'accepted').get(),
      db.collection('friend_requests').where('toUid', '==', userId).where('status', '==', 'accepted').get(),
      getPseudo(userId, 'Un ami'),
    ]);
    const friendUids = new Set([
      ...sent.docs.map((doc) => doc.data().toUid),
      ...received.docs.map((doc) => doc.data().fromUid),
    ]);
    const gameName = rating.name || rating.gameName || 'un jeu';

    await Promise.all([...friendUids].map(async (friendUid) => {
      const content = await localizedContent(friendUid,
        { title: '🎮 Activité de tes amis', body: `${pseudo} vient de noter « ${gameName} ».` },
        { title: '🎮 Friend activity', body: `${pseudo} just rated “${gameName}”.` });
      await sendPushToUser(friendUid, {
        ...content,
        data: { route: `/game/${event.params.gameId}` },
      });
    }));
  }
);
