import { Link } from 'react-router-dom';
import type { CharShard, Script, SeriesMember } from '../lib/types';
import { closeness, CLOSENESS_LABEL, type Closeness } from '../lib/phonology';
import { Pinyin } from './Pinyin';
import { zhLang } from '../lib/convert';

const ORDER: Closeness[] = ['same', 'tone', 'rime', 'initial', 'far'];

function Series({ head, members, current, script }: { head: string; members: SeriesMember[]; current: string; script: Script }) {
  // Hide forms that belong only to the other script (keeps 媽 and 妈 from both appearing).
  const visible = members.filter(([c, , k]) => c === head || k === 'b' || (script === 'trad' ? k === 't' : k === 's'));
  const headPy = members.find((m) => m[0] === head)?.[1] ?? null;
  const rest = visible.filter((m) => m[0] !== head);
  const groups = new Map<Closeness, SeriesMember[]>();
  for (const m of rest) {
    const k = closeness(headPy, m[1]);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const regular = (groups.get('same')?.length ?? 0) + (groups.get('tone')?.length ?? 0) + (groups.get('rime')?.length ?? 0);
  return (
    <div className="series">
      <div className="series-head">
        <Link to={`/char/${head}`} className={'series-root kai' + (head === current ? ' current' : '')} lang={zhLang(script)}>
          {head}
        </Link>
        <div>
          <div className="series-title">
            Phonetic {headPy && <Pinyin p={headPy} />}
            <span className="faint small"> · {rest.length} characters use it</span>
          </div>
          {rest.length > 0 && (
            <div className="regularity" title="Share of the series that still rhymes with the phonetic">
              <div className="reg-bar">
                {ORDER.map((k) => {
                  const n = groups.get(k)?.length ?? 0;
                  return n ? <span key={k} className={'reg-' + k} style={{ flexGrow: n }} title={`${CLOSENESS_LABEL[k]}: ${n}`} /> : null;
                })}
              </div>
              <span className="small muted">{Math.round((100 * regular) / rest.length)}% still rhyme</span>
            </div>
          )}
        </div>
      </div>
      {rest.length === 0 && <div className="empty-state">No other characters in the data use {head} as their sound component.</div>}
      {ORDER.map((k) => {
        const g = groups.get(k);
        if (!g?.length) return null;
        return (
          <div key={k} className={'series-group reg-' + k}>
            <div className="sg-label small">{CLOSENESS_LABEL[k]}</div>
            <div className="sg-members">
              {g.map(([c, p]) => (
                <Link key={c} to={`/char/${c}`} className={'member' + (c === current ? ' current' : '')}>
                  <span className="kai" lang={zhLang(script)}>
                    {c}
                  </span>
                  <span className="small">{p ? <Pinyin p={p} /> : '—'}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PhoneticSeries({ shard, script }: { shard: CharShard; script: Script }) {
  if (!shard.sr.length)
    return (
      <div className="empty-state">
        {shard.mm?.ety?.type === 'pictophonetic'
          ? 'This character’s sound component has no recorded series.'
          : `Not a phono-semantic compound${shard.mm?.ety ? ` (${shard.mm.ety.type})` : ''}, and no other character uses it as a sound component.`}
      </div>
    );
  return (
    <div className="series-list">
      {shard.sr.map((s) => (
        <Series key={s.head} head={s.head} members={s.m} current={shard.c} script={script} />
      ))}
      <p className="faint small">
        Built from Make Me a Hanzi’s phonetic-component annotations. Readings are modern Mandarin, so the drift reflects about three thousand years of sound change.
      </p>
    </div>
  );
}
