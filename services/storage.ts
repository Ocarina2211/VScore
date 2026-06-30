import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveData = async (key: string, value: any) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

export const loadData = async (key: string) => {
  const data = await AsyncStorage.getItem(key);
  return data ? JSON.parse(data) : null;
};

export const removeData = async (key: string) => {
  await AsyncStorage.removeItem(key);
};

export const USER_KEYS = {
  profile: 'user_profile',
  ratings: 'user_ratings',
  top3: 'user_top3',
  xp: 'user_xp',
  lastRatingDate: 'user_last_rating_date',
  tutorialSeen: 'tutorial_seen',
  pseudoLastChanged: 'pseudo_last_changed',
  lists: 'user_lists',
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
