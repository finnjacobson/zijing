import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { appGet, appSet, mastery } from '../lib/db';
import { convertText, zhLang } from '../lib/convert';
import { detectKind, parseVocab, type InputKind } from '../lib/input';
import { lookup, segment, type Token, type WordInfo } from '../lib/segment';
import { useSettings } from '../lib/settings';
import { useAllProgress } from '../lib/useProgress';
import { isHan } from '../lib/data';
import { parseNumbered, syllableToMarked } from '../lib/pinyin';
import { Pinyin } from '../components/Pinyin';
import './reader.css';

const SAMPLES: { label: string; text: string }[] = [
  { label: '論語 · 學而', text: '學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？' },
  { label: '简体句子', text: '我们今天去图书馆学习汉字。' },
  { label: 'Vocab list', text: '學習\txuéxí\tto study\n圖書館\ttúshūguǎn\tlibrary\n漢字\n朋友 péngyou friend\n遠方' },
];

type Kind = 'auto' | InputKind;

interface VocabView {
  word: string;
  tokens: Token[];
  pinyin?: string;
  def?: string;
  dict: WordInfo | null;
}

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

/** Split a word's reading into per-character syllables when the counts line up (for ruby). */
function perCharPinyin(word: string, w?: WordInfo): (string | null)[] {
  const chars = [...word];
  const syl = w?.readings[0]?.p.split(/\s+/) ?? [];
  if (syl.length !== chars.length) return chars.map(() => null);
  return syl;
}

// Closing punctuation must never start a line: glue it to the word before it.
const CLOSING = /^[，。！？；：、」』）》〉】…—,.!?;:)]/;
function renderFlow(tokens: Token[], renderWord: (t: Token, idx: string) => ReactNode) {
  const out: ReactNode[] = [];
  tokens.forEach((t, i) => {
    const node = renderWord(t, 't' + i);
    if (!t.han && CLOSING.test(t.text) && out.length) {
      const m = /^[，。！？；：、」』）》〉】…—,.!?;:)]+/.exec(t.text)![0];
      const prev = out.pop();
      out.push(
        <span key={'g' + i} className="nobr">
          {prev}
          {m}
        </span>,
      );
      if (t.text.length > m.length) out.push(<span key={'r' + i}>{t.text.slice(m.length)}</span>);
    } else out.push(node);
  });
  return out;
}

function masteryClass(m: number | null | undefined) {
  if (m == null) return 'm-none';
  if (m < 45) return 'm-low';
  if (m < 75) return 'm-mid';
  return 'm-high';
}

export default function ReaderPage() {
  const { settings, update } = useSettings();
  const [input, setInput] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<Kind>('auto');
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState('');
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [vocab, setVocab] = useState<VocabView[] | null>(null);
  const [hover, setHover] = useState<{ idx: string; word: Token; rect: DOMRect } | null>(null);
  const progress = useAllProgress(settings.masteryOverlay);
  const outRef = useRef<HTMLDivElement>(null);

  // Restore last text (or the 論語 sample on first visit).
  useEffect(() => {
    Promise.all([appGet<string>('reader-text'), appGet<Kind>('reader-kind')]).then(([t, k]) => {
      const text = t ?? SAMPLES[0].text;
      setInput(text);
      setDraft(text);
      if (k) setKind(k);
      setEditing(!text);
    });
  }, []);

  const detected = useMemo(() => (input ? detectKind(input) : 'text'), [input]);
  const effective: InputKind = kind === 'auto' ? detected : kind;

  useEffect(() => {
    if (input == null) return;
    let live = true;
    setHover(null);
    (async () => {
      const text = await convertText(input, settings.script);
      if (!live) return;
      setDisplay(text);
      if (effective === 'text') {
        const t = await segment(text);
        if (live) {
          setTokens(t);
          setVocab(null);
        }
      } else {
        const rows = parseVocab(text);
        const views = await Promise.all(
          rows.map(async (r) => ({ word: r.word, pinyin: r.pinyin, def: r.def, tokens: await segment(r.word), dict: await lookup(r.word) })),
        );
        if (live) {
          setVocab(views);
          setTokens(null);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [input, settings.script, effective]);

  const commit = (text: string) => {
    setInput(text);
    setDraft(text);
    appSet('reader-text', text);
    setEditing(false);
  };
  const setKindPersist = (k: Kind) => {
    setKind(k);
    appSet('reader-kind', k);
  };

  const lang = zhLang(settings.script);

  const renderWord = (t: Token, idx: string) => {
    if (!t.han) return <span key={idx}>{t.text}</span>;
    const chars = [...t.text];
    const py = settings.showPinyin ? perCharPinyin(t.text, t.word) : null;
    const active = hover?.idx === idx;
    return (
      <span
        key={idx}
        className={'w' + (chars.length > 1 ? ' multi' : '') + (active ? ' active' : '')}
        onMouseEnter={(e) => canHover && setHover({ idx, word: t, rect: e.currentTarget.getBoundingClientRect() })}
        onMouseLeave={() => canHover && setHover((h) => (h?.idx === idx ? null : h))}
      >
        {chars.map((ch, i) => {
          const m = settings.masteryOverlay ? mastery(progress.get(ch)) : undefined;
          const glyph = py ? (
            <ruby>
              {ch}
              <rt className={'tone' + (parseNumbered(py[i] ?? '')?.tone ?? 5)}>{py[i] ? syllableToMarked(parseNumbered(py[i]!)!) : ''}</rt>
            </ruby>
          ) : (
            ch
          );
          return (
            <Link
              key={i}
              to={`/char/${ch}`}
              className={'ch' + (settings.masteryOverlay ? ' ' + masteryClass(m) : '')}
              title={settings.masteryOverlay && m != null ? `mastery ${m}` : undefined}
              onClick={(e) => {
                // Touch: first tap shows the word card, a second tap on a character opens it.
                if (!canHover && !active) {
                  e.preventDefault();
                  setHover({ idx, word: t, rect: (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect() });
                }
              }}
            >
              {glyph}
            </Link>
          );
        })}
      </span>
    );
  };

  const hanCount = [...display].filter(isHan).length;
  const uniqueCount = new Set([...display].filter(isHan)).size;

  return (
    <div className="reader">
      <section className="reader-intro ink-in">
        <h1>
          <span className="kai" lang="zh-Hant">
            讀
          </span>{' '}
          Reader
        </h1>
        <p className="muted">
          {canHover
            ? 'Paste text or a vocabulary list. Hover a word for its reading and gloss; click a character to study it.'
            : 'Paste text or a vocabulary list. Tap a word for its reading and gloss, then tap a character to study it.'}
        </p>
      </section>

      {editing || input == null ? (
        <section className="panel input-panel ink-in">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="學而時習之，不亦說乎？ — or one word per line: 學習 xuéxí to study"
            lang={lang}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(draft);
            }}
          />
          <div className="input-row">
            <div className="samples">
              <span className="faint small">Samples:</span>
              {SAMPLES.map((s) => (
                <button key={s.label} className="btn ghost small" onClick={() => setDraft(s.text)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="input-actions">
              {input && (
                <button className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
              <button className="btn primary" onClick={() => commit(draft)} disabled={!draft.trim()}>
                Read <span className="faint small">⌘↵</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="reader-toolbar">
            <button className="btn" onClick={() => setEditing(true)}>
              ✎ Edit text
            </button>
            <div className="seg" role="group" aria-label="Input type">
              {(['auto', 'text', 'vocab'] as Kind[]).map((k) => (
                <button key={k} aria-pressed={kind === k} onClick={() => setKindPersist(k)}>
                  {k === 'auto' ? `Auto (${detected === 'vocab' ? 'list' : 'text'})` : k === 'text' ? 'Text' : 'Vocab list'}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.showPinyin} onChange={(e) => update({ showPinyin: e.target.checked })} /> Pinyin
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.masteryOverlay} onChange={(e) => update({ masteryOverlay: e.target.checked })} /> Mastery overlay
            </label>
            <span className="faint small counts">
              {hanCount} characters · {uniqueCount} unique
            </span>
          </div>

          {settings.masteryOverlay && (
            <div className="legend small faint">
              <span className="ch m-none">字</span> not practised <span className="ch m-low">字</span> shaky <span className="ch m-mid">字</span> getting there{' '}
              <span className="ch m-high">字</span> known
            </div>
          )}

          <section ref={outRef} className={'reader-out panel ink-in' + (settings.showPinyin ? ' with-pinyin' : '')} lang={lang}>
            {effective === 'text' &&
              (tokens ? <div className="text-flow">{renderFlow(tokens, renderWord)}</div> : <div className="loading">分詞中…</div>)}
            {effective === 'vocab' &&
              (vocab ? (
                <table className="vocab">
                  <tbody>
                    {vocab.map((v, i) => {
                      const r = v.dict?.readings[0];
                      return (
                        <tr key={i}>
                          <td className="vocab-word">{v.tokens.map((t, j) => renderWord({ ...t, word: t.word ?? v.dict ?? undefined }, `v${i}.${j}`))}</td>
                          <td className="vocab-py" lang="en">
                            {v.pinyin ? <span>{v.pinyin}</span> : r ? <Pinyin p={r.p} compact /> : <span className="faint">—</span>}
                          </td>
                          <td className="vocab-def" lang="en">
                            {v.def ?? (v.dict ? v.dict.readings.map((x) => x.g).join(' · ') : <span className="faint">not in CC-CEDICT</span>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="loading">…</div>
              ))}
          </section>
        </>
      )}

      {hover && <WordCard token={hover.word} rect={hover.rect} onClose={() => setHover(null)} lang={lang} />}
    </div>
  );
}

function WordCard({ token, rect, onClose, lang }: { token: Token; rect: DOMRect; onClose: () => void; lang: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
    const below = rect.bottom + 10;
    const top = below + el.offsetHeight > window.innerHeight - 8 ? rect.top - el.offsetHeight - 10 : below;
    setPos({ left, top });
  }, [rect]);
  useEffect(() => {
    if (canHover) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest('.w, .word-card')) onClose();
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('scroll', onClose, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', onClose);
    };
  }, [onClose]);
  const w = token.word;
  return (
    <div ref={ref} className="word-card" style={pos ? { left: pos.left, top: pos.top, opacity: 1 } : { left: -9999, top: 0, opacity: 0 }} role="tooltip">
      <div className="wc-head" lang={lang}>
        <span className="wc-word">{token.text}</span>
        {w && w.freq > 0 && <span className="chip">{w.freq >= 100 ? 'very common' : w.freq >= 10 ? 'common' : w.freq >= 1 ? 'uncommon' : 'rare'}</span>}
      </div>
      {w ? (
        w.readings.map((r, i) => (
          <div key={i} className="wc-reading">
            <Pinyin p={r.p} compact />
            <span className="wc-gloss">{r.g}</span>
          </div>
        ))
      ) : (
        <div className="faint small">Not in the dictionary as a word.</div>
      )}
      {!canHover && (
        <div className="wc-chars" lang={lang}>
          {[...token.text].map((c, i) => (
            <Link key={i} to={`/char/${c}`} className="btn">
              {c} <span className="faint small">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
