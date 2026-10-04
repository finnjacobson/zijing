import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CharShard, Script } from '../lib/types';
import { Pinyin } from './Pinyin';
import { zhLang } from '../lib/convert';

export function CommonWords({ shard, script }: { shard: CharShard; script: Script }) {
  const [all, setAll] = useState(false);
  const self = new Set([shard.c, ...(shard.trad ?? []), ...(shard.simp ?? [])]);
  const words = shard.w;
  if (!words.length) return <div className="empty-state">No multi-character words with this character in CC-CEDICT.</div>;
  const maxF = Math.max(...words.map((w) => w[4]), 1);
  const shown = all ? words : words.slice(0, 12);
  return (
    <>
      <ol className="words">
        {shown.map(([t, s, p, g, f]) => {
          const form = script === 'trad' ? t : s;
          return (
            <li key={t + s} className="word-row">
              <span className="word-form" lang={zhLang(script)}>
                {[...form].map((c, i) => (
                  <Link key={i} to={`/char/${c}`} className={self.has(c) ? 'self' : ''}>
                    {c}
                  </Link>
                ))}
              </span>
              <span className="word-py">
                <Pinyin p={p} compact />
              </span>
              <span className="word-gloss">{g}</span>
              <span className="freq" title={f ? `${f} per million words (SUBTLEX-CH)` : 'not in SUBTLEX-CH'}>
                <span style={{ width: `${f ? Math.max(4, (Math.log10(f + 1) / Math.log10(maxF + 1)) * 100) : 0}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
      {words.length > 12 && (
        <button className="btn ghost small" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${words.length}`}
        </button>
      )}
      <p className="faint small">Ranked by SUBTLEX-CH film-subtitle frequency; bar is log-scaled.</p>
    </>
  );
}
