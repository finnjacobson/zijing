import type { CharShard } from '../lib/types';
import { numberedToMarked, toWadeGiles, toYale, toZhuyin, parseNumbered } from '../lib/pinyin';

/** Mandarin readings: CEDICT readings first (they carry the meanings), then any extra Unihan ones. */
export function mandarinReadings(s: CharShard): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (p: string) => {
    const k = p.toLowerCase();
    if (!parseNumbered(k) || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  s.mn.filter((m) => !/^[A-Z]/.test(m.p)).forEach((m) => add(m.p));
  s.rd.m.forEach(add);
  s.mn.forEach((m) => add(m.p));
  return out;
}

const kata = (xs: string[]) => xs.filter((x) => /[゠-ヿ]/.test(x));
const hira = (xs: string[]) => xs.filter((x) => /[぀-ゟ]/.test(x));

export function Readings({ shard }: { shard: CharShard }) {
  const mand = mandarinReadings(shard);
  const r = shard.rd;
  const others: { lang: string; label: string; value: React.ReactNode; note?: string }[] = [
    { lang: 'yue', label: 'Cantonese', value: r.yue.join(', '), note: 'Jyutping' },
    {
      lang: 'ja',
      label: 'Japanese on’yomi',
      value: [kata(r.ja).join('・'), r.jaOn.map((x) => x.toLowerCase()).join(', ')].filter(Boolean).join('  '),
    },
    {
      lang: 'ja',
      label: 'Japanese kun’yomi',
      value: [hira(r.ja).join('・'), r.jaKun.map((x) => x.toLowerCase()).join(', ')].filter(Boolean).join('  '),
    },
    { lang: 'ko', label: 'Korean', value: [r.ko.join(', '), r.koR.map((x) => x.toLowerCase()).join(', ')].filter(Boolean).join('  ') },
    { lang: 'vi', label: 'Sino-Vietnamese', value: r.vi.join(', '), note: 'Hán-Việt' },
  ];
  return (
    <div className="readings">
      {mand.length ? (
        <div className="table-wrap">
          <table className="rom-table">
            <thead>
              <tr>
                <th>Pinyin</th>
                <th>Numbered</th>
                <th>Zhuyin</th>
                <th>Wade–Giles</th>
                <th>Yale</th>
              </tr>
            </thead>
            <tbody>
              {mand.map((p) => {
                const tone = parseNumbered(p)?.tone ?? 5;
                return (
                  <tr key={p}>
                    <td className={'big-py tone' + tone}>{numberedToMarked(p)}</td>
                    <td>{p.replace('v', 'ü')}</td>
                    <td className="zhuyin" lang="zh-TW">
                      {toZhuyin(p) || '—'}
                    </td>
                    <td>{toWadeGiles(p) || '—'}</td>
                    <td>{toYale(p) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No Mandarin reading recorded.</div>
      )}
      <dl className="other-readings">
        {others.map((o) => (
          <div key={o.label}>
            <dt>
              {o.label}
              {o.note && <span className="faint small"> · {o.note}</span>}
            </dt>
            <dd lang={o.lang}>{o.value || <span className="faint">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
