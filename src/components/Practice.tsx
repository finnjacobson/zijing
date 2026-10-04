import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import type { StrokeData } from '../lib/types';
import { MODES, recordAttempt, scoreFor, type Attempt, type CharProgress, type PracticeMode } from '../lib/db';
import { MiZiGe, StrokeSvg } from './StrokeSvg';

const MODE_INFO: Record<PracticeMode, { zh: string; label: string; desc: string }> = {
  trace: { zh: '描', label: 'Trace', desc: 'Outline visible; a hint appears after 3 misses.' },
  guided: { zh: '臨', label: 'Guided', desc: 'No outline; the next stroke is hinted after 2 misses.' },
  recall: { zh: '默', label: 'Recall', desc: 'Blank 米字格, no hints. Write it from memory.' },
};

interface StrokeLog {
  mistakes: number;
  path: number[][] | null; // the accepted stroke as drawn, in glyph coordinates
  skipped: boolean;
}

interface Result {
  attempt: Attempt;
  log: StrokeLog[];
  sealed: boolean;
}

interface Props {
  char: string;
  data: StrokeData;
  std: 'm' | 't';
  progress: CharProgress | undefined;
  onSealed?: () => void;
}

export function Practice({ char, data, std, progress, onSealed }: Props) {
  const [mode, setMode] = useState<PracticeMode>('guided');
  const [run, setRun] = useState(0); // bump to restart
  const [result, setResult] = useState<Result | null>(null);
  const [current, setCurrent] = useState(0);
  const [live, setLive] = useState<StrokeLog[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const skipRef = useRef<() => void>(() => {});
  const n = data.strokes.length;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    setResult(null);
    setCurrent(0);
    const log: StrokeLog[] = Array.from({ length: n }, () => ({ mistakes: 0, path: null, skipped: false }));
    setLive(log.map((l) => ({ ...l })));
    let started: number | null = null;
    let cur = 0;
    const startClock = () => (started ??= performance.now());
    // Start timing at the first touch of the board (finger / Pencil send touch events; mouse sends pointer).
    const START_EVENTS = ['pointerdown', 'touchstart', 'mousedown'] as const;
    START_EVENTS.forEach((t) => el.addEventListener(t, startClock, { passive: true }));

    const size = el.clientWidth || 320;
    const w = HanziWriter.create(el, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      charDataLoader: (_c, onLoad) => onLoad(data as never),
      showCharacter: false,
      showOutline: mode === 'trace',
      strokeColor: '#efe6d6',
      outlineColor: 'rgba(239,230,214,0.16)',
      drawingColor: '#efe6d6',
      drawingWidth: Math.max(10, size / 22),
      highlightColor: '#d0432d',
      highlightCompleteColor: '#d0432d',
      strokeFadeDuration: 400,
      drawingFadeDuration: 500,
    });
    writer.current = w;
    w.quiz({
      showHintAfterMisses: mode === 'trace' ? 3 : mode === 'guided' ? 2 : false,
      highlightOnComplete: true,
      leniency: mode === 'recall' ? 1 : 1.1,
      onMistake: (s) => {
        log[s.strokeNum].mistakes = s.mistakesOnStroke;
        setLive(log.map((l) => ({ ...l })));
      },
      onCorrectStroke: (s) => {
        log[s.strokeNum].mistakes = s.mistakesOnStroke;
        log[s.strokeNum].path = s.drawnPath.points.map((p) => [p.x, p.y]);
        cur = s.strokeNum + 1;
        setCurrent(cur);
        setLive(log.map((l) => ({ ...l })));
      },
      onComplete: async () => {
        const ms = started ? Math.round(performance.now() - started) : 0;
        const mistakes = log.reduce((a, l) => a + l.mistakes, 0);
        const attempt: Attempt = {
          mode,
          at: Date.now(),
          ms,
          mistakes,
          strokeMistakes: log.map((l) => l.mistakes),
          score: scoreFor(n, mistakes),
          std,
        };
        const before = progress?.sealedAt;
        const p = await recordAttempt(char, attempt);
        const sealed = mode === 'recall' && mistakes === 0;
        setResult({ attempt, log: log.map((l) => ({ ...l })), sealed });
        if (sealed && !before && p.sealedAt) onSealed?.();
      },
    });
    // Keep the board size in step with the layout (rotation, resizes).
    const ro = new ResizeObserver(() => {
      const s = el.clientWidth;
      if (s) w.updateDimensions({ width: s, height: s, padding: Math.round(s * 0.06) });
    });
    ro.observe(el);
    // "Reveal stroke": Hanzi Writer draws it and moves on; we log it as a revealed stroke with one miss.
    skipRef.current = () => {
      if (cur >= n) return;
      startClock();
      log[cur].skipped = true;
      log[cur].mistakes += 1;
      cur++;
      setCurrent(cur);
      setLive(log.map((l) => ({ ...l })));
      w.skipQuizStroke();
    };
    return () => {
      ro.disconnect();
      START_EVENTS.forEach((t) => el.removeEventListener(t, startClock));
      w.cancelQuiz();
      writer.current = null;
      el.innerHTML = '';
    };
  }, [char, data, mode, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLive = live.reduce((a, l) => a + l.mistakes, 0);
  const stats = progress?.modes[mode];

  return (
    <div className="practice">
      <div className="mode-tabs" role="tablist">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={'mode-tab' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>
            <span className="kai" lang="zh-Hant">
              {MODE_INFO[m].zh}
            </span>
            <span>{MODE_INFO[m].label}</span>
            {progress?.modes[m] && <span className="mode-best">{progress.modes[m]!.best}</span>}
          </button>
        ))}
      </div>
      <p className="muted small mode-desc">{MODE_INFO[mode].desc}</p>

      <div className="practice-body">
        <div className={'board practice-board mode-' + mode}>
          <MiZiGe />
          <div ref={host} className="hw-host" />
        </div>
        <div className="practice-side">
          {!result ? (
            <>
              <div className="live-stats">
                <div>
                  <span className="big">{Math.min(current + 1, n)}</span>
                  <span className="faint"> / {n}</span>
                  <div className="faint small">stroke</div>
                </div>
                <div>
                  <span className={'big' + (totalLive ? ' warn' : '')}>{totalLive}</span>
                  <div className="faint small">mistakes</div>
                </div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setRun((r) => r + 1)}>
                  ↺ Restart
                </button>
                <button className="btn ghost" onClick={() => skipRef.current()} title="Reveal and skip the current stroke (counts as a mistake)">
                  Reveal stroke
                </button>
              </div>
              <p className="faint small">Draw with a mouse, finger or stylus. Strokes are checked for shape, position and direction.</p>
            </>
          ) : (
            <Review result={result} data={data} onAgain={() => setRun((r) => r + 1)} />
          )}
          {stats && (
            <div className="mode-stats small">
              <span>
                Best <b>{stats.best}</b>
              </span>
              <span>
                Last <b>{stats.recent}</b>
              </span>
              <span>
                {stats.count} attempt{stats.count === 1 ? '' : 's'}
              </span>
              <span className="faint">{new Date(stats.last).toLocaleDateString()}</span>
            </div>
          )}
          {progress && <History progress={progress} />}
        </div>
      </div>
    </div>
  );
}

function fmtTime(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function Review({ result, data, onAgain }: { result: Result; data: StrokeData; onAgain: () => void }) {
  const { attempt, log } = result;
  const color = (m: number, skipped: boolean) => (skipped ? 'var(--paper-faint)' : m === 0 ? 'var(--jade)' : m === 1 ? 'var(--gold)' : 'var(--zhu)');
  return (
    <div className="review ink-in">
      <div className="score-line">
        <span className="score">{attempt.score}</span>
        <div>
          <div>
            {attempt.mistakes === 0 ? 'Clean — no mistakes' : `${attempt.mistakes} mistake${attempt.mistakes === 1 ? '' : 's'}`}
          </div>
          <div className="faint small">
            {attempt.mode} · {fmtTime(attempt.ms)}
          </div>
        </div>
        <button className="btn primary" onClick={onAgain} style={{ marginLeft: 'auto' }}>
          Again
        </button>
      </div>
      {result.sealed && <p className="sealed-note">Written from memory without a mistake: sealed 印.</p>}
      <div className="review-grid" aria-label="Stroke-by-stroke review">
        {log.map((l, i) => (
          <figure key={i} className="review-cell">
            <StrokeSvg data={data} shown={i} colors={{ [i]: color(l.mistakes, l.skipped) }} outline>
              {/* draw stroke i itself in its colour, plus what was actually drawn */}
              <path d={data.strokes[i]} fill={color(l.mistakes, l.skipped)} />
              {l.path && <polyline points={l.path.map((p) => p.join(',')).join(' ')} fill="none" stroke="#efe6d6" strokeWidth={18} strokeDasharray="30 22" strokeLinecap="round" opacity={0.55} />}
            </StrokeSvg>
            <figcaption>
              <b>{i + 1}</b> {l.skipped ? 'revealed' : l.mistakes ? `${l.mistakes}×` : '✓'}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="faint small">Colour = misses on that stroke (jade none, ochre one, vermilion more). Dashed line = your accepted stroke.</p>
    </div>
  );
}

function History({ progress }: { progress: CharProgress }) {
  const recent = progress.attempts.slice(-12);
  if (!recent.length) return null;
  return (
    <div className="history">
      <div className="faint small">Recent attempts</div>
      <div className="spark">
        {recent.map((a, i) => (
          <span key={i} className={'bar m-' + a.mode} style={{ height: `${Math.max(6, a.score)}%` }} title={`${a.mode} · ${a.score} · ${new Date(a.at).toLocaleString()}`} />
        ))}
      </div>
      <div className="spark-legend small faint">
        <span className="dot m-trace" /> trace <span className="dot m-guided" /> guided <span className="dot m-recall" /> recall
      </div>
    </div>
  );
}
