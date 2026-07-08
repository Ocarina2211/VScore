const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RAWG_API_KEY = defineSecret('RAWG_API_KEY');
const STEAM_API_KEY = defineSecret('STEAM_API_KEY');
const DEEPL_API_KEY = defineSecret('DEEPL_API_KEY');

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

exports.rawgRequest = onCall({ region: REGION, secrets: [RAWG_API_KEY] }, async (request) => {
  const path = request.data?.path;
  const params = request.data?.params ?? {};
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
    throw new HttpsError('invalid-argument', 'Invalid RAWG path.');
  }

  const url = new URL(`https://api.rawg.io/api${path}`);
  url.searchParams.set('key', RAWG_API_KEY.value());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) throw new HttpsError('unavailable', `RAWG request failed: ${response.status}`);
  return response.json();
});

exports.translateText = onCall({ region: REGION, secrets: [DEEPL_API_KEY] }, async (request) => {
  const text = String(request.data?.text ?? '').slice(0, 500);
  if (!text) return { text: '' };

  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text], target_lang: 'FR', source_lang: 'EN' }),
  });
  if (!response.ok) throw new HttpsError('unavailable', `DeepL request failed: ${response.status}`);

  const data = await response.json();
  return { text: data?.translations?.[0]?.text ?? text };
});

exports.steamRequest = onCall({ region: REGION, secrets: [STEAM_API_KEY] }, async (request) => {
  const operation = request.data?.operation;
  const steamId = String(request.data?.steamId ?? '');
  const vanityName = String(request.data?.vanityName ?? '');
  const key = STEAM_API_KEY.value();

  if (operation === 'resolveVanityUrl') {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanityName)}`;
    const response = await fetch(url);
    if (!response.ok) throw new HttpsError('unavailable', `Steam request failed: ${response.status}`);
    const json = await response.json();
    return { steamId: json.response?.success === 1 ? json.response.steamid : null };
  }

  if (operation === 'getPlayerName') {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${encodeURIComponent(steamId)}`;
    const response = await fetch(url);
    if (!response.ok) throw new HttpsError('unavailable', `Steam request failed: ${response.status}`);
    const json = await response.json();
    return { name: json.response?.players?.[0]?.personaname ?? null };
  }

  if (operation === 'getOwnedGames') {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new HttpsError('unavailable', `Steam request failed: ${response.status}`);
    const json = await response.json();
    const games = json.response?.games ?? [];
    return {
      games: games.map((game) => ({
        appid: game.appid,
        name: game.name,
        playtime_forever: game.playtime_forever ?? 0,
        img_icon_url: game.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
          : '',
      })),
    };
  }

  throw new HttpsError('invalid-argument', 'Invalid Steam operation.');
});

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
