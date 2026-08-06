// Script: crée un faux profil "Leo" dans Firestore pour les tests
// Usage: node scripts/create-test-user.mjs <chemin-vers-serviceAccountKey.json>
// Télécharge la clé de service depuis :
//   Firebase Console → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('❌ Usage: node scripts/create-test-user.mjs <serviceAccountKey.json>');
  console.error('   Télécharge la clé depuis Firebase Console → Paramètres → Comptes de service');
  process.exit(1);
}

const serviceAccount = require(keyPath.startsWith('/') ? keyPath : `../${keyPath}`);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const LEO_UID = 'test-user-leo-001';

// Client-side catalog IDs are the IGDB numeric ID plus 1,000,000,000.
// Steam headers keep this fixture independent from the retired RAWG CDN.
const games = {
  witcher3: {
    gameId: 1_000_001_942,
    name: 'The Witcher 3: Wild Hunt',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg',
  },
  redDead2: {
    gameId: 1_000_025_076,
    name: 'Red Dead Redemption 2',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg',
  },
  godOfWar: {
    gameId: 1_000_019_560,
    name: 'God of War',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1593500/header.jpg',
  },
  cyberpunk2077: {
    gameId: 1_000_001_877,
    name: 'Cyberpunk 2077',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
  },
  portal2: {
    gameId: 1_000_000_072,
    name: 'Portal 2',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/header.jpg',
  },
  eldenRing: {
    gameId: 1_000_119_133,
    name: 'Elden Ring',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
  },
  battlefield1: {
    gameId: 1_000_018_320,
    name: 'Battlefield 1',
    background_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1238840/header.jpg',
  },
};

const ratedGames = [
  {
    ...games.witcher3,
    general: 5, graphics: 5, gameplay: 5, story: 5, lifespan: 5,
    completed: true, top3XpAwarded: true,
  },
  {
    ...games.redDead2,
    general: 5, graphics: 5, gameplay: 4, story: 5, lifespan: 4,
    completed: true, top3XpAwarded: true,
  },
  {
    ...games.godOfWar,
    general: 5, graphics: 5, gameplay: 5, story: 4, lifespan: 4,
    completed: true, top3XpAwarded: true,
  },
  {
    ...games.cyberpunk2077,
    general: 4, graphics: 5, gameplay: 4, story: 4, lifespan: 3,
    completed: true,
  },
  {
    ...games.portal2,
    general: 5, graphics: 4, gameplay: 5, story: 4, lifespan: 3,
    completed: true,
  },
  {
    ...games.eldenRing,
    general: 4, graphics: 4, gameplay: 5, story: 3, lifespan: 5,
    completed: false,
  },
  {
    ...games.battlefield1,
    general: 3, graphics: 4, gameplay: 3, story: 3, lifespan: 3,
    completed: false,
  },
];

const top3 = ratedGames.slice(0, 3).map(({ gameId, ...rating }) => ({ id: gameId, ...rating }));

// Upsert public profile
await db.doc(`users/${LEO_UID}`).set({
  pseudo: 'Leo',
  pseudoLower: 'leo',
  avatarUri: '',
  xp: ratedGames.length * 200 + top3.length * 300,
  top3,
  updatedAt: Timestamp.now(),
});

// Upsert each rating
for (const game of ratedGames) {
  const { gameId, name, background_image, completed, ...scores } = game;
  const avg = (scores.general + scores.graphics + scores.gameplay + scores.lifespan) / 4;
  await db.doc(`ratings/${LEO_UID}/games/${gameId}`).set({
    ...scores,
    avg,
    name,
    background_image,
    completed,
    updatedAt: Timestamp.now(),
  });
  console.log(`  ✔ ${name} — note générale: ${scores.general}/5`);
}

console.log(`\n✅ Profil "Leo" mis à jour (top3 + ${ratedGames.length} jeux notés) — UID: ${LEO_UID}`);
process.exit(0);
