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

import { isIgdbGameId } from '../constants/Games';
import { auth, db } from './firebase';
import {
  dedupeGamesByIdentity,
  gameNameLookupCandidates,
  groupGamesByIdentity,
  hasMeaningfulRating,
  isSameGame,
  normalizeGameName,
} from './gameIdentity';
import { loadData, removeData, saveData, USER_KEYS } from './storage';

type PendingRatingDeletion = { id: number; deletedAt: number; ownerUid: string };
let ratingDeletionSync: Promise<Set<number>> = Promise.resolve(new Set());
let ratingDeletionStorageQueue: Promise<void> = Promise.resolve();
let ratingsCloudSync: Promise<boolean> = Promise.resolve(true);
let listsCloudSync: Promise<boolean> = Promise.resolve(true);

function storedRatingAverage(rating: Record<string, any> | null | undefined): number {
  if (Number.isFinite(rating?.avg)) return Number(rating?.avg);
  return (
    Number(rating?.general ?? 0)
    + Number(rating?.graphics ?? 0)
    + Number(rating?.gameplay ?? 0)
    + Number(rating?.lifespan ?? 0)
  ) / 4;
}

async function loadPendingRatingDeletions(): Promise<PendingRatingDeletion[]> {
  const value = await loadData(USER_KEYS.ratingDeletions);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PendingRatingDeletion =>
    Number.isSafeInteger(entry?.id)
    && Number.isFinite(entry?.deletedAt)
    && typeof entry?.ownerUid === 'string'
    && entry.ownerUid.length > 0
  );
}

async function updatePendingRatingDeletions(
  update: (current: PendingRatingDeletion[]) => PendingRatingDeletion[]
): Promise<PendingRatingDeletion[]> {
  let result: PendingRatingDeletion[] = [];
  const mutation = ratingDeletionStorageQueue.then(async () => {
    result = update(await loadPendingRatingDeletions());
    if (result.length > 0) await saveData(USER_KEYS.ratingDeletions, result);
    else await removeData(USER_KEYS.ratingDeletions);
  });
  ratingDeletionStorageQueue = mutation.catch(() => {});
  await mutation;
  return result;
}

export async function queueRatingDeletion(gameId: number): Promise<void> {
  if (!Number.isSafeInteger(gameId)) return;
  const ownerUid = auth.currentUser?.uid;
  // With no Firebase session there cannot be a user-scoped cloud rating to
  // delete. Never leave an unowned tombstone that a later account could apply.
  if (!ownerUid) return;
  await updatePendingRatingDeletions((pending) => [
    ...pending.filter((entry) => entry.id !== gameId || entry.ownerUid !== ownerUid),
    { id: gameId, deletedAt: Date.now(), ownerUid },
  ]);
}

async function clearPendingRatingDeletion(gameId: number, ownerUid: string): Promise<void> {
  await updatePendingRatingDeletions((pending) =>
    pending.filter((entry) => entry.id !== gameId || entry.ownerUid !== ownerUid)
  );
}

function mergeRemoteRatings(localRatings: any[], remoteRatings: any[]): any[] {
  type TaggedRating = any & { _mergeSource: 'local' | 'remote'; _mergeIndex: number };
  const tagged: TaggedRating[] = [
    ...localRatings.filter(hasMeaningfulRating).map((rating, index) => ({
      ...rating,
      _mergeSource: 'local' as const,
      _mergeIndex: index,
    })),
    ...remoteRatings.filter(hasMeaningfulRating).map((rating, index) => ({
      ...rating,
      _mergeSource: 'remote' as const,
      _mergeIndex: index,
    })),
  ];
  const updatedAt = (rating: any) => Number(rating._updatedAt ?? rating.updatedAt ?? rating.ratedAt ?? 0);
  const newest = (ratings: TaggedRating[]) => [...ratings].sort((a, b) =>
    updatedAt(b) - updatedAt(a) || b._mergeIndex - a._mergeIndex
  )[0];

  return groupGamesByIdentity(tagged).flatMap((group) => {
    const locals = group.filter((rating) => rating._mergeSource === 'local');
    const remotes = group.filter((rating) => rating._mergeSource === 'remote');
    const local = locals.length > 0 ? newest(locals) : null;
    const remote = remotes.length > 0 ? newest(remotes) : null;

    // A rating confirmed as synced but now absent remotely was deleted on
    // another device. Legacy/unsynced local data remains uploadable.
    if (!remote && local?.synced === true) return [];
    if (!remote && !local) return [];

    const identity = [...group].sort((a, b) => {
      const canonicalDifference = Number(isIgdbGameId(Number(b.id))) - Number(isIgdbGameId(Number(a.id)));
      return canonicalDifference || updatedAt(b) - updatedAt(a);
    })[0];
    let merged: any;
    if (!local) {
      merged = { ...remote, synced: true };
    } else if (!remote) {
      merged = { ...local, synced: false };
    } else if (updatedAt(remote) >= updatedAt(local) || local.synced === true) {
      merged = {
        ...local,
        ...remote,
        comment: remote.comment ?? local.comment,
        hoursPlayed: remote.hoursPlayed ?? local.hoursPlayed ?? null,
        ratedAt: local.ratedAt ?? remote.ratedAt,
        synced: true,
      };
    } else {
      merged = { ...local, synced: false };
    }

    const { _mergeSource, _mergeIndex, ...clean } = merged;
    const identityId = Number(identity.id ?? identity.gameId);
    const canonicalId = Number.isSafeInteger(identityId) ? identityId : clean.id;
    const remoteNeedsMigration = Number.isSafeInteger(identityId)
      && remotes.some((rating) => Number(rating.id) !== identityId);
    return [{
      ...clean,
      id: canonicalId,
      name: identity.name || clean.name,
      background_image: identity.background_image || clean.background_image,
      // Duplicate/cross-provider remote documents need one canonical rewrite
      // before their obsolete IDs can be safely removed.
      synced: remoteNeedsMigration ? false : clean.synced,
    }];
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function getUid(): string {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Registered user not authenticated');
  return user.uid;
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
  top3XpAwarded?: boolean;
}

export async function syncRatingToFirestore(payload: RatingPayload): Promise<boolean> {
  try {
    const uid = getUid();
    const { gameId, gameName, gameImage, completed, comment, hoursPlayed, top3XpAwarded, ...scores } = payload;
    // Finish an older deletion before re-rating the same game so an in-flight
    // tombstone can never delete the newly written rating afterward.
    await syncPendingRatingDeletions();
    if (auth.currentUser?.uid !== uid) return false;
    await clearPendingRatingDeletion(gameId, uid);
    const avg = (scores.general + scores.graphics + scores.gameplay + scores.lifespan) / 4;

    const ratingRef = doc(db, 'ratings', uid, 'games', String(gameId));
    const statsRef = doc(db, 'game_stats', String(gameId));
    await runTransaction(db, async (tx) => {
      // The personal rating and its aggregate must commit together; otherwise
      // a failed second write permanently corrupts the community counters.
      const [oldRatingSnap, statsSnap] = await Promise.all([
        tx.get(ratingRef),
        tx.get(statsRef),
      ]);
      const isNewRating = !oldRatingSnap.exists();
      const oldData = isNewRating ? null : oldRatingSnap.data();
      const completedDelta = (completed ? 1 : 0) - (oldData?.completed ? 1 : 0);

      tx.set(ratingRef, {
        ...scores,
        avg,
        name: gameName,
        nameKey: normalizeGameName(gameName),
        background_image: gameImage,
        completed: completed ?? false,
        comment: comment ?? '',
        hoursPlayed: hoursPlayed ?? null,
        ...(top3XpAwarded != null ? { top3XpAwarded } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (!statsSnap.exists()) {
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
        const data = statsSnap.data();
        const storedCount = Number.isFinite(data.count) ? Math.max(0, Number(data.count)) : 0;
        // Only increment count for genuinely new ratings, not re-syncs or edits
        const newCount = isNewRating ? storedCount + 1 : Math.max(storedCount, 1);
        // For updates: subtract old scores then add new ones; for new: just add
        const oldAvg    = storedRatingAverage(oldData);
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

export async function deleteRatingFromFirestore(gameId: number, expectedUid?: string): Promise<boolean> {
  try {
    const uid = getUid();
    if (expectedUid && uid !== expectedUid) return false;
    const ratingRef = doc(db, 'ratings', uid, 'games', String(gameId));
    const statsRef = doc(db, 'game_stats', String(gameId));
    await runTransaction(db, async (tx) => {
      // Keep the personal rating and its aggregate in the same atomic commit.
      const [ratingSnap, statsSnap] = await Promise.all([
        tx.get(ratingRef),
        tx.get(statsRef),
      ]);
      if (!ratingSnap.exists()) return;
      const oldData = ratingSnap.data();
      tx.delete(ratingRef);
      if (!statsSnap.exists()) return;

      const data = statsSnap.data();
      const newCount = Math.max(0, (data.count ?? 0) - 1);
      if (newCount === 0) {
        tx.delete(statsRef);
        return;
      }
      const newTotal         = Math.max(0, (data.totalScore    ?? 0) - storedRatingAverage(oldData));
      const newTotalGeneral  = Math.max(0, (data.totalGeneral  ?? 0) - (oldData.general ?? 0));
      const newTotalGraphics = Math.max(0, (data.totalGraphics ?? 0) - (oldData.graphics ?? 0));
      const newTotalGameplay = Math.max(0, (data.totalGameplay ?? 0) - (oldData.gameplay ?? 0));
      const newTotalStory    = Math.max(0, (data.totalStory    ?? 0) - (oldData.story ?? 0));
      const newTotalLifespan = Math.max(0, (data.totalLifespan ?? 0) - (oldData.lifespan ?? 0));
      const totalCompleted   = Math.max(0, (data.totalCompleted ?? 0) - (oldData.completed ? 1 : 0));
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
    return true;
  } catch {
    return false;
  }
}

/** Retry locally queued deletions and return IDs that still need cloud removal. */
export function syncPendingRatingDeletions(): Promise<Set<number>> {
  const run = async () => {
    await ratingDeletionStorageQueue;
    const pending = await loadPendingRatingDeletions();
    if (pending.length === 0) return new Set<number>();
    const sessionUid = auth.currentUser?.uid;
    if (!sessionUid) return new Set<number>();
    const sessionPending = pending.filter((entry) => entry.ownerUid === sessionUid);
    if (sessionPending.length === 0) return new Set<number>();
    let uid: string;
    try {
      uid = getUid();
    } catch {
      return new Set(sessionPending.map((entry) => entry.id));
    }
    if (uid !== sessionUid) return new Set(sessionPending.map((entry) => entry.id));
    const deleted = new Set<number>();
    for (const entry of sessionPending) {
      if (await deleteRatingFromFirestore(entry.id, uid)) deleted.add(entry.id);
    }
    const remaining = await updatePendingRatingDeletions((current) =>
      current.filter((entry) => entry.ownerUid !== uid || !deleted.has(entry.id))
    );
    return new Set(
      remaining.filter((entry) => entry.ownerUid === uid).map((entry) => entry.id)
    );
  };
  ratingDeletionSync = ratingDeletionSync.then(run, run);
  return ratingDeletionSync;
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

function matchingStatsDocuments(
  game: { id: number; name?: string },
  documents: GameStatsDocument[]
): GameStatsDocument[] {
  const marker = {
    gameId: game.id,
    name: game.name ?? '',
    count: 0,
    avgScore: 0,
    requestedGameMarker: true,
  };
  const group = groupGamesByIdentity([marker, ...documents])
    .find((entries) => entries.includes(marker));
  return (group ?? []).filter((entry): entry is GameStatsDocument => entry !== marker);
}

export async function fetchGameStats(gameId: number, gameName = ''): Promise<GameStats | null> {
  try {
    const documents = new Map<string, GameStatsDocument>();
    const direct = await getDoc(doc(db, 'game_stats', String(gameId)));
    if (direct.exists()) {
      const data = direct.data() as GameStatsDocument;
      documents.set(direct.id, { ...data, gameId: data.gameId ?? Number(direct.id) });
    }

    const nameKey = normalizeGameName(gameName);
    if (gameName && nameKey) {
      const nameCandidates = gameNameLookupCandidates(gameName);
      const [exactName, normalizedName] = await Promise.all([
        getDocs(query(collection(db, 'game_stats'), where('name', 'in', nameCandidates))),
        getDocs(query(collection(db, 'game_stats'), where('nameKey', '==', nameKey))),
      ]);
      [...exactName.docs, ...normalizedName.docs].forEach((snapshot) => {
        const data = snapshot.data() as GameStatsDocument;
        const candidate = { ...data, gameId: data.gameId ?? Number(snapshot.id) };
        documents.set(snapshot.id, candidate);
      });
    }

    return combineGameStats(matchingStatsDocuments(
      { id: gameId, name: gameName },
      Array.from(documents.values())
    ));
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
        snapshot.docs.forEach((entry) => {
          const data = entry.data() as GameStatsDocument;
          documents.set(entry.id, { ...data, gameId: data.gameId ?? Number(entry.id) });
        });
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
      const matches = matchingStatsDocuments(game, Array.from(documents.values()));
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
    const entries = snap.docs.map((snapshot) => {
      const data = snapshot.data() as GameStatsDocument;
      return { ...data, gameId: data.gameId ?? Number(snapshot.id) };
    });
    const groups = groupGamesByIdentity(entries);
    const results: CommunityGame[] = groups.flatMap((entries) => {
      const combined = combineGameStats(entries);
      if (!combined) return [];
      const representative = [...entries].sort((a, b) => {
        const canonicalDifference = Number(isIgdbGameId(Number(b.gameId))) - Number(isIgdbGameId(Number(a.gameId)));
        return canonicalDifference || (b.count ?? 0) - (a.count ?? 0);
      })[0];
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
  options: { allowXpDecrease?: boolean } = {}
): Promise<boolean> {
  try {
    const uid = getUid();
    const userRef = doc(db, 'users', uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const currentXp: number = snap.exists() ? (snap.data().xp ?? 0) : 0;
      const data: Record<string, any> = {
        pseudo,
        pseudoLower: pseudo.toLowerCase(),
        xp: options.allowXpDecrease ? Math.max(0, xp) : Math.max(xp, currentXp),
        updatedAt: serverTimestamp(),
      };
      if (avatarUri) data.avatarUri = avatarUri;
      if (top3 !== undefined) data.top3 = top3;
      tx.set(userRef, data, { merge: true });
    });
    return true;
  } catch (e) {
    console.warn('[Sync] Public profile sync failed:', e instanceof Error ? e.message : e);
    return false;
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
  const snap = await getDocs(collection(db, 'ratings', uid, 'games'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Send a friend request (idempotent — doc id = fromUid_toUid) */
export async function sendFriendRequest(toUid: string): Promise<void> {
  const fromUid = getUid();
  if (!toUid || toUid === fromUid) throw new Error('Invalid friend request target');
  const outgoingRef = doc(db, 'friend_requests', `${fromUid}_${toUid}`);
  const incomingRef = doc(db, 'friend_requests', `${toUid}_${fromUid}`);
  await runTransaction(db, async (tx) => {
    const [outgoing, incoming] = await Promise.all([tx.get(outgoingRef), tx.get(incomingRef)]);
    if (outgoing.exists() && ['pending', 'accepted'].includes(outgoing.data().status)) return;
    if (incoming.exists()) {
      const incomingStatus = incoming.data().status;
      if (incomingStatus === 'accepted') return;
      if (incomingStatus === 'pending') {
        tx.update(incomingRef, { status: 'accepted' });
        if (outgoing.exists()) tx.delete(outgoingRef);
        return;
      }
      tx.delete(incomingRef);
    }
    tx.set(outgoingRef, {
      fromUid,
      toUid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
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
  const incomingRef = doc(db, 'friend_requests', `${fromUid}_${toUid}`);
  const outgoingRef = doc(db, 'friend_requests', `${toUid}_${fromUid}`);
  await runTransaction(db, async (tx) => {
    const [incoming, outgoing] = await Promise.all([tx.get(incomingRef), tx.get(outgoingRef)]);
    if (!incoming.exists()) throw new Error('Friend request no longer exists');
    tx.update(incomingRef, { status: 'accepted' });
    if (outgoing.exists()) tx.delete(outgoingRef);
  });
}

/** Decline a received friend request */
export async function declineFriendRequest(fromUid: string): Promise<void> {
  const toUid = getUid();
  const incomingRef = doc(db, 'friend_requests', `${fromUid}_${toUid}`);
  const outgoingRef = doc(db, 'friend_requests', `${toUid}_${fromUid}`);
  await runTransaction(db, async (tx) => {
    const [incoming, outgoing] = await Promise.all([tx.get(incomingRef), tx.get(outgoingRef)]);
    if (!incoming.exists()) return;
    tx.update(incomingRef, { status: 'rejected' });
    if (outgoing.exists() && outgoing.data().status === 'pending') tx.delete(outgoingRef);
  });
}

/** Remove a friend (delete the accepted request doc in either direction) */
export async function removeFriend(friendUid: string): Promise<void> {
  const myUid = getUid();
  const firstRef = doc(db, 'friend_requests', `${myUid}_${friendUid}`);
  const secondRef = doc(db, 'friend_requests', `${friendUid}_${myUid}`);
  await runTransaction(db, async (tx) => {
    const [first, second] = await Promise.all([tx.get(firstRef), tx.get(secondRef)]);
    if (first.exists()) tx.delete(firstRef);
    if (second.exists()) tx.delete(secondRef);
  });
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
  const firstStatus = s1.exists() ? s1.data()!.status : null;
  const secondStatus = s2.exists() ? s2.data()!.status : null;
  if (firstStatus === 'accepted' || secondStatus === 'accepted') return 'friends';
  // Legacy crossed requests remain actionable: expose the incoming side so the
  // user can accept it and the transactional accept path removes the duplicate.
  if (firstStatus === 'pending' && secondStatus === 'pending') return 'received';
  if (firstStatus === 'pending') return 'sent';
  if (secondStatus === 'pending') return 'received';
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
    const unique = Array.from(new Map(all.map((request) => {
      const friendUid = request.fromUid === myUid ? request.toUid : request.fromUid;
      return [friendUid, request] as const;
    })).values());
    await attachProfiles(unique, myUid);
    return unique;
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
    const perFriendLimit = Math.min(20, Math.max(1, Math.floor(maxPerFriend)));
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
              // Leave room for a temporary legacy + canonical duplicate.
              limit(Math.min(30, perFriendLimit * 2))
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
        } catch (error) {
          console.warn('[Friends] Failed to load friend feed item:', error instanceof Error ? error.message : error);
        }
      })
    );

    const itemsByFriend = new Map<string, FeedItem[]>();
    allItems.forEach((item) => {
      itemsByFriend.set(item.uid, [...(itemsByFriend.get(item.uid) ?? []), item]);
    });
    const deduped = [...itemsByFriend.values()].flatMap((items) =>
      groupGamesByIdentity(items)
        .map((group) => [...group].sort((a, b) => b.updatedAt - a.updatedAt)[0])
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, perFriendLimit)
    );
    return deduped.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
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
    const likedEntries = (await Promise.all(
      friends.map(async (f) => {
        const friendUid = f.fromUid === myUid ? f.toUid : f.fromUid;
        const pseudo = f.profile?.pseudo ?? '?';
        // Reuse getUserPublicRatings which is confirmed to work
        const ratings = await getUserPublicRatings(friendUid);
        return ratings
          .filter((r) => (r.general ?? 0) >= minScore)
          .map((r) => ({
            id: Number(r.id),
            name: r.name ?? '',
            background_image: r.background_image ?? '',
            friendUid,
            pseudo,
          }));
      })
    )).flat();

    const raw = groupGamesByIdentity(likedEntries)
      .map((group) => {
        const representative = [...group].sort((a, b) => {
          const canonicalDifference = Number(isIgdbGameId(b.id)) - Number(isIgdbGameId(a.id));
          const imageDifference = Number(Boolean(b.background_image)) - Number(Boolean(a.background_image));
          return canonicalDifference || imageDifference;
        })[0];
        return {
          id: representative.id,
          name: representative.name,
          background_image: representative.background_image,
          likedBy: new Map(group.map((entry) => [entry.friendUid, entry.pseudo])),
        };
      })
      .sort((a, b) => b.likedBy.size - a.likedBy.size)
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
        } catch (error) {
          console.warn('[Friends] Failed to load friend top games:', error instanceof Error ? error.message : error);
        }
      }));
    }

    return raw.map(({ id, name, background_image, likedBy }) => ({
      id,
      name,
      background_image,
      likedByCount: likedBy.size,
      likedByPseudos: [...likedBy.values()],
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
async function pullRatingsFromFirestore(): Promise<boolean> {
  try {
    const uid = getUid();
    const pendingDeletionIds = await syncPendingRatingDeletions();
    if (auth.currentUser?.uid !== uid) return true;
    // Force server read to bypass stale Firestore cache on new devices
    const snap = await getDocsFromServer(collection(db, 'ratings', uid, 'games'));
    if (auth.currentUser?.uid !== uid) return true;

    const invalidIds: number[] = [];
    const remoteRatings: any[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const gameId = Number(d.id);
      if (pendingDeletionIds.has(gameId)) return;
      const rating = {
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
        top3XpAwarded: data.top3XpAwarded,
        // updatedAt in ms (for conflict resolution)
        _updatedAt: data.updatedAt?.toMillis?.() ?? 0,
        synced: true,
      };
      if (hasMeaningfulRating(rating)) remoteRatings.push(rating);
      else invalidIds.push(gameId);
    });

    const localRatings: any[] = (await loadData(USER_KEYS.ratings)) ?? [];
    if (auth.currentUser?.uid !== uid) return true;
    const merged = mergeRemoteRatings(localRatings, remoteRatings);
    await saveData(USER_KEYS.ratings, merged);
    for (const invalidId of invalidIds) await queueRatingDeletion(invalidId);
    if (invalidIds.length > 0) await syncPendingRatingDeletions();

    // Upload any local ratings not yet on Firestore (created offline)
    const unsynced = merged.filter((r) => !r.synced && r.id && hasMeaningfulRating(r));
    let localChanged = false;
    let syncFailed = false;
    for (const r of unsynced) {
      if (auth.currentUser?.uid !== uid) return true;
      const relatedRemoteGroup = groupGamesByIdentity([r, ...remoteRatings])
        .find((entries) => entries.includes(r)) ?? [];
      const obsoleteRemoteIds = Array.from(new Set(
        relatedRemoteGroup
          .filter((entry) => entry !== r && String(entry.id) !== String(r.id))
          .map((entry) => Number(entry.id))
          .filter(Number.isSafeInteger)
      ));
      const synced = await syncRatingToFirestore({
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
        hoursPlayed: r.hoursPlayed,
        top3XpAwarded: r.top3XpAwarded,
      }).catch(() => false);
      if (!synced) syncFailed = true;
      if (synced) {
        r.synced = true;
        localChanged = true;
        for (const obsoleteId of obsoleteRemoteIds) await queueRatingDeletion(obsoleteId);
        if (obsoleteRemoteIds.length > 0) await syncPendingRatingDeletions();
      }
    }
    if (localChanged) await saveData(USER_KEYS.ratings, merged);
    return !syncFailed;
  } catch (e) {
    console.warn('[Sync] Ratings sync failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export function syncRatingsFromFirestore(): Promise<boolean> {
  const run = () => pullRatingsFromFirestore();
  ratingsCloudSync = ratingsCloudSync.then(run, run);
  return ratingsCloudSync;
}

/**
 * Pull profile (pseudo, avatarUri, xp, top3) from Firestore → AsyncStorage.
 * Uses Firestore data when local is missing or Firestore is newer.
 */
export async function syncProfileFromFirestore(): Promise<boolean> {
  try {
    const uid = getUid();
    // Force server read to bypass stale Firestore cache
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (auth.currentUser?.uid !== uid) return true;
    if (!snap.exists()) return true;

    const remote = snap.data();
    const remoteUpdatedAt: number = remote.updatedAt?.toMillis?.() ?? 0;

    const localProfile: any = (await loadData(USER_KEYS.profile)) ?? {};
    const localXp: number = (await loadData(USER_KEYS.xp)) ?? 0;
    if (auth.currentUser?.uid !== uid) return true;
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
        await saveData(USER_KEYS.top3, dedupeGamesByIdentity(remote.top3.filter(hasMeaningfulRating)));
      }
    }
    return true;
  } catch (e) {
    console.warn('[Sync] Profile sync failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Save game lists (wishlist/backlog/playing) to Firestore under users/{uid}.lists
 */
async function writeListsToFirestore(lists: any[], expectedUid: string | null): Promise<boolean> {
  if ((auth.currentUser?.uid ?? null) !== expectedUid) return true;
  const cleanLists = dedupeGamesByIdentity(lists);
  const localUpdatedAt = Date.now();
  // Reassert the exact local snapshot passed by the UI. A queued cloud pull may
  // otherwise have completed after the UI's optimistic AsyncStorage write.
  await saveData(USER_KEYS.lists, cleanLists);
  await saveData(USER_KEYS.listsUpdatedAt, localUpdatedAt);
  try {
    const uid = getUid();
    if (uid !== expectedUid) return true;
    await setDoc(doc(db, 'users', uid), {
      lists: cleanLists,
      listsUpdatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Sync] Lists upload failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export function syncListsToFirestore(lists: any[]): Promise<boolean> {
  const ownerUid = auth.currentUser?.uid ?? null;
  const run = () => writeListsToFirestore(lists, ownerUid);
  listsCloudSync = listsCloudSync.then(run, run);
  return listsCloudSync;
}

/**
 * Pull game lists from Firestore → AsyncStorage.
 * Last-write-wins sync for the complete list, including intentional deletions.
 */
async function pullListsFromFirestore(): Promise<boolean> {
  try {
    const uid = getUid();
    const [localValue, localTimestamp] = await Promise.all([
      loadData(USER_KEYS.lists),
      loadData(USER_KEYS.listsUpdatedAt),
    ]);
    const localLists: any[] = Array.isArray(localValue) ? localValue : [];
    const localUpdatedAt = Number(localTimestamp ?? 0);
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (auth.currentUser?.uid !== uid) return true;
    if (!snap.exists()) {
      if (localLists.length > 0 || localUpdatedAt > 0) await writeListsToFirestore(localLists, uid);
      return true;
    }

    const data = snap.data();
    const remoteLists = Array.isArray(data.lists) ? dedupeGamesByIdentity(data.lists) : [];
    const remoteUpdatedAt = Number(data.listsUpdatedAt?.toMillis?.() ?? 0);
    if (auth.currentUser?.uid !== uid) return true;
    if (localUpdatedAt === 0 && localLists.length > 0) {
      // Preserve the pre-migration behavior: existing local data was authoritative.
      await writeListsToFirestore(localLists, uid);
    } else if (remoteUpdatedAt > localUpdatedAt || (localUpdatedAt === 0 && localLists.length === 0)) {
      await saveData(USER_KEYS.lists, remoteLists);
      await saveData(USER_KEYS.listsUpdatedAt, remoteUpdatedAt);
    } else if (localUpdatedAt > remoteUpdatedAt) {
      await writeListsToFirestore(localLists, uid);
    }
    return true;
  } catch (e) {
    console.warn('[Sync] Lists sync failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export function syncListsFromFirestore(): Promise<boolean> {
  const run = () => pullListsFromFirestore();
  listsCloudSync = listsCloudSync.then(run, run);
  return listsCloudSync;
}
