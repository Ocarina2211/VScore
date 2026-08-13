export type Language = 'en' | 'fr';

export type Translations = {
  // Tabs
  tabHome: string;
  tabRank: string;
  tabSocial: string;
  tabProfile: string;
  tabSettings: string;
  discoverTitle: string;
  rankScreenTitle: string;
  rankGenreSubtitle: (genres: string) => string;
  discoverHideRated: string;
  discoverShowAll: string;

  // Onboarding
  onboardingWelcome: string;
  onboardingSubtitle: string;
  onboardingChoosePhoto: string;
  onboardingPlaceholder: string;
  onboardingCTA: string;
  onboardingError: string;

  // Login
  loginSubtitle: string;
  loginGoogle: string;
  loginApple: string;
  loginContinueAsGuest: string;
  loginOr: string;
  loginSignIn: string;
  loginSignUp: string;
  loginEmail: string;
  loginPassword: string;
  loginSubmitSignIn: string;
  loginSubmitSignUp: string;
  loginSwitchToSignUp: string;
  loginSwitchToSignIn: string;
  loginErrorInvalidCredentials: string;
  loginErrorEmailInUse: string;
  loginErrorWeakPassword: string;
  loginErrorGeneric: string;
  loginErrorInvalidEmail: string;
  loginErrorTooManyRequests: string;
  loginErrorCredentialAlreadyInUse: string;
  profileGuestBannerText: string;
  profileGuestBannerCta: string;
  tutorialPromoTitle: string;
  tutorialPromoSubtitle: string;
  tutorialPromoBenefit1: string;
  tutorialPromoBenefit2: string;
  tutorialPromoBenefit3: string;
  tutorialPromoCreateAccount: string;
  tutorialPromoLater: string;
  loginForgotPassword: string;
  loginResetEmailSent: string;
  loginResetEmailSentMessage: string;
  loginFillEmailFirst: string;

  // Settings — account section
  settingsAccount: string;
  settingsAccountGoogle: string;
  settingsAccountApple: string;
  settingsAccountEmail: string;
  settingsAccountGuest: string;
  settingsLinkAccount: string;
  settingsSignOut: string;
  settingsSignOutConfirm: string;
  settingsSignOutMessage: string;
  settingsDeleteAccount: string;
  settingsDeleteAccountConfirm: string;
  settingsDeleteAccountMessage: string;
  settingsDeleteAccountError: string;

  // Success
  successNewRank: string;
  successContinue: string;
  successTop3: string;
  successRatingSaved: string;
  successKeepRanking: string;
  successBack: string;

  // Settings
  settingsTitle: string;
  settingsMyAccount: string;
  settingsUsernamePlaceholder: string;
  settingsSave: string;
  settingsCharacters: (n: number) => string;
  settingsAppearance: string;
  settingsDark: string;
  settingsSystem: string;
  settingsLight: string;
  settingsLanguage: string;
  settingsNotifications: string;
  settingsActivityReminders: string;
  settingsNotRatedSub: string;
  settingsAbout: string;
  settingsDataProvider: string;
  settingsStoredLocally: string;
  settingsPermissionRequired: string;
  settingsEnableNotifDesc: string;
  settingsUsernameUpdated: string;
  settingsNotifBody: string;

  // Steam
  settingsSteamSection: string;
  settingsSteamLink: string;
  settingsSteamLinked: string;
  settingsSteamUnlink: string;
  settingsSteamError: string;
  settingsSteamSuccess: string;

  // Profile
  profileChangeUsername: string;
  profileChangeUsernameOnce: string;
  profileChangeUsernameIn: (days: number) => string;
  profileNewUsername: string;
  profileAvatarError: string;
  profilePseudoTaken: string;
  profileSave: string;
  profileClose: string;
  profileShareMessage: (pseudo: string, rank: string, xp: number) => string;
  profileShareDialogTitle: string;
  profileMaxRank: string;
  profileRatedGames: string;
  profileCompleted: string;
  profileTotalXP: string;
  profileScoreDistribution: string;
  profileAvgScore: (avg: string) => string;
  profileCriteriaBreakdown: string;
  profileWorstGame: string;
  profileTop3Title: string;
  profileAllRankedTitle: string;
  profileNoTop3: string;
  profileSearchRated: string;
  profileSortDate: string;
  profileSortScore: string;
  profileSortMeta: string;
  profileSortTitle: string;
  profileNoRatings: string;
  profileNoResultsFor: (query: string) => string;
  profileSteamUnavailable: string;
  profileSteamEmpty: string;
  profileShareBtn: string;
  profileCriteriaTitle: string;
  profileStrongest: string;
  profileWeakest: string;
  profileBestGame: string;
  profileCompletionRate: string;
  profileSuggestionsTitle: string;
  profileSuggestionsBecause: (genre: string) => string;
  profileSuggestionsEmpty: string;

  // Lists
  listSectionTitle: string;
  listWishlist: string;
  listBacklog: string;
  listPlaying: string;
  listCompleted: string;
  listManageTitle: string;
  listRemove: string;
  listEmpty: string;

  // Friends
  friendsAddFriendTitle: string;
  friendsAddButton: string;
  friendsMyFriends: string;
  friendsSearch: string;
  friendsSearchHint: string;
  friendsNoResults: string;
  friendsAdd: string;
  friendsCancel: string;
  friendsPending: string;
  friendsAlreadyFriends: string;
  friendsPageTitle: string;
  friendsTabFriends: string;
  friendsTabSent: string;
  friendsTabReceived: string;
  friendsNoFriends: string;
  friendsNoSent: string;
  friendsNoReceived: string;
  friendsAccept: string;
  friendsDecline: string;
  friendsRemove: string;
  friendsViewProfile: string;
  friendsRatedGames: string;
  friendsCompleted: string;
  friendsTotalXP: string;
  friendsNoRatings: string;
  friendsTop3: string;
  friendsNoTop3: string;
  friendsLoadError: string;
  friendsTabRanking: string;
  friendsRankingEmpty: string;
  friendsRankingGlobal: string;
  friendsRankingFriends: string;
  friendsRankingNoFriends: string;
  friendsTabFeed: string;
  friendsFeedEmpty: string;
  friendsFeedRated: (pseudo: string, game: string) => string;
  friendsCompareCommon: (n: number) => string;
  friendsCompareSimilarity: (pct: number) => string;
  friendsCompareNoCommon: string;
  friendsCompareSection: string;
  friendsMemberSince: string;
  friendsInviteContact: string;
  friendsInviteTitle: string;
  friendsInviteMessage: (uid: string) => string;
  inviteNotFound: string;
  inviteBackHome: string;
  inviteSubtitle: string;
  inviteLoginHint: string;
  inviteLogin: string;
  inviteOwnLink: string;
  inviteSent: string;
  inviteAlreadyFriends: string;
  inviteAdd: string;
  inviteHome: string;
  inviteSendError: string;

  // Search / common
  searchPlaceholder: string;
  noGamesAvailable: string;
  ratedBadgeLabel: string;
  noResults: string;
  noGameForQuery: (query: string) => string;
  noGameForFilters: string;
  filterSectionLabel: string;
  clearAll: string;
  commonLoadError: string;
  commonRetry: string;
  commonErrorTitle: string;
  commonActionError: string;
  commonCancel: string;
  commonLoading: string;
  commonSearchError: string;
  commonGameNotFound: string;
  friendsNoGames: string;

  // Genre / tag filter labels
  filterAction: string;
  filterAdventure: string;
  filterRPG: string;
  filterSports: string;
  filterRacing: string;
  filterFPS: string;
  filterStrategy: string;
  filterHorror: string;
  filterPuzzle: string;
  filterSolo: string;
  filterMultiplayer: string;
  filterRecent: string;

  // Discover section titles (keyed by section id)
  sections: Record<string, string>;

  // Game detail
  gameRelease: string;
  gameAvgTime: string;
  gameDeveloper: string;
  gamePublisher: string;
  gameViewOnSteam: string;
  gameCommunityRatings: string;
  gameAbout: string;
  gameScreenshots: string;
  gameSimilar: string;
  gameRankBtn: string;
  gameCriteriaGeneral: string;
  gameCriteriaGraphics: string;
  gameCriteriaGameplay: string;
  gameCriteriaStory: string;
  gameCriteriaLifespan: string;
  gameDateLocale: string;

  // Rank screen
  rankCriteriaOverall: string;
  rankCriteriaGraphics: string;
  rankCriteriaGameplay: string;
  rankCriteriaStory: string;
  rankCriteriaLifespan: string;
  rankCommunityAvg: (avg: string) => string;
  rankErrorRequired: string;
  rankSubmit: string;
  rankSubmitTop3: string;
  rankSaving: string;
  rankSaveChanges: string;
  rankReplaceWith: string;
  rankCancel: string;
  rankRemoveTitle: string;
  rankRemoveMessage: (game: string, ratingXp: number, top3Xp: number, losesTop3: boolean) => string;
  rankRemoveButton: string;
  rankReviewLabel: string;
  rankReviewPlaceholder: string;
  rankCompletedLabel: string;
  rankCompletedBanner: string;
  rankHoursLabel: string;
  notifTitle: string;
  notifBody: string;
  notifFriendRequestTitle: string;
  notifFriendRequestBody: (count: number) => string;
  notifFriendAcceptedTitle: string;
  notifFriendAcceptedBody: string;

  // Tutorial
  tutorialSkip: string;
  tutorialNext: string;
  tutorialStart: string;
  tutorialLanguageTitle: string;
  tutorialLanguageSubtitle: string;
  tutorialConceptTitle: string;
  tutorialConceptBody: string;
  tutorialConceptItem1Title: string;
  tutorialConceptItem1Desc: string;
  tutorialConceptItem2Title: string;
  tutorialConceptItem2Desc: string;
  tutorialConceptItem3Title: string;
  tutorialConceptItem3Desc: string;
  tutorialConceptItem4Title: string;
  tutorialConceptItem4Desc: string;
  tutorialCardTitle: string;
  tutorialCardSubtitle: string;
  tutorialCardLegendMeta: string;
  tutorialCardLegendVscore: string;
  tutorialCardLegendVscoreDesc: string;
  tutorialCardLegendRated: string;
  tutorialCardLegendRatedDesc: string;
  tutorialHonestyTitle: string;
  tutorialHonestyBody: string;
  tutorialHonestyRule1: string;
  tutorialHonestyRule2: string;
  tutorialHonestyRule3: string;
  tutorialAccountTitle: string;
  tutorialAccountSubtitle: string;
};

const en: Translations = {
  // Tabs
  tabHome: 'Home',
  tabRank: 'Rate',
  tabSocial: 'Social',
  tabProfile: 'Profile',
  tabSettings: 'Settings',
  discoverTitle: 'Discover',
  rankScreenTitle: 'Rate your games !',
  rankGenreSubtitle: (genres) => `🎯 Based on your taste · ${genres}`,
  discoverHideRated: 'Hide rated',
  discoverShowAll: 'Show all',

  // Onboarding
  onboardingWelcome: 'Welcome! 👋',
  onboardingSubtitle: 'Choose your avatar and username to get started.',
  onboardingChoosePhoto: 'Choose a photo',
  onboardingPlaceholder: 'Your username...',
  onboardingCTA: 'Get started →',
  onboardingError: 'Your username must be at least 2 characters.',

  // Login
  loginSubtitle: 'Rate your games. Build your library.',
  loginGoogle: 'Continue with Google',
  loginApple: 'Continue with Apple',
  loginContinueAsGuest: 'Continue as Guest',
  loginOr: 'or',
  loginSignIn: 'Sign in',
  loginSignUp: 'Create account',
  loginEmail: 'Email',
  loginPassword: 'Password',
  loginSubmitSignIn: 'Sign in',
  loginSubmitSignUp: 'Create account',
  loginSwitchToSignUp: "Don't have an account? Sign up",
  loginSwitchToSignIn: 'Already have an account? Sign in',
  loginErrorInvalidCredentials: 'Incorrect email or password.',
  loginErrorEmailInUse: 'This email is already used.',
  loginErrorWeakPassword: 'Password must be at least 6 characters.',
  loginErrorGeneric: 'An error occurred. Please try again.',
  loginErrorInvalidEmail: 'Invalid email address.',
  loginErrorTooManyRequests: 'Too many attempts. Please wait before trying again.',
  loginErrorCredentialAlreadyInUse: 'This account is already registered. Please tap again to sign in.',
  profileGuestBannerText: 'You\'re in guest mode. Create an account to save your progress and join the community.',
  profileGuestBannerCta: 'Create an account',
  tutorialPromoTitle: 'One last thing 🚀',
  tutorialPromoSubtitle: 'You can explore Ratecade as a guest, but creating a free account unlocks everything.',
  tutorialPromoBenefit1: '💾  Save your progress across all devices',
  tutorialPromoBenefit2: '👥  Compare scores with friends',
  tutorialPromoBenefit3: '🏆  Climb the ranks and earn badges',
  tutorialPromoCreateAccount: 'Create a free account',
  tutorialPromoLater: 'Continue as guest',
  loginForgotPassword: 'Forgot password?',
  loginResetEmailSent: 'Email sent',
  loginResetEmailSentMessage: 'Check your inbox to reset your password. If you don\'t see it, check your spam folder.',
  loginFillEmailFirst: 'Enter your email address first.',

  // Settings — account
  settingsAccount: 'Account',
  settingsAccountGoogle: 'Connected with Google',
  settingsAccountApple: 'Connected with Apple',
  settingsAccountEmail: 'Email account',
  settingsAccountGuest: 'Guest account',
  settingsLinkAccount: 'Link an account',
  settingsSignOut: 'Sign out',
  settingsSignOutConfirm: 'Sign out?',
  settingsSignOutMessage: 'Your local data will be kept. You can sign back in later.',
  settingsDeleteAccount: 'Delete Account',
  settingsDeleteAccountConfirm: 'Delete Account?',
  settingsDeleteAccountMessage: 'This will permanently delete your account and all your data. This action cannot be undone.',
  settingsDeleteAccountError: 'Unable to delete account. Please sign out and sign in again before trying.',

  // Success
  successNewRank: 'New rank unlocked!',
  successContinue: 'Continue',
  successTop3: 'Your game has been added to your Top 3!',
  successRatingSaved: 'Your rating has been saved to your profile!',
  successKeepRanking: 'Keep ranking to level up!',
  successBack: 'Back',

  // Settings
  settingsTitle: 'Settings',
  settingsMyAccount: 'My account',
  settingsUsernamePlaceholder: 'Your username',
  settingsSave: 'Save',
  settingsCharacters: (n) => `${n}/24 characters`,
  settingsAppearance: 'Appearance',
  settingsDark: 'Dark',
  settingsSystem: 'System',
  settingsLight: 'Light',
  settingsLanguage: 'Language',
  settingsNotifications: 'Notifications',
  settingsActivityReminders: 'Activity reminders',
  settingsNotRatedSub: "If you haven't rated in 3 days",
  settingsAbout: 'About',
  settingsDataProvider: 'Game data provided by IGDB.com',
  settingsStoredLocally: 'Stored locally',
  settingsPermissionRequired: 'Permission required',
  settingsEnableNotifDesc: 'Enable notifications in your phone settings to receive reminders.',
  settingsUsernameUpdated: '✓ Username updated',
  settingsNotifBody: "You haven't rated a game in a few days. New releases are waiting for you!",

  // Steam
  settingsSteamSection: 'Gaming platforms',
  settingsSteamLink: 'Sign in with Steam',
  settingsSteamLinked: 'Steam connected',
  settingsSteamUnlink: 'Unlink',
  settingsSteamError: 'Unable to sign in with Steam. Please try again.',
  settingsSteamSuccess: '✓ Steam account linked!',

  // Profile
  profileChangeUsername: 'Change username',
  profileChangeUsernameOnce: 'You can change your username once every 30 days.',
  profileChangeUsernameIn: (days) => `You can change your username in ${days} day${days > 1 ? 's' : ''}.`,
  profileNewUsername: 'New username...',
  profileAvatarError: 'Unable to process the photo. Try again.',
  profilePseudoTaken: 'This username is already taken.',
  profileSave: 'Save',
  profileClose: 'Close',
  profileShareMessage: (pseudo, rank, xp) => `Check out my Ratecade profile! I'm ${pseudo}, rank ${rank} with ${xp} XP 🎮`,
  profileShareDialogTitle: 'Share your Ratecade profile',
  profileMaxRank: 'Max rank reached!',
  profileRatedGames: 'Rated games',
  profileCompleted: 'Completed',
  profileTotalXP: 'Total XP',
  profileScoreDistribution: 'Score distribution',
  profileAvgScore: (avg) => `Avg. ${avg} / 5 ⭐`,
  profileCriteriaBreakdown: 'Criteria breakdown',
  profileBestGame: 'Best game',
  profileWorstGame: 'Worst rated',
  profileTop3Title: 'My TOP 3 :',
  profileAllRankedTitle: 'All my Ranked games :',
  profileNoTop3: 'No games in top 3',
  profileSearchRated: 'Search a rated game...',
  profileSortDate: 'Recent',
  profileSortScore: 'My score',
  profileSortMeta: 'Critic score',
  profileSortTitle: 'A → Z',
  profileNoRatings: 'No games rated yet',
  profileSteamUnavailable: 'Your Steam library is temporarily unavailable. Please try again later.',
  profileSteamEmpty: 'No games available to import. Check that your Steam game details are public.',
  profileNoResultsFor: (query) => `No results for "${query}"`,
  profileShareBtn: 'Share as image',
  profileCriteriaTitle: 'Taste profile',
  profileStrongest: 'Strength',
  profileWeakest: 'Weakness',
  profileCompletionRate: 'Completion rate',
  profileSuggestionsTitle: 'For you',
  profileSuggestionsBecause: (genre) => `Because you like ${genre}`,
  profileSuggestionsEmpty: 'Rate more games to get personalized suggestions',

  // Lists
  listSectionTitle: 'My Lists',
  listWishlist: '📌 Wishlist',
  listBacklog: '📚 Backlog',
  listPlaying: '🎮 Playing',
  listCompleted: '✅ Completed',
  listManageTitle: 'Add to a list',
  listRemove: 'Remove from list',
  listEmpty: 'Nothing here yet',

  // Friends
  friendsAddFriendTitle: 'ADD FRIENDS',
  friendsAddButton: 'Add friends 👥+',
  friendsMyFriends: 'My Friends 👥',
  friendsSearch: 'Search by username...',
  friendsSearchHint: 'Type at least 2 characters',
  friendsNoResults: 'No user found',
  friendsAdd: 'Add',
  friendsCancel: 'Cancel',
  friendsPending: 'Pending',
  friendsAlreadyFriends: 'Friends ✓',
  friendsPageTitle: 'FRIENDS',
  friendsTabFriends: 'Friends',
  friendsTabSent: 'Sent',
  friendsTabReceived: 'Received',
  friendsNoFriends: 'No friends yet — go add some!',
  friendsNoSent: 'No pending requests',
  friendsNoReceived: 'No requests received',
  friendsAccept: 'Accept',
  friendsDecline: 'Decline',
  friendsRemove: 'Remove',
  friendsViewProfile: 'View profile',
  friendsRatedGames: 'Rated games',
  friendsCompleted: 'Completed',
  friendsTotalXP: 'Total XP',
  friendsNoRatings: 'No ratings yet',
  friendsTop3: 'Top 3',
  friendsNoTop3: 'No top 3 yet',
  friendsLoadError: 'Could not load profile',
  friendsTabRanking: 'Ranking',
  friendsRankingEmpty: 'No players yet',
  friendsRankingGlobal: 'Global',
  friendsRankingFriends: 'Friends',
  friendsRankingNoFriends: 'Add friends to see their ranking',
  friendsTabFeed: 'Feed',
  friendsFeedEmpty: 'No recent activity from your friends.',
  friendsFeedRated: (pseudo, game) => `${pseudo} rated ${game}`,
  friendsCompareCommon: (n) => `${n} game${n > 1 ? 's' : ''} in common`,
  friendsCompareSimilarity: (pct) => `${pct}% similar tastes`,
  friendsCompareNoCommon: 'No games in common yet.',
  friendsCompareSection: 'Comparison',
  friendsMemberSince: 'Member since',
  friendsInviteContact: 'Invite a contact',
  friendsInviteTitle: 'Ratecade invitation',
  friendsInviteMessage: (uid) => `Join me on Ratecade 🎮\nAdd me as a friend directly: ratecade://invite/${uid}\n\nYou don't have Ratecade yet? Download the app from the App Store!`,
  inviteNotFound: 'User not found.',
  inviteBackHome: 'Back home',
  inviteSubtitle: 'invites you to join Ratecade',
  inviteLoginHint: 'Log in to add this user as a friend.',
  inviteLogin: 'Log in',
  inviteOwnLink: "That's your own invitation link 😄",
  inviteSent: 'Request sent!',
  inviteAlreadyFriends: 'You are already friends.',
  inviteAdd: 'Add as friend',
  inviteHome: 'Go to Ratecade',
  inviteSendError: 'Unable to send the request. Check your connection and try again.',

  // Search / common
  searchPlaceholder: 'Search a game...',
  noGamesAvailable: 'No games available',
  ratedBadgeLabel: 'RATED',
  noResults: 'No results',
  noGameForQuery: (query) => `No game found for "${query}"`,
  noGameForFilters: 'No game found with these filters',
  filterSectionLabel: 'Filters',
  clearAll: 'Clear all ✕',
  commonLoadError: 'Unable to load this game. Check your connection and try again.',
  commonRetry: 'Try again',
  commonErrorTitle: 'Error',
  commonActionError: 'Something went wrong. Check your connection and try again.',
  commonCancel: 'Cancel',
  commonLoading: 'Loading...',
  commonSearchError: 'Search error.',
  commonGameNotFound: 'Game not found in the catalog.',
  friendsNoGames: 'Add friends to unlock this section',

  // Genre / tag filter labels
  filterAction: 'Action',
  filterAdventure: 'Adventure',
  filterRPG: 'RPG',
  filterSports: 'Sports',
  filterRacing: 'Racing',
  filterFPS: 'FPS',
  filterStrategy: 'Strategy',
  filterHorror: 'Horror',
  filterPuzzle: 'Puzzle',
  filterSolo: 'Solo',
  filterMultiplayer: 'Multiplayer',
  filterRecent: 'Recent',

  // Discover section titles
  sections: {
    popular:     '🔥 Most popular',
    trending:    '🌟 Trending this month',
    top_rated:   '⭐ Top rated by critics',
    community:   '👥 Ratecade community top',
    recommended: '🎯 Recommended for you',
    friends_liked: '❤️  Your friends love these',
    recent:      '🆕 Recent releases',
    action:      '⚔️  Action & Adventure',
    rpg:         '🗡️  RPG',
    shooter:     '🎯 Shooters',
    indie:       '💎 Indie gems',
    strategy:    '🧠 Strategy',
    horror:      '👻 Horror & Survival',
    platformer:  '🏃 Platformers',
    adventure:   '🗺️  Adventure',
    puzzle:      '🧩 Puzzle & Strategy',
    simulation:  '🏙️  Simulation',
    sports:      '⚽ Sports',
    fighting:    '🥊 Fighting',
    racing:      '🏎️  Racing',
    mmo:         '👾 MMO & Multiplayer',
    casual:      '🎲 Casual & Party Games',
    arcade:      '🕹️  Arcade & Retro',
    family:      '👨‍👩‍👧 Family',
    board:       '♟️  Board & Card Games',
  },

  // Game detail
  gameRelease: '📅 Release',
  gameAvgTime: '⏱ Avg. time',
  gameDeveloper: '🏢 Developer',
  gamePublisher: '🏬 Publisher',
  gameViewOnSteam: 'View on Steam',
  gameCommunityRatings: 'Community ratings',
  gameAbout: 'About',
  gameScreenshots: 'Screenshots',
  gameSimilar: 'Similar games',
  gameRankBtn: 'RATE THIS GAME',
  gameCriteriaGeneral: 'General',
  gameCriteriaGraphics: 'Graphics',
  gameCriteriaGameplay: 'Gameplay',
  gameCriteriaStory: 'Story',
  gameCriteriaLifespan: 'Lifespan',
  gameDateLocale: 'en-US',

  // Rank screen
  rankCriteriaOverall: 'Overall',
  rankCriteriaGraphics: 'Graphics',
  rankCriteriaGameplay: 'Gameplay',
  rankCriteriaStory: 'Story',
  rankCriteriaLifespan: 'Lifespan',
  rankCommunityAvg: (avg) => `avg. ${avg} ⭐`,
  rankErrorRequired: '⚠ Please rate all required criteria.',
  rankSubmit: 'SUBMIT',
  rankSubmitTop3: 'SUBMIT & ADD TO TOP 3',
  rankSaving: 'Saving...',
  rankSaveChanges: '✓  Save changes',
  rankReplaceWith: 'Which game to replace with',
  rankCancel: 'Cancel',
  rankRemoveTitle: 'Remove this rating',
  rankRemoveMessage: (game, ratingXp, top3Xp, losesTop3) => `Delete your rating for "${game}"? You will lose ${ratingXp} XP${losesTop3 ? ` + ${top3Xp} XP (Top 3)` : ''}.`,
  rankRemoveButton: 'Remove',
  rankReviewLabel: 'Your review (optional)',
  rankReviewPlaceholder: 'Share your thoughts about this game...',
  rankCompletedLabel: 'I have completed this game',
  rankCompletedBanner: 'of Ratecade players have completed this game',
  rankHoursLabel: 'Time played',
  notifTitle: 'Time to rate a game',
  notifBody: 'New discoveries are waiting for you on Ratecade.',
  notifFriendRequestTitle: '👥 New friend request!',
  notifFriendRequestBody: (count) => `You have ${count} new friend request${count > 1 ? 's' : ''}.`,
  notifFriendAcceptedTitle: '🎉 Friend request accepted!',
  notifFriendAcceptedBody: 'Someone accepted your friend request on Ratecade.',

  // Tutorial
  tutorialSkip: 'Skip',
  tutorialNext: 'Next →',
  tutorialStart: "Let's go! 🚀",
  tutorialLanguageTitle: 'Welcome to Ratecade! 🎮',
  tutorialLanguageSubtitle: 'Your personal game library. Before we start, choose your language.',
  tutorialConceptTitle: 'How it works',
  tutorialConceptBody: "Rate every game you've played. The more you rate, the higher your rank. Build your ultimate game library and discover what the community thinks.",
  tutorialConceptItem1Title: 'Rank',
  tutorialConceptItem1Desc: 'Rate & explore games',
  tutorialConceptItem2Title: 'XP & Ranks',
  tutorialConceptItem2Desc: 'Level up by rating',
  tutorialConceptItem3Title: 'Community',
  tutorialConceptItem3Desc: 'Compare with others',
  tutorialConceptItem4Title: 'Top 3',
  tutorialConceptItem4Desc: 'Showcase your faves',
  tutorialCardTitle: 'A game card, explained',
  tutorialCardSubtitle: "Here's what each element means",
  tutorialCardLegendMeta: 'Press score (out of 100)',
  tutorialCardLegendVscore: 'Ratecade',
  tutorialCardLegendVscoreDesc: 'Community average score',
  tutorialCardLegendRated: 'Rated',
  tutorialCardLegendRatedDesc: "You've rated this game",
  tutorialHonestyTitle: 'Play fair 🤝',
  tutorialHonestyBody: 'Ratecade works because everyone plays honestly. Please respect these rules:',
  tutorialHonestyRule1: "🚫 Don't rate games you haven't played just to gain XP",
  tutorialHonestyRule2: "🚫 Don't artificially tank a game's score out of spite",
  tutorialHonestyRule3: '✅ Rate what you truly feel — your opinion matters',
  tutorialAccountTitle: 'Create your account',
  tutorialAccountSubtitle: 'Save your progress and access your library from any device.',
};

const fr: Translations = {
  // Tabs
  tabHome: 'Accueil',
  tabRank: 'Noter',
  tabSocial: 'Social',
  tabProfile: 'Profil',
  tabSettings: 'Réglages',
  discoverTitle: 'Découvrir',
  rankScreenTitle: 'Notez vos jeux !',
  rankGenreSubtitle: (genres) => `🎯 Recommandé selon tes goûts · ${genres}`,
  discoverHideRated: 'Masquer les notés',
  discoverShowAll: 'Tout afficher',

  // Onboarding
  onboardingWelcome: 'Bienvenue ! 👋',
  onboardingSubtitle: 'Choisis ton avatar et ton pseudo pour commencer.',
  onboardingChoosePhoto: 'Choisir une photo',
  onboardingPlaceholder: 'Ton pseudo...',
  onboardingCTA: 'Commencer →',
  onboardingError: 'Ton pseudo doit faire au moins 2 caractères.',

  // Login
  loginSubtitle: 'Note tes jeux. Construis ta bibliothèque.',
  loginGoogle: 'Continuer avec Google',
  loginApple: 'Continuer avec Apple',
  loginContinueAsGuest: 'Continuer en tant qu\'invité',
  loginOr: 'ou',
  loginSignIn: 'Connexion',
  loginSignUp: 'Créer un compte',
  loginEmail: 'Email',
  loginPassword: 'Mot de passe',
  loginSubmitSignIn: 'Se connecter',
  loginSubmitSignUp: 'Créer mon compte',
  loginSwitchToSignUp: 'Pas encore de compte ? S’inscrire',
  loginSwitchToSignIn: 'Déjà un compte ? Se connecter',
  loginErrorInvalidCredentials: 'Email ou mot de passe incorrect.',
  loginErrorEmailInUse: 'Cet email est déjà utilisé.',
  loginErrorWeakPassword: 'Le mot de passe doit faire au moins 6 caractères.',
  loginErrorGeneric: 'Une erreur est survenue. Réessaie.',
  loginErrorInvalidEmail: 'Adresse email invalide.',
  loginErrorTooManyRequests: 'Trop de tentatives. Attends avant de réessayer.',
  loginErrorCredentialAlreadyInUse: 'Ce compte est déjà enregistré. Clique à nouveau pour t\'y connecter.',
  profileGuestBannerText: 'Tu es en mode invité. Crée un compte pour sauvegarder ta progression et rejoindre la communauté.',
  profileGuestBannerCta: 'Créer un compte',
  tutorialPromoTitle: 'Encore une chose 🚀',
  tutorialPromoSubtitle: 'Tu peux explorer Ratecade en mode invité, mais créer un compte gratuit débloque tout.',
  tutorialPromoBenefit1: '💾  Sauvegarde ta progression sur tous tes appareils',
  tutorialPromoBenefit2: '👥  Compare tes scores avec tes amis',
  tutorialPromoBenefit3: '🏆  Grimpe dans les rangs et gagne des badges',
  tutorialPromoCreateAccount: 'Créer un compte gratuit',
  tutorialPromoLater: 'Continuer en mode invité',
  loginForgotPassword: 'Mot de passe oublié ?',
  loginResetEmailSent: 'Email envoyé',
  loginResetEmailSentMessage: 'Consulte ta boîte mail pour réinitialiser ton mot de passe. Si tu ne le vois pas, vérifie ton dossier spam.',
  loginFillEmailFirst: 'Renseigne ton adresse email d\'abord.',

  // Settings — account
  settingsAccount: 'Compte',
  settingsAccountGoogle: 'Connecté avec Google',
  settingsAccountApple: 'Connecté avec Apple',
  settingsAccountEmail: 'Compte email',
  settingsAccountGuest: 'Mode invité',
  settingsLinkAccount: 'Lier un compte',
  settingsSignOut: 'Se déconnecter',
  settingsSignOutConfirm: 'Se déconnecter ?',
  settingsSignOutMessage: 'Tes données locales sont conservées. Tu pourras te reconnecter plus tard.',
  settingsDeleteAccount: 'Supprimer le compte',
  settingsDeleteAccountConfirm: 'Supprimer le compte ?',
  settingsDeleteAccountMessage: 'Cela supprimera définitivement ton compte et toutes tes données. Cette action est irréversible.',
  settingsDeleteAccountError: 'Impossible de supprimer le compte. Déconnecte-toi et reconnecte-toi avant de réessayer.',

  // Success
  successNewRank: 'Nouveau rang débloqué !',
  successContinue: 'Continuer',
  successTop3: 'Ton ajout au top 3 a bien été comptabilisé',
  successRatingSaved: 'Ta notation a bien été enregistrée sur ton profil !',
  successKeepRanking: 'Continue de noter pour monter en niveau !',
  successBack: 'Retour',

  // Settings
  settingsTitle: 'Réglages',
  settingsMyAccount: 'Mon compte',
  settingsUsernamePlaceholder: 'Ton pseudo',
  settingsSave: 'Sauver',
  settingsCharacters: (n) => `${n}/24 caractères`,
  settingsAppearance: 'Apparence',
  settingsDark: 'Sombre',
  settingsSystem: 'Système',
  settingsLight: 'Clair',
  settingsLanguage: 'Langue',
  settingsNotifications: 'Notifications',
  settingsActivityReminders: "Rappels d'activité",
  settingsNotRatedSub: "Si tu n'as pas noté depuis 3 jours",
  settingsAbout: 'À propos',
  settingsDataProvider: 'Données des jeux fournies par IGDB.com',
  settingsStoredLocally: 'Stockées localement',
  settingsPermissionRequired: 'Permissions requises',
  settingsEnableNotifDesc: "Active les notifications dans les réglages de ton téléphone pour recevoir des rappels.",
  settingsUsernameUpdated: '✓ Pseudo mis à jour',
  settingsNotifBody: "Tu n'as pas noté de jeu depuis quelques jours. De nouvelles sorties t'attendent !",

  // Steam
  settingsSteamSection: 'Plateformes de jeu',
  settingsSteamLink: 'Se connecter avec Steam',
  settingsSteamLinked: 'Steam connecté',
  settingsSteamUnlink: 'Délier',
  settingsSteamError: 'Impossible de se connecter avec Steam. Réessaie.',
  settingsSteamSuccess: '✓ Compte Steam lié !',

  // Profile
  profileChangeUsername: 'Changer de pseudo',
  profileChangeUsernameOnce: 'Tu peux modifier ton pseudo une fois tous les 30 jours.',
  profileChangeUsernameIn: (days) => `Tu pourras changer de pseudo dans ${days} jour${days > 1 ? 's' : ''}.`,
  profileNewUsername: 'Nouveau pseudo...',
  profileAvatarError: 'Impossible de traiter la photo. Réessaie.',
  profilePseudoTaken: 'Ce pseudo est déjà pris.',
  profileSave: 'Enregistrer',
  profileClose: 'Fermer',
  profileShareMessage: (pseudo, rank, xp) => `Viens voir mon profil Ratecade ! Je suis ${pseudo}, rang ${rank} avec ${xp} XP 🎮`,
  profileShareDialogTitle: 'Partager ton profil Ratecade',
  profileMaxRank: 'Rang max atteint !',
  profileRatedGames: 'Jeux notés',
  profileCompleted: 'Terminés',
  profileTotalXP: 'XP total',
  profileScoreDistribution: 'Distribution des notes',
  profileAvgScore: (avg) => `Moy. ${avg} / 5 ⭐`,
  profileCriteriaBreakdown: 'Par critère',
  profileWorstGame: 'Pire note',
  profileTop3Title: 'Mon TOP 3 :',
  profileAllRankedTitle: 'Tous mes jeux notés :',
  profileNoTop3: 'Aucun jeu dans le top 3',
  profileSearchRated: 'Rechercher un jeu noté...',
  profileSortDate: 'Récent',
  profileSortScore: 'Ma note',
  profileSortMeta: 'Score critiques',
  profileSortTitle: 'A → Z',
  profileNoRatings: "Aucun jeu noté pour l'instant",
  profileSteamUnavailable: 'Ta bibliothèque Steam est temporairement indisponible. Réessaie plus tard.',
  profileSteamEmpty: 'Aucun jeu à importer. Vérifie que les détails de tes jeux Steam sont publics.',
  profileNoResultsFor: (query) => `Aucun résultat pour "${query}"`,
  profileShareBtn: 'Partager en image',
  profileCriteriaTitle: 'Profil de goûts',
  profileStrongest: 'Point fort',
  profileWeakest: 'Point faible',
  profileBestGame: 'Meilleur jeu',
  profileCompletionRate: 'Taux de complétion',
  profileSuggestionsTitle: 'Pour toi',
  profileSuggestionsBecause: (genre) => `Parce que tu aimes ${genre}`,
  profileSuggestionsEmpty: 'Note plus de jeux pour des suggestions personnalisées',

  // Lists
  listSectionTitle: 'Mes listes',
  listWishlist: '📌 Wishlist',
  listBacklog: '📚 Backlog',
  listPlaying: '🎮 En cours',
  listCompleted: '✅ Terminés',
  listManageTitle: 'Ajouter à une liste',
  listRemove: 'Retirer de la liste',
  listEmpty: 'Rien ici pour l\'instant',

  // Friends
  friendsAddFriendTitle: 'AJOUTER DES AMIS',
  friendsAddButton: 'Ajouter des amis 👥+',
  friendsMyFriends: 'Mes amis 👥',
  friendsSearch: 'Rechercher par pseudo...',
  friendsSearchHint: 'Tape au moins 2 caractères',
  friendsNoResults: 'Aucun utilisateur trouvé',
  friendsAdd: 'Ajouter',
  friendsCancel: 'Annuler',
  friendsPending: 'En attente',
  friendsAlreadyFriends: 'Amis ✓',
  friendsPageTitle: 'AMIS',
  friendsTabFriends: 'Amis',
  friendsTabSent: 'Envoyées',
  friendsTabReceived: 'Reçues',
  friendsNoFriends: 'Pas encore d\'amis — va en ajouter !',
  friendsNoSent: 'Aucune demande en attente',
  friendsNoReceived: 'Aucune demande reçue',
  friendsAccept: 'Accepter',
  friendsDecline: 'Refuser',
  friendsRemove: 'Supprimer',
  friendsViewProfile: 'Voir le profil',
  friendsRatedGames: 'Jeux notés',
  friendsCompleted: 'Terminés',
  friendsTotalXP: 'XP total',
  friendsNoRatings: 'Aucun jeu noté',
  friendsTop3: 'Top 3',
  friendsNoTop3: 'Pas de top 3',
  friendsLoadError: 'Impossible de charger le profil',
  friendsTabRanking: 'Classement',
  friendsRankingEmpty: 'Aucun joueur pour l\'instant',
  friendsRankingGlobal: 'Global',
  friendsRankingFriends: 'Amis',
  friendsRankingNoFriends: 'Ajoute des amis pour voir leur classement',
  friendsTabFeed: 'Activité',
  friendsFeedEmpty: 'Aucune activité récente de tes amis.',
  friendsFeedRated: (pseudo, game) => `${pseudo} a noté ${game}`,
  friendsCompareCommon: (n) => `${n} jeu${n > 1 ? 'x' : ''} en commun`,
  friendsCompareSimilarity: (pct) => `${pct}% de goûts similaires`,
  friendsCompareNoCommon: 'Aucun jeu en commun pour l\'instant.',
  friendsCompareSection: 'Comparaison',
  friendsMemberSince: 'Membre depuis',
  friendsInviteContact: 'Inviter un contact',
  friendsInviteTitle: 'Invitation Ratecade',
  friendsInviteMessage: (uid) => `Rejoins-moi sur Ratecade 🎮\nAjoute-moi en ami directement : ratecade://invite/${uid}\n\nTu n'as pas encore Ratecade ? Télécharge l'app sur l'App Store !`,
  inviteNotFound: 'Utilisateur introuvable.',
  inviteBackHome: 'Retour à l\'accueil',
  inviteSubtitle: 't\'invite à le rejoindre sur Ratecade',
  inviteLoginHint: 'Connecte-toi pour ajouter cet utilisateur en ami.',
  inviteLogin: 'Se connecter',
  inviteOwnLink: 'C\'est ton propre lien d\'invitation 😄',
  inviteSent: 'Demande envoyée !',
  inviteAlreadyFriends: 'Vous êtes déjà amis.',
  inviteAdd: 'Ajouter en ami',
  inviteHome: 'Aller sur Ratecade',
  inviteSendError: 'Impossible d\'envoyer la demande. Vérifie ta connexion puis réessaie.',

  // Search / common
  searchPlaceholder: 'Recherche un jeu...',
  noGamesAvailable: 'Aucun jeu disponible',
  ratedBadgeLabel: 'NOTÉ',
  noResults: 'Aucun résultat',
  noGameForQuery: (query) => `Aucun jeu trouvé pour "${query}"`,
  noGameForFilters: 'Aucun jeu trouvé avec ces filtres',
  filterSectionLabel: 'Filtres',
  clearAll: 'Tout effacer ✕',
  commonLoadError: 'Impossible de charger ce jeu. Vérifie ta connexion puis réessaie.',
  commonRetry: 'Réessayer',
  commonErrorTitle: 'Erreur',
  commonActionError: 'Une erreur est survenue. Vérifie ta connexion puis réessaie.',
  commonCancel: 'Annuler',
  commonLoading: 'Chargement...',
  commonSearchError: 'Erreur de recherche.',
  commonGameNotFound: 'Jeu introuvable dans le catalogue.',
  friendsNoGames: 'Ajoute des amis pour débloquer cette section',

  // Genre / tag filter labels
  filterAction: 'Action',
  filterAdventure: 'Aventure',
  filterRPG: 'RPG',
  filterSports: 'Sports',
  filterRacing: 'Course',
  filterFPS: 'FPS',
  filterStrategy: 'Stratégie',
  filterHorror: 'Horreur',
  filterPuzzle: 'Puzzle',
  filterSolo: 'Solo',
  filterMultiplayer: 'Multijoueur',
  filterRecent: 'Récents',

  // Discover section titles
  sections: {
    popular:     '🔥 Les plus populaires',
    trending:    '🌟 Tendances du moment',
    top_rated:   '⭐ Les mieux notés par la critique',
    community:   '👥 Top Ratecade communauté',
    recommended: '🎯 Recommandés pour toi',
    friends_liked: '❤️  Tes amis aiment ces titres',
    recent:      '🆕 Sorties récentes',
    action:      '⚔️  Action & Aventure',
    rpg:         '🗡️  RPG',
    shooter:     '🎯 Shooters',
    indie:       '💎 Pépites indé',
    strategy:    '🧠 Stratégie',
    horror:      '👻 Horreur & Survival',
    platformer:  '🏃 Plateformers',
    adventure:   '🗺️  Aventure',
    puzzle:      '🧩 Puzzle & Réflexion',
    simulation:  '🏙️  Simulation',
    sports:      '⚽ Sports',
    fighting:    '🥊 Combat',
    racing:      '🏎️  Racing',
    mmo:         '👾 MMO & Multijoueur',
    casual:      '🎲 Casual & Party Games',
    arcade:      '🕹️  Arcade & Rétro',
    family:      '👨‍👩‍👧 Famille',
    board:       '♟️  Jeux de société / Cartes',
  },

  // Game detail
  gameRelease: '📅 Sortie',
  gameAvgTime: '⏱ Durée moy.',
  gameDeveloper: '🏢 Développeur',
  gamePublisher: '🏬 Éditeur',
  gameViewOnSteam: 'Voir sur Steam',
  gameCommunityRatings: 'Notes de la communauté',
  gameAbout: 'À propos',
  gameScreenshots: 'Screenshots',
  gameSimilar: 'Jeux similaires',
  gameRankBtn: 'NOTER CE JEU',
  gameCriteriaGeneral: 'Général',
  gameCriteriaGraphics: 'Graphismes',
  gameCriteriaGameplay: 'Gameplay',
  gameCriteriaStory: 'Histoire',
  gameCriteriaLifespan: 'Durée de vie',
  gameDateLocale: 'fr-FR',

  // Rank screen
  rankCriteriaOverall: 'Note générale',
  rankCriteriaGraphics: 'Graphismes',
  rankCriteriaGameplay: 'Gameplay',
  rankCriteriaStory: 'Histoire',
  rankCriteriaLifespan: 'Durée de vie',
  rankCommunityAvg: (avg) => `moy. ${avg} ⭐`,
  rankErrorRequired: '⚠ Merci de noter tous les critères obligatoires.',
  rankSubmit: 'VALIDER',
  rankSubmitTop3: 'VALIDER ET AJOUTER AU TOP 3',
  rankSaving: 'Sauvegarde...',
  rankSaveChanges: '✓  Valider les modifications',
  rankReplaceWith: 'Quel jeu remplacer par',
  rankCancel: 'Annuler',
  rankRemoveTitle: 'Retirer cette note',
  rankRemoveMessage: (game, ratingXp, top3Xp, losesTop3) => `Supprimer ta note pour "${game}" ? Tu perdras ${ratingXp} XP${losesTop3 ? ` + ${top3Xp} XP (Top 3)` : ''}.`,
  rankRemoveButton: 'Retirer',
  rankReviewLabel: 'Ta critique (facultatif)',
  rankReviewPlaceholder: 'Partage ton avis sur ce jeu...',
  rankCompletedLabel: 'J\'ai terminé ce jeu',
  rankCompletedBanner: 'des joueurs Ratecade ont terminé ce jeu',
  rankHoursLabel: 'Temps de jeu',
  notifTitle: 'Il est temps de noter un jeu',
  notifBody: "De nouvelles découvertes t'attendent sur Ratecade.",
  notifFriendRequestTitle: "👥 Nouvelle demande d'ami !",
  notifFriendRequestBody: (count) => `Tu as ${count} nouvelle${count > 1 ? 's' : ''} demande${count > 1 ? 's' : ''} d'ami.`,
  notifFriendAcceptedTitle: "🎉 Demande d'ami acceptée !",
  notifFriendAcceptedBody: "Quelqu'un a accepté ta demande d'ami sur Ratecade.",

  // Tutorial
  tutorialSkip: 'Passer',
  tutorialNext: 'Suivant →',
  tutorialStart: "C'est parti ! 🚀",
  tutorialLanguageTitle: 'Bienvenue sur Ratecade ! 🎮',
  tutorialLanguageSubtitle: 'Ta librairie de jeux personnelle. Avant de commencer, choisis ta langue.',
  tutorialConceptTitle: 'Comment ça marche',
  tutorialConceptBody: 'Note chaque jeu que tu as fait. Plus tu notes, plus ton rang monte. Construis ta bibliothèque ultime et découvre ce que pense la communauté.',
  tutorialConceptItem1Title: 'Noter',
  tutorialConceptItem1Desc: 'Note et explore les jeux',
  tutorialConceptItem2Title: 'XP & Rangs',
  tutorialConceptItem2Desc: 'Monte en grade en notant',
  tutorialConceptItem3Title: 'Communauté',
  tutorialConceptItem3Desc: 'Compare avec les autres',
  tutorialConceptItem4Title: 'Top 3',
  tutorialConceptItem4Desc: 'Mets tes jeux préférés en avant',
  tutorialCardTitle: 'Une carte de jeu, détaillée',
  tutorialCardSubtitle: 'Voici ce que signifie chaque élément',
  tutorialCardLegendMeta: 'Score presse (sur 100)',
  tutorialCardLegendVscore: 'Ratecade',
  tutorialCardLegendVscoreDesc: 'Moyenne de la communauté',
  tutorialCardLegendRated: 'Noté',
  tutorialCardLegendRatedDesc: 'Tu as noté ce jeu',
  tutorialHonestyTitle: 'Joue le jeu 🤝',
  tutorialHonestyBody: 'Ratecade fonctionne parce que tout le monde joue honnêtement. Respecte ces règles :',
  tutorialHonestyRule1: "🚫 Ne note pas des jeux que tu n'as pas faits pour gagner de l'XP",
  tutorialHonestyRule2: '🚫 Ne sous-note pas un jeu par dépit ou pour baisser sa note',
  tutorialHonestyRule3: '✅ Note ce que tu ressens vraiment — ton avis compte',
  tutorialAccountTitle: 'Crée ton compte',
  tutorialAccountSubtitle: "Sauvegarde ta progression et accède à ta bibliothèque depuis n'importe quel appareil.",
};

export const TRANSLATIONS: Record<Language, Translations> = { en, fr };
