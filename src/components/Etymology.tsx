import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { COMMONS_BASE, getSeal } from '../lib/data';
import type { AncientForm, CharShard, SealGlyph } from '../lib/types';
import { externalLinks } from '../lib/links';

interface Stage {
  key: AncientForm | 'modern';
  zh: string;
  label: string;
  era: string;
}

// Chronological strip. Liushutong is a Ming-dynasty compendium of earlier forms, so it comes last
// among the ancient tiles and is labelled as such.
const STAGES: Stage[] = [
  { key: 'oracle', zh: '甲骨文', label: 'Oracle bone', era: 'Shang · c. 1250–1050 BCE' },
  { key: 'bronze', zh: '金文', label: 'Bronze', era: 'Western Zhou · c. 1050–771 BCE' },
  { key: 'silk', zh: '楚簡', label: 'Chu slips & silk', era: 'Warring States · 5th–3rd c. BCE' },
  { key: 'slip', zh: '秦簡', label: 'Qin slips', era: 'Qin · 3rd c. BCE' },
  { key: 'seal', zh: '小篆', label: 'Small seal', era: 'Qin–Han · as in 說文解字 (100 CE)' },
  { key: 'clerical', zh: '隸書', label: 'Clerical', era: 'Han · 2nd c. BCE onward' },
  { key: 'modern', zh: '楷書', label: 'Regular', era: 'from late Han · today' },
  { key: 'bigseal', zh: '六書通', label: 'Liushutong', era: 'Ming compilation of ancient forms (1661)' },
];

function commonsFile(path: string) {
  return decodeURIComponent(path.split('/').pop()!);
}

function Tile({ stage, children, source, missing }: { stage: Stage; children?: React.ReactNode; source?: React.ReactNode; missing?: boolean }) {
  return (
    <figure className={'ety-tile' + (missing ? ' missing' : '') + ' stage-' + stage.key}>
      <div className="ety-frame">{children ?? <span className="na">not available</span>}</div>
      <figcaption>
        <span className="kai stage-zh" lang="zh-Hant">
          {stage.zh}
        </span>
        <span className="stage-label">{stage.label}</span>
        <span className="stage-era">{stage.era}</span>
        {source && <span className="stage-src">{source}</span>}
      </figcaption>
    </figure>
  );
}

function CommonsImg({ path, alt, onFail }: { path: string; alt: string; onFail: () => void }) {
  // CORS mode (Wikimedia allows it) so the service worker can cache a real, non-opaque response.
  return <img src={COMMONS_BASE + path} alt={alt} loading="lazy" decoding="async" crossOrigin="anonymous" onError={onFail} />;
}

function SealSvg({ g }: { g: SealGlyph }) {
  return (
    <svg viewBox={g.vb} className="seal-glyph" role="img" aria-label="small seal form">
      {g.d.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function Etymology({ shard }: { shard: CharShard }) {
  const [seal, setSeal] = useState<SealGlyph | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setFailed(new Set());
    setSeal(null);
    if (shard.seal) getSeal(shard.c).then(setSeal);
  }, [shard]);

  const forms = shard.an?.f ?? {};
  const fail = (k: string) => setFailed((s) => new Set(s).add(k));
  const has = (k: AncientForm) => !!forms[k] && !failed.has(k);
  const anyAncient = (Object.keys(forms) as AncientForm[]).some(has) || !!seal;
  const fromOther = shard.an && shard.an.from !== shard.c ? shard.an.from : null;

  return (
    <div className="etymology">
      {fromOther && (
        <p className="faint small">
          Ancient forms are recorded under{' '}
          <Link to={`/char/${fromOther}`} className="kai">
            {fromOther}
          </Link>
          .
        </p>
      )}
      <div className="ety-strip" role="list">
        {STAGES.map((st) => {
          if (st.key === 'modern')
            return (
              <Tile key={st.key} stage={st} source="LXGW WenKai">
                <span className="modern-glyph kai">{shard.c}</span>
              </Tile>
            );
          if (st.key === 'bigseal' && !has('bigseal')) return null; // optional extra tile
          if (st.key === 'seal' && !has('seal') && seal)
            return (
              <Tile
                key={st.key}
                stage={st}
                source={
                  <>
                    Kaiyuan Small Seal (U+{seal.cp}){!seal.reviewed && <span className="chip" title="Machine-aligned glyph that hasn’t been reviewed by a person yet">unreviewed</span>}
                  </>
                }
              >
                <SealSvg g={seal} />
              </Tile>
            );
          const k = st.key as AncientForm;
          if (!has(k)) return <Tile key={st.key} stage={st} missing />;
          const file = commonsFile(forms[k]!);
          return (
            <Tile
              key={st.key}
              stage={st}
              source={
                <a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">
                  Commons
                </a>
              }
            >
              <CommonsImg path={forms[k]!} alt={`${st.label} form of ${shard.an!.from}`} onFail={() => fail(k)} />
            </Tile>
          );
        })}
      </div>
      {!anyAncient && (
        <p className="muted small">
          No ancient forms in the open datasets. Many common characters (你, 們, 這…) were created after the Qin and simply have none; others are just missing from the
          collection.
        </p>
      )}
      <div className="ext-links" style={{ marginTop: 12 }}>
        {externalLinks(shard.an?.from ?? shard.c)
          .slice(0, 3)
          .map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
      </div>

      {shard.sw && (
        <div className="shuowen">
          <h3>
            <span className="kai" lang="zh-Hant">
              說文解字
            </span>{' '}
            <span className="faint small">
              卷{shard.sw.v} · {shard.sw.r}部 · {shard.sw.f}
              {shard.sw.head !== shard.c && (
                <>
                  {' '}
                  · entry{' '}
                  <Link to={`/char/${shard.sw.head}`} className="kai">
                    {shard.sw.head}
                  </Link>
                </>
              )}
            </span>
          </h3>
          <p className="sw-text" lang="zh-Hant">
            <span className="kai sw-head">{shard.sw.head}</span>
            {shard.sw.e}
          </p>
          {shard.sw.duan.length > 0 && (
            <details>
              <summary className="small muted">段玉裁注 (Duan Yucai’s commentary)</summary>
              {shard.sw.duan.map(([e, n], i) => (
                <p key={i} className="duan" lang="zh-Hant">
                  <b>{e}</b> {n}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
