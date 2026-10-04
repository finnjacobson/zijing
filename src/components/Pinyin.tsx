import { parseNumbered, syllableToMarked } from '../lib/pinyin';

/** Tone-coloured pinyin from CEDICT numbered syllables. `compact` joins a word's syllables ("xuéxí", "Xī'ān"). */
export function Pinyin({ p, compact = false, numbers = false }: { p: string; compact?: boolean; numbers?: boolean }) {
  const syls = p.split(/\s+/).filter(Boolean);
  return (
    <span className="pinyin">
      {syls.map((s, i) => {
        const syl = parseNumbered(s);
        if (!syl) return <span key={i}>{(i && !compact ? ' ' : '') + s}</span>;
        const sep = i === 0 ? '' : compact ? (/^[aeo]/.test(syl.base) ? "'" : '') : ' ';
        return (
          <span key={i} className={'tone' + syl.tone}>
            {sep}
            {numbers ? s.replace('u:', 'ü').replace(/v/g, 'ü') : syllableToMarked(syl)}
          </span>
        );
      })}
    </span>
  );
}
