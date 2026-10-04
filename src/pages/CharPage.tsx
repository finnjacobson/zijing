import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getChar, getStrokes } from '../lib/data';
import { convertText, counterpartsIn, zhLang } from '../lib/convert';
import { recordView } from '../lib/db';
import { useSettings } from '../lib/settings';
import { useCharProgress } from '../lib/useProgress';
import type { CharShard, StrokeData } from '../lib/types';
import { StrokeAnimator } from '../components/StrokeAnimator';
import { Readings, mandarinReadings } from '../components/Readings';
import { Meanings } from '../components/Meanings';
import { CommonWords } from '../components/CommonWords';
import { Pinyin } from '../components/Pinyin';
import { DecompTree } from '../components/DecompTree';
import { PhoneticSeries } from '../components/PhoneticSeries';
import { Practice } from '../components/Practice';
import { Seal } from '../components/Seal';
import { Etymology } from '../components/Etymology';
import { Calligraphy } from '../components/Calligraphy';
import { externalLinks } from '../lib/links';
import './char.css';

export interface StrokeChoice {
  data: StrokeData | null;
  std: 'm' | 't' | null;
  label: string;
}

/** Pick stroke data for the requested standard, falling back to whatever exists. */
export async function loadStrokes(shard: CharShard, want: 'm' | 't'): Promise<StrokeChoice> {
  const order: ('m' | 't')[] = want === 't' ? ['t', 'm'] : ['m', 't'];
  for (const std of order) {
    if (!shard.st.includes(std)) continue;
    const data = await getStrokes(shard.c, std);
    if (data) return { data, std, label: std === 't' ? 'Taiwan MOE standard (AnimCJK)' : 'PRC standard (Make Me a Hanzi)' };
  }
  return { data: null, std: null, label: '' };
}

const SECTIONS = [
  ['strokes', '筆順', 'Strokes'],
  ['readings', '讀音', 'Readings'],
  ['meanings', '字義', 'Meanings'],
  ['words', '詞語', 'Words'],
  ['practice', '習字', 'Practice'],
  ['structure', '構字', 'Structure'],
  ['series', '聲系', 'Sound series'],
  ['evolution', '字源', 'Evolution'],
  ['calligraphy', '書體', 'Calligraphy'],
] as const;

export default function CharPage() {
  const { c = '' } = useParams();
  const char = [...c][0] ?? '';
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [shard, setShard] = useState<CharShard | null | undefined>(undefined);
  const [strokes, setStrokes] = useState<StrokeChoice | null>(null);
  const progress = useCharProgress(char);
  const [justSealed, setJustSealed] = useState(false);
  // true until we know this page doesn't need to redirect to the other script
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    let live = true;
    setShard(undefined);
    setStrokes(null);
    setRedirecting(true);
    setJustSealed(false);
    getChar(char).then((s) => live && setShard(s));
    return () => {
      live = false;
    };
  }, [char]);

  // Follow the global script toggle (学 ⇄ 學). One-to-one pairs come straight from the shard;
  // only ambiguous ones (发 → 發 / 髮) need OpenCC, whose dictionary is large and lazy-loaded.
  useEffect(() => {
    if (!shard) return;
    let live = true;
    const go = (target: string | undefined) => {
      if (!live) return;
      if (target && target !== shard.c) navigate(`/char/${target}`, { replace: true });
      else setRedirecting(false);
    };
    const options = counterpartsIn(shard, settings.script);
    if (options.length <= 1) go(options[0]);
    else convertText(shard.c, settings.script).then((x) => go([...x][0]));
    return () => {
      live = false;
    };
  }, [shard, settings.script, navigate]);
  // One-to-many mappings (发 → 發 / 髮): OpenCC picks one; offer the others.
  const alternatives = shard ? counterpartsIn(shard, settings.script) : [];

  useEffect(() => {
    if (!shard || redirecting) return;
    recordView(shard.c);
    let live = true;
    loadStrokes(shard, settings.strokeStd).then((s) => live && setStrokes(s));
    return () => {
      live = false;
    };
  }, [shard, settings.strokeStd, redirecting]);

  useEffect(() => {
    document.title = shard ? `${shard.c} · 字境` : '字境';
  }, [shard]);

  // Highlight the section currently under the sticky nav.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  useEffect(() => {
    if (!shard || redirecting) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveSection(e.target.id);
      },
      { rootMargin: '-120px 0px -65% 0px' },
    );
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [shard, redirecting]);

  // (a missing shard has nothing to redirect, so only wait on the redirect check when data exists)
  if (shard === undefined || (shard && redirecting)) return <div className="loading">研墨…</div>;
  if (shard === null)
    return (
      <div className="char-page">
        <div className="empty-state" style={{ marginTop: 40 }}>
          <p>
            {navigator.onLine ? (
              <>
                No data for <span className="zh">{char || c}</span> in the local dataset.
              </>
            ) : (
              <>
                No data for <span className="zh">{char || c}</span>: it isn’t saved on this device yet. Open it once while online, or use Settings → Offline →
                Download everything.
              </>
            )}
          </p>
          <div className="ext-links">
            {externalLinks(char).map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    );

  const lang = zhLang(settings.script);
  const mand = mandarinReadings(shard);
  const counterparts = [...(shard.trad ?? []), ...(shard.simp ?? [])];
  const firstGloss = shard.mn.find((m) => !/^[A-Z]/.test(m.p))?.d.filter((d) => !/^CL:|variant of|^see /i.test(d)).slice(0, 3).join('; ') || shard.def || '';

  return (
    <article className="char-page" lang="en">
      {alternatives.length > 1 && (
        <div className="script-banner">
          In {settings.script === 'trad' ? 'traditional' : 'simplified'} script, <span lang={lang}>{shard.c}</span> corresponds to several characters:{' '}
          {alternatives.map((a) => (
            <Link key={a} to={`/char/${a}`} className="btn" lang={lang}>
              {a}
            </Link>
          ))}
        </div>
      )}

      <header className="char-header ink-in">
        <div className="hero-glyph" lang={shard.k === 's' ? 'zh-Hans' : 'zh-Hant'}>
          <div className="hero-grid" aria-hidden />
          <span className="hero-char kai">{shard.c}</span>
          {progress?.sealedAt && (
            <span className="seal-slot" title={`Written from memory without a mistake on ${new Date(progress.sealedAt).toLocaleDateString()}`}>
              <Seal key={justSealed ? 'fresh' : 'kept'} text={settings.sealText || '印'} size={74} stamp={justSealed} />
            </span>
          )}
        </div>
        <div className="hero-info">
          <div className="hero-readings">
            {mand.slice(0, 4).map((p) => (
              <span key={p} className="hero-py">
                <Pinyin p={p} />
              </span>
            ))}
          </div>
          {firstGloss && <p className="hero-gloss">{firstGloss}</p>}
          <dl className="facts">
            {counterparts.length > 0 && (
              <div>
                <dt>{shard.k === 's' ? 'Traditional' : shard.k === 't' ? 'Simplified' : 'Variant'}</dt>
                <dd className="counterparts">
                  {counterparts.map((x) => (
                    <Link key={x} to={`/char/${x}`} className="counterpart kai" lang={shard.k === 's' ? 'zh-Hant' : 'zh-Hans'}>
                      {x}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt>Strokes</dt>
              <dd>{shard.sc ?? strokes?.data?.strokes.length ?? '—'}</dd>
            </div>
            <div>
              <dt>Radical</dt>
              <dd>
                {shard.rad || shard.rs ? (
                  <>
                    <Link to={`/char/${shard.rs?.c ?? shard.rad}`} className="zh kai">
                      {shard.rad ?? shard.rs?.c}
                    </Link>
                    {shard.rs && (
                      <span className="faint small">
                        {' '}
                        Kangxi {shard.rs.n}
                        {shard.rad && shard.rad !== shard.rs.c ? ` ${shard.rs.c}` : ''} + {shard.rs.x}
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Frequency</dt>
              <dd>{shard.fr ? <>#{shard.fr.toLocaleString()}</> : <span className="faint">rare</span>}</dd>
            </div>
            <div>
              <dt>Script</dt>
              <dd>{shard.k === 's' ? 'simplified form' : shard.k === 't' ? 'traditional form' : 'both scripts'}</dd>
            </div>
          </dl>
          <div className="ext-links">
            {externalLinks(shard.c).map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      <nav className="char-toc" aria-label="Sections">
        {SECTIONS.map(([id, zh, en]) => (
          <a key={id} href={`#${id}`} className={activeSection === id ? 'current' : ''} aria-current={activeSection === id ? 'true' : undefined} onClick={(e) => {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>
            <span className="kai" lang="zh-Hant">
              {zh}
            </span>{' '}
            {en}
          </a>
        ))}
      </nav>

      <Section id="strokes" zh="筆順" title="Stroke order">
        {strokes === null ? (
          <div className="loading">…</div>
        ) : strokes.data ? (
          <StrokeAnimator key={shard.c + strokes.std} char={shard.c} data={strokes.data} stdLabel={strokes.label} />
        ) : (
          <NoStrokes shard={shard} />
        )}
      </Section>

      <Section id="readings" zh="讀音" title="Readings">
        <Readings shard={shard} />
      </Section>

      <Section id="meanings" zh="字義" title="Meanings">
        <Meanings shard={shard} />
      </Section>

      <Section id="words" zh="詞語" title="Common words">
        <CommonWords shard={shard} script={settings.script} />
      </Section>

      <Section id="practice" zh="習字" title="Handwriting practice">
        {strokes?.data && strokes.std ? (
          <Practice
            char={shard.c}
            data={strokes.data}
            std={strokes.std}
            progress={progress}
            onSealed={() => {
              setJustSealed(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : strokes ? (
          <NoStrokes shard={shard} />
        ) : (
          <div className="loading">…</div>
        )}
      </Section>

      <Section id="structure" zh="構字" title="Decomposition">
        <DecompTree shard={shard} strokes={strokes?.std === 'm' ? strokes.data : null} />
      </Section>

      <Section id="series" zh="聲系" title="Phonetic series">
        <PhoneticSeries shard={shard} script={settings.script} />
      </Section>

      <Section id="evolution" zh="字源" title="Evolution of the form">
        <Etymology shard={shard} />
      </Section>

      <Section id="calligraphy" zh="書體" title="Calligraphy styles">
        <Calligraphy char={shard.c} counterpart={shard.simp?.[0] ?? shard.trad?.[0]} />
      </Section>
    </article>
  );
}

export function Section({ id, zh, title, children, aside }: { id: string; zh: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="char-section">
      <div className="brush" aria-hidden />
      <div className="section-head">
        <h2>
          <span className="zh-label" lang="zh-Hant">
            {zh}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NoStrokes({ shard }: { shard: CharShard }) {
  const alts = [...shard.var.z, ...shard.var.sem, ...(shard.trad ?? []), ...(shard.simp ?? [])];
  return (
    <div className="empty-state">
      No stroke data for this form (Make Me a Hanzi and AnimCJK don’t include it).
      {alts.length > 0 && (
        <>
          {' '}
          Try a variant:{' '}
          {alts.map((a) => (
            <Link key={a} to={`/char/${a}`} className="btn small" style={{ marginLeft: 6 }}>
              {a}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
