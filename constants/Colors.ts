export type ColorScheme = {
  background: string;
  backgroundSecondary: string;
  primary: string;
  primaryLight: string;
  accent: string;
  text: string;
  textSecondary: string;
  tabBar: string;
  tabBarActive: string;
  star: string;
  starEmpty: string;
  metaScore: string;
  ranks: {
    bronze: string;
    silver: string;
    gold: string;
    platine: string;
    rubis: string;
    saphir: string;
    diamant: string;
  };
};

export const DarkColors: ColorScheme = {
  background: '#0D0D1A',
  backgroundSecondary: '#1A1A2E',
  primary: '#7B2FBE',
  primaryLight: '#9B59B6',
  accent: '#00FF88',
  text: '#FFFFFF',
  textSecondary: '#A0A0B0',
  tabBar: '#1E1E3A',
  tabBarActive: '#7B2FBE',
  star: '#FFD700',
  starEmpty: '#3A3A5A',
  metaScore: '#00C853',
  ranks: {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platine: '#00C9A7',
    rubis: '#E74C3C',
    saphir: '#3498DB',
    diamant: '#B9F2FF',
  },
};

export const LightColors: ColorScheme = {
  background: '#F2F2F7',
  backgroundSecondary: '#FFFFFF',
  primary: '#7B2FBE',
  primaryLight: '#9B59B6',
  accent: '#00AA55',
  text: '#0D0D1A',
  textSecondary: '#6E6E82',
  tabBar: '#FFFFFF',
  tabBarActive: '#7B2FBE',
  star: '#F59E0B',
  starEmpty: '#CCCCDD',
  metaScore: '#00C853',
  ranks: {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platine: '#00C9A7',
    rubis: '#E74C3C',
    saphir: '#3498DB',
    diamant: '#B9F2FF',
  },
};

// Backwards-compatible default export (dark theme)
export const Colors = DarkColors;