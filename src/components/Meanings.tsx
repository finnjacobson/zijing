import { Link } from 'react-router-dom';
import type { CharShard } from '../lib/types';
import { Pinyin } from './Pinyin';

/** Turn "variant of 說|说[shuo1]" style cross-references into links. */
function Def({ d }: { d: string }) {
  const parts = d.split(/([\p{Script=Han}]+(?:\|[\p{Script=Han}]+)?(?:\[[^\]]+\])?)/u);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^([\p{Script=Han}]+)(?:\|([\p{Script=Han}]+))?(?:\[([^\]]+)\])?$/u.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const [, t, s, py] = m;
        return (
          <span key={i} className="xref">
            {[...t].map((c, j) => (
              <Link key={j} to={`/char/${c}`}>
                {c}
              </Link>
            ))}
            {s && s !== t && <span className="faint">|{s}</span>}
            {py && (
              <span className="faint small">
                {' '}
                <Pinyin p={py} />
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

const isXref = (d: string) => /^(old |archaic |Japanese )?variant of|^see |^used in |^CL:/i.test(d);

export function Meanings({ shard }: { shard: CharShard }) {
  const groups = shard.mn;
  return (
    <div className="meanings">
      {groups.length === 0 && (
        <div className="empty-state">
          Not in CC-CEDICT{shard.def ? ' — Unihan gloss below.' : '.'}
        </div>
      )}
      {groups.length > 1 && <p className="muted small polyphone-note">Polyphonic: {groups.filter((g) => !/^[A-Z]/.test(g.p)).length} readings with different meanings.</p>}
      {groups.map((g) => {
        const name = /^[A-Z]/.test(g.p);
        const main = g.d.filter((d) => !isXref(d));
        const refs = g.d.filter(isXref);
        return (
          <div key={g.p} className={'meaning-group' + (name ? ' name' : '')}>
            <div className="mg-head">
              <Pinyin p={g.p} />
              {name && <span className="chip">proper name</span>}
            </div>
            <ol>
              {main.map((d, i) => (
                <li key={i}>
                  <Def d={d} />
                </li>
              ))}
            </ol>
            {refs.length > 0 && (
              <div className="refs small muted">
                {refs.map((d, i) => (
                  <div key={i}>
                    <Def d={d} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {shard.def && (
        <p className="unihan-def small">
          <span className="faint">Unihan:</span> {shard.def}
        </p>
      )}
    </div>
  );
}
