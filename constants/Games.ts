export const RAWG_API_KEY = '9a4b7d0d354f407b97dbd8d3d2ed53b0';
export const RAWG_BASE_URL = 'https://api.rawg.io/api';

export const XP_PER_RATING = 200;
export const XP_PER_TOP3 = 300;

export const RANKS = [
  { name: 'Bronze',  minXP: 0,     color: '#CD7F32', image: require('../assets/images/RanksPNG/bronze.png') },
  { name: 'Argent',  minXP: 500,   color: '#C0C0C0', image: require('../assets/images/RanksPNG/silver.png') },
  { name: 'Or',      minXP: 1500,  color: '#FFD700', image: require('../assets/images/RanksPNG/gold.png') },
  { name: 'Platine', minXP: 3000,  color: '#00C9A7', image: require('../assets/images/RanksPNG/platine.png') },
  { name: 'Rubis',   minXP: 6000,  color: '#E74C3C', image: require('../assets/images/RanksPNG/rubis.png') },
  { name: 'Saphir',  minXP: 10000, color: '#3498DB', image: require('../assets/images/RanksPNG/saphir.png') },
  { name: 'Diamant', minXP: 20000, color: '#B9F2FF', image: require('../assets/images/RanksPNG/diamant.png') },
];

export const getRank = (xp: number) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) return RANKS[i];
  }
  return RANKS[0];
};

export const getNextRank = (xp: number) => {
  for (let i = 0; i < RANKS.length; i++) {
    if (xp < RANKS[i].minXP) return RANKS[i];
  }
  return null;
};