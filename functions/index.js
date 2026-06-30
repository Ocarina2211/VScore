const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
