'use client';

import { createContext, useContext, useState } from 'react';
import { CONTENT, type Lang } from '../content';

type LanguageContextValue = {
  lang: Lang;
  t: (typeof CONTENT)[Lang];
  toggle: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');
  const toggle = () => setLang((l) => (l === 'ar' ? 'en' : 'ar'));

  return (
    <LanguageContext.Provider value={{ lang, t: CONTENT[lang], toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
