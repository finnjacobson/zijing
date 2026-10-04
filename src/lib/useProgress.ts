import { useEffect, useState } from 'react';
import { allProgress, getProgress, onProgressChange, type CharProgress } from './db';

/** All stored progress, keyed by character; refreshes on any change. */
export function useAllProgress(enabled = true) {
  const [map, setMap] = useState<Map<string, CharProgress>>(new Map());
  useEffect(() => {
    if (!enabled) return;
    const load = () => allProgress().then((l) => setMap(new Map(l.map((p) => [p.c, p]))));
    load();
    return onProgressChange(load);
  }, [enabled]);
  return map;
}

export function useCharProgress(c: string) {
  const [p, setP] = useState<CharProgress | undefined>();
  useEffect(() => {
    let live = true;
    const load = () => getProgress(c).then((v) => live && setP(v));
    load();
    const off = onProgressChange(load);
    return () => {
      live = false;
      off();
    };
  }, [c]);
  return p;
}
