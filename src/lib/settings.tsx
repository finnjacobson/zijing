import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { appGet, appSet } from './db';
import type { Script } from './types';

export interface Settings {
  script: Script;
  /** text carved on the seal stamp (1–4 characters) */
  sealText: string;
  /** 'm' = Make Me a Hanzi (mainland order), 't' = AnimCJK Taiwan order when available */
  strokeStd: 'm' | 't';
  masteryOverlay: boolean;
  showPinyin: boolean;
  toneColors: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  script: 'trad',
  sealText: '馮哲',
  strokeStd: 'm',
  masteryOverlay: false,
  showPinyin: false,
  toneColors: true,
};

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void } | null>(null);

const LS_KEY = 'zijing-settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  // localStorage gives a synchronous first paint; IndexedDB is the durable copy included in backups.
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  useEffect(() => {
    appGet<Partial<Settings>>('settings').then((s) => s && setSettings((cur) => ({ ...cur, ...s })));
  }, []);
  const update = (p: Partial<Settings>) =>
    setSettings((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      appSet('settings', next);
      return next;
    });
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside provider');
  return v;
}
