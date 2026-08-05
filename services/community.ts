/** Restore ALL user data from Firestore to local storage (profil, xp, top3, lists, ratings) */
export async function restoreAllUserDataFromCloud(): Promise<void> {
  try {
    const uid = getUid();
    // Profil, XP, Top3
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const remoteUpdatedAt = data.updatedAt?.toMillis?.() ?? 0;
      const localProfile: any = (await loadData(USER_KEYS.profile)) ?? {};
      const localUpdatedAt = localProfile._updatedAt ?? 0;
      const newProfile = {
        ...localProfile,
        pseudo: data.pseudo ?? localProfile.pseudo ?? 'PSEUDO',
        avatarUri: data.avatarUri || localProfile.avatarUri || '',
        _updatedAt: remoteUpdatedAt,
      };
      await saveData(USER_KEYS.profile, newProfile);
      // XP: always take the highest value (never go down)
      const remoteXp = typeof data.xp === 'number' ? data.xp : 0;
      const localXp: number = (await loadData(USER_KEYS.xp)) ?? 0;
      await saveData(USER_KEYS.xp, Math.max(localXp, remoteXp));
      // Top3 and Lists: only restore from remote if remote is strictly newer than local
      if (remoteUpdatedAt > localUpdatedAt) {
        await saveData(USER_KEYS.top3, Array.isArray(data.top3) ? data.top3 : []);
        await saveData(USER_KEYS.lists, Array.isArray(data.lists) ? data.lists : []);
      }
    }
    // Ratings
    const ratingsSnap = await getDocsFromServer(collection(db, 'ratings', uid, 'games'));
    if (!ratingsSnap.empty) {
      const localRatings: any[] = await loadData(USER_KEYS.ratings) || [];
      const serverRatings = ratingsSnap.docs.map((d) => {
        const data = d.data();
        const local = localRatings.find((r: any) => r.id === Number(d.id));
        return {
          id: Number(d.id),
          name: data.name ?? '',
          background_image: data.background_image ?? '',
          general: data.general ?? 0,
          graphics: data.graphics ?? 0,
          gameplay: data.gameplay ?? 0,
          story: data.story ?? 0,
          lifespan: data.lifespan ?? 0,
          avg: data.avg ?? 0,
          completed: data.completed ?? false,
          comment: data.comment ?? local?.comment,
          hoursPlayed: data.hoursPlayed ?? local?.hoursPlayed,
          ratedAt: local?.ratedAt,
          synced: true,
        };
      });
      await saveData(USER_KEYS.ratings, serverRatings);
    }
  } catch (e) {
    // console.warn('restoreAllUserDataFromCloud failed:', e);
  }
}
/**
 * community.ts — Firestore interactions for shared community data.
 *
 * Firestore structure:
 *   ratings/{uid}/games/{gameId}  → individual rating doc
 *   game_stats/{gameId}           → aggregated stats (avg, count, name, image)
 *   users/{uid}                   → public profile (pseudo, avatarUri, xp, top3, pseudoLower)
 *   friend_requests/{fromUid_toUid} → { fromUid, toUid, status, createdAt }
 */

import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocFromServer,
    getDocs,
    getDocsFromServer,
    limit,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { gameNameLookupCandidates, normalizeGameName } from './gameIdentity';
import { loadData, saveData, USER_KEYS } from './storage';

// ─── Auth ────────────────────────────────────────────────────────────────────

export function getUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return uid;
}

// ─── Save a rating and update aggregated stats ───────────────────────────────

export interface RatingPayload {
  gameId: number;
  gameName: string;
  gameImage: string;
  general: number;
  graphics: number;
  gameplay: number;
  story: number;
  lifespan: number;
  completed?: boolean;
  comment?: string;
  hoursPlayed?: string;
}

export async function syncRatingToFirestore(payload: RatingPayload): Promise<boolean> {
  try {
    const uid = getUid();
    const { gameId, gameName, gameImage, completed, comment, hoursPlayed, ...scores } = payload;
    const avg = (scores.general + scores.graphics + scores.gameplay + scores.lifespan) / 4;

    // Read old rating BEFORE writing, to detect new vs update and compute deltas
    const ratingRef = doc(db, 'ratings', uid, 'games', String(gameId));
    const oldRatingSnap = await getDoc(ratingRef);
    const isNewRating = !oldRatingSnap.exists();
    const oldData = isNewRating ? null : oldRatingSnap.data();
    const oldCompleted: boolean = oldData?.completed ?? false;
    const completedDelta = (completed ? 1 : 0) - (oldCompleted ? 1 : 0);

    // Write individual rating (include name + image so friends can see it)
    await setDoc(ratingRef, {
      ...scores,
      avg,
      name: gameName,
      nameKey: normalizeGameName(gameName),
      background_image: gameImage,
      completed: completed ?? false,
      ...(comment ? { comment } : {}),
      ...(hoursPlayed ? { hoursPlayed } : {}),
      updatedAt: serverTimestamp(),
    });

    // Update aggregated game_stats atomically
    const statsRef = doc(db, 'game_stats', String(gameId));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statsRef);
      if (!snap.exists()) {
        // First rating ever for this game across all users
        tx.set(statsRef, {
          gameId,
          name: gameName,
          nameKey: normalizeGameName(gameName),
          background_image: gameImage,
          totalScore: avg,
          count: 1,
          avgScore: avg,
          totalGeneral: scores.general,
          totalGraphics: scores.graphics,
          totalGameplay: scores.gameplay,
          totalStory: scores.story,
          totalLifespan: scores.lifespan,
          avgGeneral: scores.general,
          avgGraphics: scores.graphics,
          avgGameplay: scores.gameplay,
          avgStory: scores.story,
          avgLifespan: scores.lifespan,
          totalCompleted: completed ? 1 : 0,
          completedPercent: completed ? 100 : 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = snap.data();
        // Only increment count for genuinely new ratings, not re-syncs or edits
        const newCount = isNewRating ? data.count + 1 : data.count;
        // For updates: subtract old scores then add new ones; for new: just add
        const oldAvg    = oldData?.avg      ?? 0;
        const oldGen    = oldData?.general  ?? 0;
        const oldGfx    = oldData?.graphics ?? 0;
        const oldPlay   = oldData?.gameplay ?? 0;
        const oldStory  = oldData?.story    ?? 0;
        const oldLife   = oldData?.lifespan ?? 0;
        const newTotal         = (data.totalScore    ?? 0) - (isNewRating ? 0 : oldAvg)   + avg;
        const newTotalGeneral  = (data.totalGeneral  ?? 0) - (isNewRating ? 0 : oldGen)   + scores.general;
        const newTotalGraphics = (data.totalGraphics ?? 0) - (isNewRating ? 0 : oldGfx)   + scores.graphics;
        const newTotalGameplay = (data.totalGameplay ?? 0) - (isNewRating ? 0 : oldPlay)  + scores.gameplay;
        const newTotalStory    = (data.totalStory    ?? 0) - (isNewRating ? 0 : oldStory) + scores.story;
        const newTotalLifespan = (data.totalLifespan ?? 0) - (isNewRating ? 0 : oldLife)  + scores.lifespan;
        const safeCount = Math.max(newCount, 1);
        tx.update(statsRef, {
          totalScore: newTotal,
          count: newCount,
          avgScore: newTotal / safeCount,
          totalGeneral: newTotalGeneral,
          totalGraphics: newTotalGraphics,
          totalGameplay: newTotalGameplay,
          totalStory: newTotalStory,
          totalLifespan: newTotalLifespan,
          avgGeneral: newTotalGeneral / safeCount,
          avgGraphics: newTotalGraphics / safeCount,
          avgGameplay: newTotalGameplay / safeCount,
          avgStory: newTotalStory / safeCount,
          avgLifespan: newTotalLifespan / safeCount,
          totalCompleted: Math.max(0, (data.totalCompleted ?? 0) + completedDelta),
          completedPercent: (Math.max(0, (data.totalCompleted ?? 0) + completedDelta) / safeCount) * 100,
          name: gameName,
          nameKey: normalizeGameName(gameName),
          background_image: gameImage,
          updatedAt: serverTimestamp(),
        });
      }
    });
    return true;
  } catch (e: any) {
    // Non-blocking — local save already happened
    // console.error('🔥 Firestore sync failed:', e?.code, e?.message, e);
    return false;
  }
}

// ─── Delete a rating from Firestore ─────────────────────────────────────────

export async function deleteRatingFromFirestore(gameId: number): Promise<void> {
  try {
    const uid = getUid();
    const ratingRef = doc(db, 'ratings', uid, 'games', String(gameId));
    const oldSnap = await getDoc(ratingRef);
    if (!oldSnap.exists()) return;
    const oldData = oldSnap.data();
    const oldAvg = oldData?.avg ?? 0;
    const oldGen = oldData?.general ?? 0;
    const oldGfx = oldData?.graphics ?? 0;
    const oldPlay = oldData?.gameplay ?? 0;
    const oldStory = oldData?.story ?? 0;
    const oldLife = oldData?.lifespan ?? 0;
    const oldCompleted: boolean = oldData?.completed ?? false;

    await deleteDoc(ratingRef);

    const statsRef = doc(db, 'game_stats', String(gameId));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(statsRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const newCount = Math.max(0, (data.count ?? 0) - 1);
      if (newCount === 0) {
        tx.delete(statsRef);
        return;
      }
      const newTotal         = Math.max(0, (data.totalScore    ?? 0) - oldAvg);
      const newTotalGeneral  = Math.max(0, (data.totalGeneral  ?? 0) - oldGen);
      const newTotalGraphics = Math.max(0, (data.totalGraphics ?? 0) - oldGfx);
      const newTotalGameplay = Math.max(0, (data.totalGameplay ?? 0) - oldPlay);
      const newTotalStory    = Math.max(0, (data.totalStory    ?? 0) - oldStory);
      const newTotalLifespan = Math.max(0, (data.totalLifespan ?? 0) - oldLife);
      const totalCompleted   = Math.max(0, (data.totalCompleted ?? 0) - (oldCompleted ? 1 : 0));
      tx.update(statsRef, {
        count: newCount,
        totalScore: newTotal,
        avgScore: newTotal / newCount,
        totalGeneral: newTotalGeneral,
        totalGraphics: newTotalGraphics,
        totalGameplay: newTotalGameplay,
        totalStory: newTotalStory,
        totalLifespan: newTotalLifespan,
        avgGeneral: newTotalGeneral / newCount,
        avgGraphics: newTotalGraphics / newCount,
        avgGameplay: newTotalGameplay / newCount,
        avgStory: newTotalStory / newCount,
        avgLifespan: newTotalLifespan / newCount,
        totalCompleted,
        completedPercent: (totalCompleted / newCount) * 100,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // Non-blocking
  }
}

// ─── Fetch stats for a single game ───────────────────────────────────────────

export interface GameStats {
  avgScore: number;
  count: number;
  avgGeneral?: number;
  avgGraphics?: number;
  avgGameplay?: number;
  avgStory?: number;
  avgLifespan?: number;
  totalCompleted?: number;
  completedPercent?: number;
}

type GameStatsDocument = GameStats & {
  gameId?: number;
  name?: string;
  nameKey?: string;
  background_image?: string;
};

function combineGameStats(stats: GameStatsDocument[]): GameStats | null {
  const valid = stats.filter((entry) => (entry.count ?? 0) > 0);
  const count = valid.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
  if (count === 0) return null;
  const weighted = (field: keyof GameStats, fallback?: keyof GameStats) =>
    valid.reduce((sum, entry) => {
      const value = entry[field] ?? (fallback ? entry[fallback] : undefined) ?? 0;
      return sum + Number(value) * (entry.count ?? 0);
    }, 0) / count;
  const totalCompleted = valid.reduce((sum, entry) => sum + (entry.totalCompleted ?? 0), 0);
  return {
    count,
    avgScore: weighted('avgScore'),
    avgGeneral: weighted('avgGeneral', 'avgScore'),
    avgGraphics: weighted('avgGraphics'),
    avgGameplay: weighted('avgGameplay'),
    avgStory: weighted('avgStory'),
    avgLifespan: weighted('avgLifespan'),
    totalCompleted,
    completedPercent: (totalCompleted / count) * 100,
  };
}

export async function fetchGameStats(gameId: number, gameName = ''): Promise<GameStats | null> {
  try {
    const documents = new Map<string, GameStatsDocument>();
    const direct = await getDoc(doc(db, 'game_stats', String(gameId)));
    if (direct.exists()) documents.set(direct.id, direct.data() as GameStatsDocument);

    const nameKey = normalizeGameName(gameName);
    if (gameName && nameKey) {
      const nameCandidates = gameNameLookupCandidates(gameName);
      const [exactName, normalizedName] = await Promise.all([
        getDocs(query(collection(db, 'game_stats'), where('name', 'in', nameCandidates))),
        getDocs(query(collection(db, 'game_stats'), where('nameKey', '==', nameKey))),
      ]);
      [...exactName.docs, ...normalizedName.docs].forEach((snapshot) => {
        const data = snapshot.data() as GameStatsDocument;
        if (normalizeGameName(data.name) === nameKey) documents.set(snapshot.id, data);
      });
    }

    return combineGameStats(Array.from(documents.values()));
  } catch (e) {
    // console.warn('fetchGameStats failed:', e);
    return null;
  }
}

// ─── Fetch community top-rated games ─────────────────────────────────────────

export interface CommunityGame extends GameStats {
  gameId: number;
  name: string;
  background_image: string;
}

// ─── Fetch stats for multiple games in one query ────────────────────────────

export async function fetchBatchGameStats(
  games: Array<number | { id: number; name?: string }>
): Promise<Record<number, { avg: number; count: number }>> {
  if (games.length === 0) return {};
  try {
    const requested = games.map((game) =>
      typeof game === 'number' ? { id: game, name: '', nameKey: '' } : {
        id: game.id,
        name: game.name?.trim() ?? '',
        nameKey: normalizeGameName(game.name),
      }
    );
    const gameIds = Array.from(new Set(requested.map((game) => game.id)));
    const names = Array.from(new Set(requested.flatMap((game) => gameNameLookupCandidates(game.name))));
    const nameKeys = Array.from(new Set(requested.map((game) => game.nameKey).filter(Boolean)));
    const documents = new Map<string, GameStatsDocument>();

    // Firestore 'in' supports up to 30 values; chunk each lookup if needed.
    const chunks: number[][] = [];
    for (let i = 0; i < gameIds.length; i += 30) chunks.push(gameIds.slice(i, i + 30));
    const nameChunks: string[][] = [];
    for (let i = 0; i < names.length; i += 30) nameChunks.push(names.slice(i, i + 30));
    const keyChunks: string[][] = [];
    for (let i = 0; i < nameKeys.length; i += 30) keyChunks.push(nameKeys.slice(i, i + 30));

    const collect = async (field: 'gameId' | 'name' | 'nameKey', values: Array<number | string>) => {
      if (values.length === 0) return;
      try {
        const snapshot = await getDocs(query(collection(db, 'game_stats'), where(field, 'in', values)));
        snapshot.docs.forEach((entry) => documents.set(entry.id, entry.data() as GameStatsDocument));
      } catch {
        // One compatibility lookup failing must not hide successful ID lookups.
      }
    };
    await Promise.all([
      ...chunks.map((chunk) => collect('gameId', chunk)),
      ...nameChunks.map((chunk) => collect('name', chunk)),
      ...keyChunks.map((chunk) => collect('nameKey', chunk)),
    ]);

    const result: Record<number, { avg: number; count: number }> = {};
    requested.forEach((game) => {
      const matches = Array.from(documents.values()).filter((entry) =>
        entry.gameId === game.id || (!!game.nameKey && normalizeGameName(entry.name) === game.nameKey)
      );
      const combined = combineGameStats(matches);
      // Require at least 3 votes for a meaningful community badge.
      if (combined && combined.count >= 3) {
        result[game.id] = { avg: combined.avgGeneral ?? combined.avgScore, count: combined.count };
      }
    });
    return result;
  } catch (e) {
    return {};
  }
}

export async function fetchCommunityTopRated(
  minVotes = 1,
  maxResults = 20
): Promise<CommunityGame[]> {
  try {
    const q = query(
      collection(db, 'game_stats'),
      where('count', '>=', minVotes),
      orderBy('count', 'desc'),
      limit(60) // fetch a larger pool to allow shuffling for variety
    );
    const snap = await getDocs(q);
    const groups = new Map<string, GameStatsDocument[]>();
    snap.docs.forEach((snapshot) => {
      const data = snapshot.data() as GameStatsDocument;
      const key = normalizeGameName(data.name) || `id:${data.gameId ?? snapshot.id}`;
      groups.set(key, [...(groups.get(key) ?? []), data]);
    });
    const results: CommunityGame[] = Array.from(groups.values()).flatMap((entries) => {
      const combined = combineGameStats(entries);
      if (!combined) return [];
      const representative = [...entries].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
      return [{
        ...combined,
        gameId: representative.gameId ?? 0,
        name: representative.name ?? '',
        background_image: representative.background_image ?? '',
      }];
    });
    // Sort by avgScore desc to build a pool of the best-rated games
    const sorted = results.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    // Weighted random selection: higher avgScore → higher probability of appearing
    const pool = sorted.map((game) => ({
      game,
      weight: Math.pow(Math.max(0, game.avgScore ?? 0), 2) + 1,
    }));
    const selected: CommunityGame[] = [];
    const pickCount = Math.min(maxResults, pool.length);
    for (let i = 0; i < pickCount; i++) {
      const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
      let r = Math.random() * totalWeight;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        r -= pool[j].weight;
        if (r <= 0) { idx = j; break; }
      }
      selected.push(pool[idx].game);
      pool.splice(idx, 1);
    }
    return selected;
  } catch (e) {
    // console.warn('fetchCommunityTopRated failed:', e);
    return [];
  }
}

// ─── Friend System ────────────────────────────────────────────────────────────

export interface PublicProfile {
  uid: string;
  pseudo: string;
  pseudoLower?: string;
  avatarUri?: string;
  xp: number;
  top3?: any[];
  memberSince?: any;
}

export type RelationStatus = 'none' | 'friends' | 'sent' | 'received';

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: any;
  profile?: PublicProfile;
}

export interface FeedItem {
  uid: string;
  pseudo: string;
  avatarUri?: string;
  gameId: string;
  gameName: string;
  gameImage: string;
  general: number;
  updatedAt: number;
  comment?: string;
}

/** Sync the current user's public profile to Firestore */
export async function syncPublicProfile(
  pseudo: string,
  avatarUri: string | null,
  xp: number,
  top3?: any[],
  lists?: any[]
): Promise<void> {
  try {
    const uid = getUid();
    const userRef = doc(db, 'users', uid);
    // Read from server (not cache) to get the real current XP before writing
    const serverSnap = await getDocFromServer(userRef);
    const serverXp: number = serverSnap.exists() ? (serverSnap.data().xp ?? 0) : 0;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const currentXp: number = Math.max(snap.exists() ? (snap.data().xp ?? 0) : 0, serverXp);
      const data: Record<string, any> = {
        pseudo,
        pseudoLower: pseudo.toLowerCase(),
        xp: Math.max(xp, currentXp), // XP never goes down
        verified: true,
        updatedAt: serverTimestamp(),
      };
      if (avatarUri) data.avatarUri = avatarUri;
      if (top3 !== undefined) data.top3 = top3;
      if (lists !== undefined) data.lists = lists;
      tx.set(userRef, data, { merge: true });
    });
  } catch (e) {
    // console.warn('syncPublicProfile error:', e);
  }
}

/** Search users by pseudo prefix (case-insensitive), excluding self */
/** Check if a pseudo is already taken by another user */
export async function isPseudoTaken(pseudo: string, currentUid: string): Promise<boolean> {
  try {
    const q = pseudo.trim().toLowerCase();
    const snap = await getDocs(
      query(collection(db, 'users'), where('pseudoLower', '==', q), limit(2))
    );
    return snap.docs.some((d) => d.id !== currentUid);
  } catch {
    return false; // fail open to avoid blocking account creation
  }
}

export async function searchUsersByPseudo(
  search: string,
  currentUid: string
): Promise<PublicProfile[]> {
  if (search.trim().length < 2) return [];
  const q = search.trim().toLowerCase();
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('pseudoLower', '>=', q),
        where('pseudoLower', '<=', q + '\uf8ff'),
        limit(20)
      )
    );
    return snap.docs
      .filter((d) => d.id !== currentUid)
      .map((d) => ({ uid: d.id, ...d.data() } as PublicProfile));
  } catch (e) {
    // console.error('searchUsersByPseudo error:', JSON.stringify(e));
    return [];
  }
}

/** Get a single user's public profile */
export async function getUserPublicProfile(uid: string): Promise<PublicProfile | null> {
  try {
    
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() } as PublicProfile;
  } catch (e) {
    return null;
  }
}

/** Get the global leaderboard (users sorted by XP descending) */
export async function getGlobalLeaderboard(maxUsers = 100): Promise<PublicProfile[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        orderBy('xp', 'desc'),
        limit(maxUsers * 3) // fetch more to allow dedup
      )
    );
    // Filtrer les profils incomplets ou orphelins (pas de pseudo ou xp invalide)
    const all = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() } as PublicProfile))
      .filter((u) => typeof u.pseudo === 'string' && u.pseudo.length > 0 && typeof u.xp === 'number' && u.xp >= 0);
    // Deduplicate by pseudo (case-insensitive): keep highest XP per pseudo
    const seen = new Map<string, PublicProfile>();
    for (const u of all) {
      const key = (u.pseudoLower ?? u.pseudo?.toLowerCase() ?? u.uid);
      if (!seen.has(key)) seen.set(key, u); // already sorted by xp desc, first = highest
    }
    return Array.from(seen.values()).slice(0, maxUsers);
  } catch (e) {
    return [];
  }
}

/** Get a user's rated games from Firestore */
export async function getUserPublicRatings(uid: string): Promise<any[]> {
  try {
    
    const snap = await getDocs(collection(db, 'ratings', uid, 'games'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/** Send a friend request (idempotent — doc id = fromUid_toUid) */
export async function sendFriendRequest(toUid: string): Promise<void> {
  const fromUid = getUid();
  const reqId = `${fromUid}_${toUid}`;
  await setDoc(doc(db, 'friend_requests', reqId), {
    fromUid,
    toUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

/** Cancel a sent friend request */
export async function cancelFriendRequest(toUid: string): Promise<void> {
  const fromUid = getUid();
  await deleteDoc(doc(db, 'friend_requests', `${fromUid}_${toUid}`));
}

/** Accept a received friend request */
export async function acceptFriendRequest(fromUid: string): Promise<void> {
  const toUid = getUid();
  await updateDoc(doc(db, 'friend_requests', `${fromUid}_${toUid}`), {
    status: 'accepted',
  });
}

/** Decline a received friend request */
export async function declineFriendRequest(fromUid: string): Promise<void> {
  const toUid = getUid();
  await updateDoc(doc(db, 'friend_requests', `${fromUid}_${toUid}`), {
    status: 'rejected',
  });
}

/** Remove a friend (delete the accepted request doc in either direction) */
export async function removeFriend(friendUid: string): Promise<void> {
  const myUid = getUid();
  const id1 = `${myUid}_${friendUid}`;
  const id2 = `${friendUid}_${myUid}`;
  const [s1, s2] = await Promise.all([
    getDoc(doc(db, 'friend_requests', id1)),
    getDoc(doc(db, 'friend_requests', id2)),
  ]);
  if (s1.exists()) await deleteDoc(doc(db, 'friend_requests', id1));
  if (s2.exists()) await deleteDoc(doc(db, 'friend_requests', id2));
}

/** Get the relationship status between the current user and another user */
export async function getRelationStatus(otherUid: string): Promise<RelationStatus> {
  const myUid = getUid();
  const id1 = `${myUid}_${otherUid}`;
  const id2 = `${otherUid}_${myUid}`;
  const [s1, s2] = await Promise.all([
    getDoc(doc(db, 'friend_requests', id1)),
    getDoc(doc(db, 'friend_requests', id2)),
  ]);
  if (s1.exists()) {
    const st = s1.data()!.status;
    if (st === 'accepted') return 'friends';
    if (st === 'pending') return 'sent';
  }
  if (s2.exists()) {
    const st = s2.data()!.status;
    if (st === 'accepted') return 'friends';
    if (st === 'pending') return 'received';
  }
  return 'none';
}

/** Helper — fetch profiles and attach to a list of FriendRequest docs */
async function attachProfiles(requests: FriendRequest[], myUid: string): Promise<void> {
  await Promise.all(
    requests.map(async (req) => {
      const otherUid = req.fromUid === myUid ? req.toUid : req.fromUid;
      req.profile = (await getUserPublicProfile(otherUid)) ?? undefined;
    })
  );
}

/** Get all accepted friends */
export async function getFriends(): Promise<FriendRequest[]> {
  try {
    const myUid = getUid();
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(db, 'friend_requests'), where('fromUid', '==', myUid))),
      getDocs(query(collection(db, 'friend_requests'), where('toUid', '==', myUid))),
    ]);
    const all: FriendRequest[] = [
      ...sentSnap.docs
        .filter((d) => d.data().status === 'accepted')
        .map((d) => ({ id: d.id, ...d.data() } as FriendRequest)),
      ...receivedSnap.docs
        .filter((d) => d.data().status === 'accepted')
        .map((d) => ({ id: d.id, ...d.data() } as FriendRequest)),
    ];
    await attachProfiles(all, myUid);
    return all;
  } catch (e) {
    // console.warn('getFriends error:', e);
    return [];
  }
}

/** Get pending sent requests */
export async function getSentRequests(): Promise<FriendRequest[]> {
  try {
    const myUid = getUid();
    const snap = await getDocs(
      query(collection(db, 'friend_requests'), where('fromUid', '==', myUid))
    );
    const all: FriendRequest[] = snap.docs
      .filter((d) => d.data().status === 'pending')
      .map((d) => ({ id: d.id, ...d.data() } as FriendRequest));
    await attachProfiles(all, myUid);
    return all;
  } catch (e) {
    return [];
  }
}

/** Get pending received requests */
export async function getReceivedRequests(): Promise<FriendRequest[]> {
  try {
    const myUid = getUid();
    const snap = await getDocs(
      query(collection(db, 'friend_requests'), where('toUid', '==', myUid))
    );
    const all: FriendRequest[] = snap.docs
      .filter((d) => d.data().status === 'pending')
      .map((d) => ({ id: d.id, ...d.data() } as FriendRequest));
    await attachProfiles(all, myUid);
    return all;
  } catch (e) {
    return [];
  }
}

/** Get a feed of recent ratings from all friends (last 30 items across friends) */
export async function getFriendsFeed(maxPerFriend = 5): Promise<FeedItem[]> {
  try {
    const friends = await getFriends();
    if (friends.length === 0) return [];

    const allItems: FeedItem[] = [];

    await Promise.all(
      friends.map(async (f) => {
        const friendUid = f.profile?.uid;
        if (!friendUid) return;
        try {
          const snap = await getDocs(
            query(
              collection(db, 'ratings', friendUid, 'games'),
              orderBy('updatedAt', 'desc'),
              limit(maxPerFriend)
            )
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            allItems.push({
              uid: friendUid,
              pseudo: f.profile?.pseudo ?? '?',
              avatarUri: f.profile?.avatarUri,
              gameId: d.id,
              gameName: data.name ?? '',
              gameImage: data.background_image ?? '',
              general: data.general ?? 0,
              updatedAt: data.updatedAt?.toMillis?.() ?? 0,
              comment: data.comment,
            });
          });
        } catch {}
      })
    );

    return allItems.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  } catch {
    return [];
  }
}

export interface FriendTopGame {
  id: number;
  name: string;
  background_image: string;
  likedByCount: number;
  likedByPseudos: string[];
}

/** Get games that friends rated >= minScore, sorted by how many friends liked them */
export async function getFriendsTopGames(
  minScore = 1,
  maxResults = 30
): Promise<FriendTopGame[]> {
  try {
    const friends = await getFriends();
    if (friends.length === 0) return [];

    const myUid = getUid();
    const gameMap = new Map<string, { id: number; name: string; background_image: string; pseudos: string[] }>();

    await Promise.all(
      friends.map(async (f) => {
        const friendUid = f.fromUid === myUid ? f.toUid : f.fromUid;
        const pseudo = f.profile?.pseudo ?? '?';
        // Reuse getUserPublicRatings which is confirmed to work
        const ratings = await getUserPublicRatings(friendUid);
        ratings
          .filter((r) => (r.general ?? 0) >= minScore)
          .forEach((r) => {
            const key = String(r.id);
            const existing = gameMap.get(key);
            if (existing) {
              existing.pseudos.push(pseudo);
            } else {
              gameMap.set(key, {
                id: Number(r.id),
                name: r.name ?? '',
                background_image: r.background_image ?? '',
                pseudos: [pseudo],
              });
            }
          });
      })
    );

    const raw = Array.from(gameMap.values())
      .sort((a, b) => b.pseudos.length - a.pseudos.length)
      .slice(0, maxResults);

    // Patch missing name/image from game_stats (for ratings created before these fields were stored)
    const missingIds = raw.filter((g) => !g.name).map((g) => g.id);
    if (missingIds.length > 0) {
      // fetchBatchGameStats only returns avgScore; get full stats docs for name/image
      const chunks: number[][] = [];
      for (let i = 0; i < missingIds.length; i += 30) chunks.push(missingIds.slice(i, i + 30));
      await Promise.all(chunks.map(async (chunk) => {
        try {
          const snap = await getDocs(
            query(collection(db, 'game_stats'), where('gameId', 'in', chunk))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const entry = raw.find((g) => g.id === data.gameId);
            if (entry && !entry.name) {
              entry.name = data.name ?? '';
              entry.background_image = data.background_image ?? '';
            }
          });
        } catch {}
      }));
    }

    return raw.map(({ id, name, background_image, pseudos }) => ({
      id,
      name,
      background_image,
      likedByCount: pseudos.length,
      likedByPseudos: pseudos,
    }));
  } catch {
    return [];
  }
}

// ─── Pull ratings from Firestore → AsyncStorage (multi-device sync) ──────────

/**
 * Pulls ratings from Firestore and merges them into local AsyncStorage.
 * Firestore wins when its updatedAt is newer; local wins when local is newer.
 * Call after successful sign-in on a new device.
 */
export async function syncRatingsFromFirestore(): Promise<void> {
  try {
    const uid = getUid();
    // Force server read to bypass stale Firestore cache on new devices
    const snap = await getDocsFromServer(collection(db, 'ratings', uid, 'games'));
    if (snap.empty) return;

    // Build a map of remote ratings keyed by gameId (number)
    const remoteMap = new Map<number, any>();
    snap.docs.forEach((d) => {
      const data = d.data();
      const gameId = Number(d.id);
      remoteMap.set(gameId, {
        id: gameId,
        name: data.name ?? '',
        background_image: data.background_image ?? '',
        general: data.general ?? 0,
        graphics: data.graphics ?? 0,
        gameplay: data.gameplay ?? 0,
        story: data.story ?? 0,
        lifespan: data.lifespan ?? 0,
        avg: data.avg ?? 0,
        completed: data.completed ?? false,
        comment: data.comment,
        hoursPlayed: data.hoursPlayed,
        // updatedAt in ms (for conflict resolution)
        _updatedAt: data.updatedAt?.toMillis?.() ?? 0,
      });
    });

    const localRatings: any[] = (await loadData(USER_KEYS.ratings)) ?? [];
    const localMap = new Map<number, any>();
    localRatings.forEach((r) => localMap.set(Number(r.id), r));

    // Merge: for each remote entry, keep the newer version
    remoteMap.forEach((remote, gameId) => {
      const local = localMap.get(gameId);
      const localUpdatedAt = local?._updatedAt ?? local?.updatedAt ?? 0;
      if (!local || remote._updatedAt > localUpdatedAt) {
        // Remote is newer — use it (strip internal _updatedAt before saving)
        // Preserve fields that may be missing in remote but present locally (e.g. hoursPlayed, comment, ratedAt)
        const { _updatedAt, ...remoteClean } = remote;
        localMap.set(gameId, {
          ...remoteClean,
          hoursPlayed: remoteClean.hoursPlayed ?? local?.hoursPlayed ?? null,
          comment: remoteClean.comment ?? local?.comment,
          ratedAt: local?.ratedAt,
          synced: true,
        });
      }
    });

    const merged = Array.from(localMap.values());
    await saveData(USER_KEYS.ratings, merged);

    // Upload any local ratings not yet on Firestore (created offline)
    const unsynced = merged.filter((r) => !r.synced && r.id && r.general);
    for (const r of unsynced) {
      await syncRatingToFirestore({
        gameId: r.id,
        gameName: r.name ?? '',
        gameImage: r.background_image ?? '',
        general: r.general ?? 0,
        graphics: r.graphics ?? 0,
        gameplay: r.gameplay ?? 0,
        story: r.story ?? 0,
        lifespan: r.lifespan ?? 0,
        completed: r.completed ?? false,
        comment: r.comment,
      }).catch(() => {});
    }
  } catch (e) {
    // console.warn('syncRatingsFromFirestore failed:', e);
  }
}

/**
 * Pull profile (pseudo, avatarUri, xp, top3) from Firestore → AsyncStorage.
 * Uses Firestore data when local is missing or Firestore is newer.
 */
export async function syncProfileFromFirestore(): Promise<void> {
  try {
    const uid = getUid();
    // Force server read to bypass stale Firestore cache
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (!snap.exists()) return;

    const remote = snap.data();
    const remoteUpdatedAt: number = remote.updatedAt?.toMillis?.() ?? 0;

    const localProfile: any = (await loadData(USER_KEYS.profile)) ?? {};
    const localXp: number = (await loadData(USER_KEYS.xp)) ?? 0;
    const localTop3: any[] = (await loadData(USER_KEYS.top3)) ?? [];
    const localUpdatedAt: number = localProfile._updatedAt ?? 0;

    // Use Firestore if local has no profile OR remote is newer
    if (remoteUpdatedAt > localUpdatedAt || !localProfile.pseudo) {
      const newProfile: any = {
        ...localProfile,
        pseudo: remote.pseudo ?? localProfile.pseudo ?? 'PSEUDO',
        avatarUri: remote.avatarUri || localProfile.avatarUri || '',
        _updatedAt: remoteUpdatedAt,
      };
      await saveData(USER_KEYS.profile, newProfile);
      // XP: always take max (never go down)
      const remoteXp: number = remote.xp ?? 0;
      await saveData(USER_KEYS.xp, Math.max(remoteXp, localXp));
      // Top3: always restore from Firestore if remote is newer and existe
      if (Array.isArray(remote.top3)) {
        await saveData(USER_KEYS.top3, remote.top3);
      }
    }
  } catch (e) {
    // console.warn('syncProfileFromFirestore failed:', e);
  }
}

/**
 * Save game lists (wishlist/backlog/playing) to Firestore under users/{uid}.lists
 */
export async function syncListsToFirestore(lists: any[]): Promise<void> {
  try {
    const uid = getUid();
    await setDoc(doc(db, 'users', uid), { lists }, { merge: true });
  } catch (e) {
    // console.warn('syncListsToFirestore failed:', e);
  }
}

/**
 * Pull game lists from Firestore → AsyncStorage.
 * Only overwrites local if local is empty.
 */
export async function syncListsFromFirestore(): Promise<void> {
  try {
    const uid = getUid();
    const localLists: any[] = (await loadData(USER_KEYS.lists)) ?? [];
    if (localLists.length > 0) return; // local has data, don't overwrite

    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;

    const remoteLists = snap.data()?.lists;
    if (Array.isArray(remoteLists) && remoteLists.length > 0) {
      await saveData(USER_KEYS.lists, remoteLists);
    }
  } catch (e) {
    // console.warn('syncListsFromFirestore failed:', e);
  }
}
