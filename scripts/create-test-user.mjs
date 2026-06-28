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

const top3 = [
  {
    id: 3498,
    name: 'The Witcher 3: Wild Hunt',
    background_image: 'https://media.rawg.io/media/games/618/618c2031a07bbff6b4f611f10b6bcdbc.jpg',
  },
  {
    id: 28,
    name: 'Red Dead Redemption 2',
    background_image: 'https://media.rawg.io/media/games/511/5118aff5091cb3efec399c808f8c598f.jpg',
  },
  {
    id: 58175,
    name: 'God of War',
    background_image: 'https://media.rawg.io/media/games/4be/4be6a6ad0364751a96229c56bf69be73.jpg',
  },
];

const ratedGames = [
  {
    gameId: 3498,
    name: 'The Witcher 3: Wild Hunt',
    background_image: 'https://media.rawg.io/media/games/618/618c2031a07bbff6b4f611f10b6bcdbc.jpg',
    general: 5, graphics: 5, gameplay: 5, story: 5, lifespan: 5,
    completed: true,
  },
  {
    gameId: 28,
    name: 'Red Dead Redemption 2',
    background_image: 'https://media.rawg.io/media/games/511/5118aff5091cb3efec399c808f8c598f.jpg',
    general: 5, graphics: 5, gameplay: 4, story: 5, lifespan: 4,
    completed: true,
  },
  {
    gameId: 58175,
    name: 'God of War',
    background_image: 'https://media.rawg.io/media/games/4be/4be6a6ad0364751a96229c56bf69be73.jpg',
    general: 5, graphics: 5, gameplay: 5, story: 4, lifespan: 4,
    completed: true,
  },
  {
    gameId: 41494,
    name: 'Cyberpunk 2077',
    background_image: 'https://media.rawg.io/media/games/26d/26d4437715bee60138dab4a7c8c59c92.jpg',
    general: 4, graphics: 5, gameplay: 4, story: 4, lifespan: 3,
    completed: true,
  },
  {
    gameId: 4200,
    name: 'Portal 2',
    background_image: 'https://media.rawg.io/media/games/328/3283617cb7d75d67257fc58339188742.jpg',
    general: 5, graphics: 4, gameplay: 5, story: 4, lifespan: 3,
    completed: true,
  },
  {
    gameId: 12020,
    name: 'Elden Ring',
    background_image: 'https://media.rawg.io/media/games/b29/b294f90eb90c07cbbe9e72f62aacd443.jpg',
    general: 4, graphics: 4, gameplay: 5, story: 3, lifespan: 5,
    completed: false,
  },
  {
    gameId: 3070,
    name: 'Battlefield 1',
    background_image: 'https://media.rawg.io/media/games/b45/b45575f34285f2c4479c9a5f8d8a6519.jpg',
    general: 3, graphics: 4, gameplay: 3, story: 3, lifespan: 3,
    completed: false,
  },
];

// Upsert public profile
await db.doc(`users/${LEO_UID}`).set({
  pseudo: 'Leo',
  pseudoLower: 'leo',
  avatarUri: '',
  xp: 2400,
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
