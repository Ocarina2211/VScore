const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(value) {
  return typeof value === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value);
}

async function claimEvent(eventId) {
  if (!eventId) return true;
  const eventRef = db.collection('notification_events').doc(eventId);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(eventRef);
    if (snapshot.exists) {
      const data = snapshot.data();
      // Documents from the previous implementation are completed claims.
      if (!data.status || data.status === 'completed') {
        if (!data.expiresAt) {
          tx.set(eventRef, {
            expiresAt: Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
          }, { merge: true });
        }
        return false;
      }
      if ((data.leaseUntil?.toMillis?.() ?? 0) > now) return false;
    }
    tx.set(eventRef, {
      status: 'processing',
      createdAt: snapshot.exists ? (snapshot.data().createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
      leaseUntil: Timestamp.fromMillis(now + 5 * 60 * 1000),
      expiresAt: Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
    }, { merge: true });
    return true;
  });
}

async function completeEvent(eventId) {
  if (!eventId) return;
  await db.collection('notification_events').doc(eventId).set({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    leaseUntil: FieldValue.delete(),
  }, { merge: true });
}

async function releaseEvent(eventId) {
  if (!eventId) return;
  await db.collection('notification_events').doc(eventId).delete();
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
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Expo push request failed: ${response.status}`);

  let result;
  try {
    result = await response.json();
  } catch {
    // A 2xx response means Expo accepted the batch. Retrying merely because its
    // response body was unreadable would send every notification twice.
    return;
  }
  const tickets = Array.isArray(result.data) ? result.data : [result.data];
  const invalidTokens = tokens.filter((_, index) => tickets[index]?.details?.error === 'DeviceNotRegistered');
  if (invalidTokens.length > 0) {
    await userRef.update({ expoPushTokens: FieldValue.arrayRemove(...invalidTokens) }).catch((error) => {
      console.warn('Unable to remove invalid Expo push tokens', error instanceof Error ? error.message : error);
    });
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

async function deleteRatingAndAggregate(uid, gameId) {
  const ratingRef = db.collection('ratings').doc(uid).collection('games').doc(gameId);
  const statsRef = db.collection('game_stats').doc(gameId);
  await db.runTransaction(async (tx) => {
    const [ratingSnap, statsSnap] = await Promise.all([
      tx.get(ratingRef),
      tx.get(statsRef),
    ]);
    if (!ratingSnap.exists) return;

    const rating = ratingSnap.data();
    tx.delete(ratingRef);
    if (!statsSnap.exists) return;

    const stats = statsSnap.data();
    const count = Math.max(0, (stats.count ?? 0) - 1);
    if (count === 0) {
      tx.delete(statsRef);
      return;
    }
    const subtract = (total, value) => Math.max(0, (total ?? 0) - (value ?? 0));
    const ratingAverage = Number.isFinite(rating.avg)
      ? rating.avg
      : ((rating.general ?? 0) + (rating.graphics ?? 0) + (rating.gameplay ?? 0) + (rating.lifespan ?? 0)) / 4;
    const totalScore = subtract(stats.totalScore, ratingAverage);
    const totalGeneral = subtract(stats.totalGeneral, rating.general);
    const totalGraphics = subtract(stats.totalGraphics, rating.graphics);
    const totalGameplay = subtract(stats.totalGameplay, rating.gameplay);
    const totalStory = subtract(stats.totalStory, rating.story);
    const totalLifespan = subtract(stats.totalLifespan, rating.lifespan);
    const totalCompleted = Math.max(0, (stats.totalCompleted ?? 0) - (rating.completed ? 1 : 0));
    tx.update(statsRef, {
      count,
      totalScore,
      avgScore: totalScore / count,
      totalGeneral,
      avgGeneral: totalGeneral / count,
      totalGraphics,
      avgGraphics: totalGraphics / count,
      totalGameplay,
      avgGameplay: totalGameplay / count,
      totalStory,
      avgStory: totalStory / count,
      totalLifespan,
      avgLifespan: totalLifespan / count,
      totalCompleted,
      completedPercent: (totalCompleted / count) * 100,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function deleteDocumentsInBatches(documents) {
  for (let index = 0; index < documents.length; index += 400) {
    const batch = db.batch();
    documents.slice(index, index + 400).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

exports.deleteMyAccount = onCall(
  { region: REGION, timeoutSeconds: 300 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.');

    try {
      // Remove each rating together with its contribution to game_stats.
      // Re-query to cover a rating write that was finishing as deletion began.
      for (let pass = 0; pass < 3; pass += 1) {
        const ratings = await db.collection('ratings').doc(uid).collection('games').get();
        if (ratings.empty) break;
        for (const rating of ratings.docs) await deleteRatingAndAggregate(uid, rating.id);
      }
      const remainingRating = await db.collection('ratings').doc(uid).collection('games').limit(1).get();
      if (!remainingRating.empty) throw new Error('Ratings were still being written during account deletion.');

      for (let pass = 0; pass < 2; pass += 1) {
        const [sentRequests, receivedRequests] = await Promise.all([
          db.collection('friend_requests').where('fromUid', '==', uid).get(),
          db.collection('friend_requests').where('toUid', '==', uid).get(),
        ]);
        const relations = new Map(
          [...sentRequests.docs, ...receivedRequests.docs].map((document) => [document.id, document])
        );
        if (relations.size === 0) break;
        await deleteDocumentsInBatches([...relations.values()]);
      }
      const [remainingSentRelation, remainingReceivedRelation] = await Promise.all([
        db.collection('friend_requests').where('fromUid', '==', uid).limit(1).get(),
        db.collection('friend_requests').where('toUid', '==', uid).limit(1).get(),
      ]);
      if (!remainingSentRelation.empty || !remainingReceivedRelation.empty) {
        throw new Error('Friend relations were still being written during account deletion.');
      }
      await db.collection('users').doc(uid).delete();

      await getStorage().bucket().file(`avatars/${uid}.jpg`).delete({ ignoreNotFound: true });

      await getAuth().deleteUser(uid);
      return { deleted: true };
    } catch (error) {
      console.error('Account deletion failed', error instanceof Error ? error.message : error);
      throw new HttpsError('internal', 'Account deletion failed. Please try again.');
    }
  }
);

exports.onFriendRequestCreated = onDocumentCreated(
  { document: 'friend_requests/{requestId}', region: REGION },
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== 'pending' || !(await claimEvent(event.id))) return;
    try {
      const pseudo = await getPseudo(request.fromUid, 'Quelqu’un');
      const content = await localizedContent(request.toUid,
        { title: '👥 Demande d’ami', body: `${pseudo} vous a envoyé une demande d’ami.` },
        { title: '👥 Friend request', body: `${pseudo} sent you a friend request.` });
      await sendPushToUser(request.toUid, { ...content, data: { route: '/friends' } });
      await completeEvent(event.id);
    } catch (error) {
      await releaseEvent(event.id);
      throw error;
    }
  }
);

exports.onFriendRequestUpdated = onDocumentUpdated(
  { document: 'friend_requests/{requestId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.status === after.status || !['accepted', 'rejected'].includes(after.status)) return;
    if (!(await claimEvent(event.id))) return;
    try {
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
      await completeEvent(event.id);
    } catch (error) {
      await releaseEvent(event.id);
      throw error;
    }
  }
);

exports.onRatingCreated = onDocumentCreated(
  { document: 'ratings/{userId}/games/{gameId}', region: REGION },
  async (event) => {
    const rating = event.data?.data();
    const userId = event.params.userId;
    if (!rating || !(await claimEvent(event.id))) return;
    try {
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
        const deliveryEventId = `${event.id}_${friendUid}`;
        if (!(await claimEvent(deliveryEventId))) return;
        try {
          const content = await localizedContent(friendUid,
            { title: '🎮 Activité de tes amis', body: `${pseudo} vient de noter « ${gameName} ».` },
            { title: '🎮 Friend activity', body: `${pseudo} just rated “${gameName}”.` });
          await sendPushToUser(friendUid, {
            ...content,
            data: { route: `/game/${event.params.gameId}` },
          });
          await completeEvent(deliveryEventId);
        } catch (error) {
          await releaseEvent(deliveryEventId);
          throw error;
        }
      }));
      await completeEvent(event.id);
    } catch (error) {
      await releaseEvent(event.id);
      throw error;
    }
  }
);
