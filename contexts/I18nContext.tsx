import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Language, TRANSLATIONS, Translations } from '../constants/translations';

export type LanguagePref = Language | 'system';

type I18nContextType = {
  isReady: boolean;
  languagePref: LanguagePref;
  setLanguagePref: (pref: LanguagePref) => void;
  t: Translations;
};

const I18nContext = createContext<I18nContextType>({
  isReady: false,
  languagePref: 'system',
  setLanguagePref: () => {},
  t: TRANSLATIONS.en,
});

const LANG_KEY = 'vscore_language';

function getDeviceLanguage(): Language {
  const locale = getLocales()[0]?.languageCode ?? 'en';
  return locale === 'fr' ? 'fr' : 'en';
}

function resolveLanguage(pref: LanguagePref): Language {
  return pref === 'system' ? getDeviceLanguage() : pref;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [languagePref, setLanguagePrefState] = useState<LanguagePref>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((val) => {
        if (val === 'en' || val === 'fr' || val === 'system') {
          setLanguagePrefState(val);
        } else {
          // First launch — default to system
          setLanguagePrefState('system');
          AsyncStorage.setItem(LANG_KEY, 'system');
        }
      })
      .finally(() => setIsReady(true));
  }, []);

  const setLanguagePref = useCallback((pref: LanguagePref) => {
    setLanguagePrefState(pref);
    AsyncStorage.setItem(LANG_KEY, pref);
  }, []);

  const resolvedLang = resolveLanguage(languagePref);

  return (
    <I18nContext.Provider value={{ isReady, languagePref, setLanguagePref, t: TRANSLATIONS[resolvedLang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useTranslation = () => useContext(I18nContext).t;
export const useI18nReady = () => useContext(I18nContext).isReady;
export const useLanguage = () => {
  const { languagePref, setLanguagePref } = useContext(I18nContext);
  return { languagePref, setLanguagePref };
};
export const useResolvedLanguage = (): Language => {
  const { languagePref } = useContext(I18nContext);
  return resolveLanguage(languagePref);
};
