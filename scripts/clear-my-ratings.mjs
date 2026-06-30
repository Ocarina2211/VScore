// Script : supprime TOUTES les notes d'un utilisateur + met à jour game_stats
// Usage  : node scripts/clear-my-ratings.mjs <serviceAccountKey.json> <uid>
//
// Pour trouver ton UID :
//   Firebase Console → Authentication → Users → copie l'UID de ton compte
//
// Pour obtenir la clé de service :
//   Firebase Console → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const keyPath = process.argv[2];
const targetUid = process.argv[3];

if (!keyPath || !targetUid) {
  console.error('❌ Usage : node scripts/clear-my-ratings.mjs <serviceAccountKey.json> <uid>');
  process.exit(1);
}

const serviceAccount = require(keyPath.startsWith('/') ? keyPath : `../${keyPath}`);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function clearRatings() {
  console.log(`\n🗑  Suppression des notes de l'utilisateur : ${targetUid}\n`);

  // 1. Lire toutes les notes de l'utilisateur
  const gamesRef = db.collection('ratings').doc(targetUid).collection('games');
  const snap = await gamesRef.get();

  if (snap.empty) {
    console.log('✅ Aucune note trouvée pour cet utilisateur.');
    return;
  }

  console.log(`📋 ${snap.size} note(s) trouvée(s), suppression en cours...`);

  // 2. Pour chaque note, mettre à jour game_stats et supprimer la note
  let deleted = 0;
  let errors = 0;

  for (const ratingDoc of snap.docs) {
    const gameId = ratingDoc.id;
    const data = ratingDoc.data();
    const avg = data.avg ?? 0;
    const completed = data.completed ?? false;

    try {
      // Mettre à jour game_stats (soustrait la contribution de cet utilisateur)
      const statsRef = db.collection('game_stats').doc(gameId);
      const statsSnap = await statsRef.get();

      if (statsSnap.exists) {
        const stats = statsSnap.data();
        const newCount = Math.max(0, (stats.count ?? 0) - 1);

        if (newCount === 0) {
          // Dernier votant → supprimer le doc game_stats entièrement
          await statsRef.delete();
          console.log(`  🗑  game_stats/${gameId} supprimé (plus aucun vote).`);
        } else {
          // Recalculer les moyennes sans cette note
          const oldGen  = data.general  ?? 0;
          const oldGfx  = data.graphics ?? 0;
          const oldPlay = data.gameplay ?? 0;
          const oldStr  = data.story    ?? 0;
          const oldLife = data.lifespan ?? 0;

          const newTotal    = Math.max(0, (stats.totalScore    ?? 0) - avg);
          const newTotalGen = Math.max(0, (stats.totalGeneral  ?? 0) - oldGen);
          const newTotalGfx = Math.max(0, (stats.totalGraphics ?? 0) - oldGfx);
          const newTotalPl  = Math.max(0, (stats.totalGameplay ?? 0) - oldPlay);
          const newTotalStr = Math.max(0, (stats.totalStory    ?? 0) - oldStr);
          const newTotalLf  = Math.max(0, (stats.totalLifespan ?? 0) - oldLife);
          const totalComp   = Math.max(0, (stats.totalCompleted ?? 0) - (completed ? 1 : 0));

          await statsRef.update({
            count:           newCount,
            totalScore:      newTotal,
            avgScore:        newTotal / newCount,
            totalGeneral:    newTotalGen,
            totalGraphics:   newTotalGfx,
            totalGameplay:   newTotalPl,
            totalStory:      newTotalStr,
            totalLifespan:   newTotalLf,
            avgGeneral:      newTotalGen / newCount,
            avgGraphics:     newTotalGfx / newCount,
            avgGameplay:     newTotalPl  / newCount,
            avgStory:        newTotalStr / newCount,
            avgLifespan:     newTotalLf  / newCount,
            totalCompleted:  totalComp,
            completedPercent: (totalComp / newCount) * 100,
            updatedAt:       FieldValue.serverTimestamp(),
          });
        }
      }

      // Supprimer la note de l'utilisateur
      await ratingDoc.ref.delete();
      deleted++;
      process.stdout.write(`\r  ✅ ${deleted}/${snap.size} notes supprimées...`);

    } catch (e) {
      errors++;
      console.error(`\n  ❌ Erreur sur le jeu ${gameId} :`, e.message);
    }
  }

  // 3. Réinitialiser XP et Top3 dans le profil utilisateur
  try {
    await db.collection('users').doc(targetUid).update({
      xp:    0,
      top3:  [],
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('\n\n  ✅ Profil Firestore réinitialisé (xp=0, top3=[]).');
  } catch (e) {
    console.error('\n  ❌ Impossible de réinitialiser le profil :', e.message);
  }

  console.log(`\n\n🎉 Terminé ! ${deleted} note(s) supprimée(s), ${errors} erreur(s).`);
  console.log('\n⚠️  N\'oublie pas de vider aussi le cache local de l\'app :');
  console.log('   → Désinstalle et réinstalle l\'app sur ton iPhone, ou');
  console.log('   → Déconnecte-toi puis reconnecte-toi dans l\'app.');
}

clearRatings().catch((e) => {
  console.error('❌ Erreur fatale :', e);
  process.exit(1);
});
