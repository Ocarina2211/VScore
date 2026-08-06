# Ratecade

Ratecade est une application mobile de découverte, de notation et de suivi de
jeux vidéo. Elle aide les joueurs à trouver leur prochain jeu, à noter ceux
qu’ils ont terminés et à garder une trace de leur expérience.

## Fonctionnalités

- découverte de jeux avec recherche, filtres et recommandations ;
- notation détaillée : note générale, graphismes, gameplay, histoire et durée de vie ;
- listes personnelles : jeux à découvrir, en cours et terminés ;
- classement et progression XP ;
- profil joueur avec Top 3 ;
- amis, demandes d’amis et activité communautaire ;
- interface française et anglaise avec thème sombre et clair.

## Technologies

- Expo et React Native avec TypeScript ;
- Firebase Authentication et Firestore pour les comptes et les données communautaires ;
- Worker Cloudflare authentifié pour les services de catalogue et les API externes ;
- IGDB et Steam pour les informations de jeux.

Les clés des fournisseurs externes ne sont jamais embarquées dans l’application.

## Développement local

```bash
npm install
npx expo start
```

Contrôles avant livraison :

```bash
npm run lint
npx tsc --noEmit
npx expo-doctor
npm audit
```

## Worker du catalogue

Le code se trouve dans `vscore-api/`. Pour le développement local, copier
`.dev.vars.example` vers `.dev.vars` et renseigner les valeurs localement. Le
fichier `.dev.vars` est ignoré par Git.

Secrets Cloudflare requis :

- `IGDB_CLIENT_ID`
- `IGDB_CLIENT_SECRET`
- `STEAM_API_KEY`
- `DEEPL_API_KEY`

`FIREBASE_PROJECT_ID` est une variable non secrète définie dans
`vscore-api/wrangler.jsonc`.

```bash
cd vscore-api
npm install
npx tsc --noEmit
npm test -- --run
npx wrangler secret list
npm run deploy
```

## Sécurité et publication GitHub

Ne jamais commit les secrets Cloudflare (`IGDB_CLIENT_SECRET`, `STEAM_API_KEY` et
`DEEPL_API_KEY`). En local, ils vont dans `vscore-api/.dev.vars`, qui est ignoré
par Git ; en production, ils sont ajoutés avec `wrangler secret put`.

La configuration Firebase visible dans `services/firebase.ts` contient une clé
publique. Les permissions sont contrôlées par `firestore.rules`.

Déployer uniquement les règles gratuites avec :

```bash
npx firebase-tools deploy --only firestore:rules
```

Firebase Storage n’est pas activé. Les avatars restent donc locaux si Storage
n’est pas configuré. Les règles `storage.rules` sont préparées pour plus tard,
mais ne sont pas déployées.

Les agrégats `game_stats` sont encore mis à jour par le client. Les règles
limitent les écritures invalides, mais un utilisateur motivé pourrait encore
falsifier ses statistiques.

## Firebase Functions

Les fonctions envoient les notifications et réalisent la suppression complète
d’un compte (`deleteMyAccount`). Elles utilisent Node 22.

Les événements de notification portent un champ `expiresAt`. Activer la
politique TTL Firestore sur `notification_events.expiresAt` afin que ces marqueurs
d’idempotence soient supprimés automatiquement après 30 jours.

```bash
cd functions
npm install
node --check index.js
```

Le déploiement des Functions nécessite le forfait Firebase Blaze et n’est donc
pas requis pour utiliser l’application. Ne jamais placer une clé de compte de
service dans le dépôt ; les scripts d’administration reçoivent son chemin en
argument.
