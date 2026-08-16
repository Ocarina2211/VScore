import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryCache = new Map<string, any>();
const pendingLoads = new Map<string, Promise<any>>();

export const saveData = async (key: string, value: any) => {
  // Keep hot values in memory as well as on disk. Several screens read the
  // same ratings/profile/list values during one session.
  memoryCache.set(key, value);
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

export const loadData = async (key: string) => {
  if (memoryCache.has(key)) return memoryCache.get(key);
  const pending = pendingLoads.get(key);
  if (pending) return pending;

  const request = AsyncStorage.getItem(key)
    .then((data) => {
      const value = data ? JSON.parse(data) : null;
      memoryCache.set(key, value);
      return value;
    })
    .finally(() => pendingLoads.delete(key));
  pendingLoads.set(key, request);
  return request;
};

export const removeData = async (key: string) => {
  memoryCache.delete(key);
  await AsyncStorage.removeItem(key);
};

export const USER_KEYS = {
  profile: 'user_profile',
  ratings: 'user_ratings',
  ratingDeletions: 'user_rating_deletions',
  top3: 'user_top3',
  xp: 'user_xp',
  lastRatingDate: 'user_last_rating_date',
  tutorialSeen: 'tutorial_seen',
  pseudoLastChanged: 'pseudo_last_changed',
  lists: 'user_lists',
  listsUpdatedAt: 'user_lists_updated_at',
  profileXpDecreasePending: 'user_profile_xp_decrease_pending',
  identityCleanupVersion: 'user_identity_cleanup_version',
  lastCloudSyncAt: 'user_last_cloud_sync_at',
  lastPushTokenRegistrationAt: 'user_last_push_token_registration_at',
  lastSeenRequestCount: 'last_seen_request_count',
  lastSeenFriendCount: 'last_seen_friend_count',
  lastSeenRequestIds: 'last_seen_request_ids',
  lastSeenFriendUids: 'last_seen_friend_uids',
  lastSeenSentUids: 'last_seen_sent_uids',
  lastSeenFriendActivityAt: 'last_seen_friend_activity_at',
  lastAppOpenAt: 'last_app_open_at',
  notificationsEnabled: 'notifications_enabled',
  steamId: 'user_steam_id',
};

const USER_SCOPED_KEYS = [
  USER_KEYS.profile,
  USER_KEYS.ratings,
  USER_KEYS.ratingDeletions,
  USER_KEYS.top3,
  USER_KEYS.xp,
  USER_KEYS.lastRatingDate,
  USER_KEYS.pseudoLastChanged,
  USER_KEYS.lists,
  USER_KEYS.listsUpdatedAt,
  USER_KEYS.profileXpDecreasePending,
  USER_KEYS.identityCleanupVersion,
  USER_KEYS.lastCloudSyncAt,
  USER_KEYS.lastPushTokenRegistrationAt,
  USER_KEYS.lastSeenRequestCount,
  USER_KEYS.lastSeenFriendCount,
  USER_KEYS.lastSeenRequestIds,
  USER_KEYS.lastSeenFriendUids,
  USER_KEYS.lastSeenSentUids,
  USER_KEYS.lastSeenFriendActivityAt,
  USER_KEYS.lastAppOpenAt,
  USER_KEYS.steamId,
];

/** Prevent one account's private local data from leaking into the next session. */
export const clearLocalUserData = async () => {
  await AsyncStorage.multiRemove(USER_SCOPED_KEYS);
  USER_SCOPED_KEYS.forEach((key) => memoryCache.delete(key));
};
