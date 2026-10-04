import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import type { StrokeData } from '../lib/types';
import { MiZiGe, StrokeSvg, toScreen } from './StrokeSvg';

const COLORS = {
  stroke: '#efe6d6',
  radical: '#d0432d',
  outline: 'rgba(239,230,214,0.12)',
};

interface Props {
  char: string;
  data: StrokeData;
  /** label of the stroke-order standard in use */
  stdLabel: string;
}

/**
 * Live Hanzi Writer animation (play / pause / speed / loop) plus a step-through mode that
 * renders the same stroke data with numbers, one brushed stroke at a time.
 */
export function StrokeAnimator({ char, data, stdLabel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [numbers, setNumbers] = useState(true);
  const [radical, setRadical] = useState(true);
  const [step, setStep] = useState<number | null>(null); // null = Hanzi Writer view
  const n = data.strokes.length;
  const hasRadical = !!data.radStrokes?.length;

  // (Re)create the writer when the character or radical colouring changes.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    const size = el.clientWidth || 300;
    const w = HanziWriter.create(el, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      charDataLoader: (_c, onLoad) => onLoad(data as never),
      strokeColor: COLORS.stroke,
      radicalColor: radical && hasRadical ? COLORS.radical : null,
      outlineColor: COLORS.outline,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes: 420 / speed,
      delayBetweenLoops: 1600,
      strokeFadeDuration: 500,
      showOutline: true,
    });
    writer.current = w;
    setState('idle');
    const ro = new ResizeObserver(() => {
      const s = el.clientWidth;
      if (s) w.updateDimensions({ width: s, height: s, padding: Math.round(s * 0.06) });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      w.pauseAnimation();
      writer.current = null;
      el.innerHTML = '';
    };
    // speed is applied live below; recreating on speed change would interrupt playback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, data, radical, hasRadical]);

  useEffect(() => {
    const w = writer.current;
    if (!w) return;
    w._options.strokeAnimationSpeed = speed;
    w._options.delayBetweenStrokes = 420 / speed;
  }, [speed]);

  const play = () => {
    const w = writer.current;
    if (!w) return;
    setStep(null);
    if (state === 'paused') {
      w.resumeAnimation();
      setState('playing');
      return;
    }
    setState('playing');
    if (loop) w.loopCharacterAnimation();
    else w.animateCharacter({ onComplete: (r) => !r.canceled && setState('idle') });
  };
  const pause = () => {
    writer.current?.pauseAnimation();
    setState('paused');
  };
  const goStep = (k: number) => {
    writer.current?.pauseAnimation();
    setState('idle');
    setStep(Math.max(0, Math.min(n, k)));
  };

  // Keyboard: ← → step, space play/pause when the board has focus.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') goStep((step ?? 0) + 1);
    else if (e.key === 'ArrowLeft') goStep((step ?? n) - 1);
    else if (e.key === ' ') {
      e.preventDefault();
      if (state === 'playing') pause();
      else play();
    } else return;
  };

  const showNumbersOverHW = numbers && step === null && state !== 'playing';

  return (
    <div className="animator">
      <div className="board" tabIndex={0} onKeyDown={onKey} aria-label={`Stroke order of ${char}`}>
        <MiZiGe />
        <div ref={host} className="hw-host" style={{ visibility: step === null ? 'visible' : 'hidden' }} />
        {step !== null && (
          <StrokeSvg data={data} shown={step > 0 ? step - 1 : 0} animate={step > 0 ? step - 1 : null} numbers={numbers} radical={radical} className="board-svg" title={`stroke ${step} of ${n}`} />
        )}
        {showNumbersOverHW && (
          <svg viewBox="0 0 1024 1024" className="board-svg numbers-only" aria-hidden>
            {data.medians.map((m, i) => {
              const [x, y] = toScreen(m[0]);
              return (
                <g key={i} className="stroke-num">
                  <circle cx={x} cy={y} r={34} />
                  <text x={x} y={y} dy="0.35em" textAnchor="middle">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="anim-controls">
        <div className="row">
          {state === 'playing' ? (
            <button className="btn primary" onClick={pause}>
              ❚❚ Pause
            </button>
          ) : (
            <button className="btn primary" onClick={play}>
              ▶ {state === 'paused' ? 'Resume' : 'Play'}
            </button>
          )}
          <button className="btn icon" onClick={() => goStep((step ?? 1) - 1)} title="Previous stroke (←)" aria-label="Previous stroke">
            ‹
          </button>
          <span className="step-count small">
            {step === null ? `${n} strokes` : `stroke ${step} / ${n}`}
          </span>
          <button className="btn icon" onClick={() => goStep((step ?? 0) + 1)} title="Next stroke (→)" aria-label="Next stroke">
            ›
          </button>
          {step !== null && (
            <button className="btn ghost small" onClick={() => setStep(null)}>
              Done
            </button>
          )}
        </div>
        <div className="row">
          <label className="speed small">
            Speed
            <input type="range" min={0.3} max={3} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="faint">{speed.toFixed(1)}×</span>
          </label>
        </div>
        <div className="row toggles">
          <label className="check">
            <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> Stroke numbers
          </label>
          <label className="check" title={hasRadical ? '' : 'No radical stroke mapping for this character'}>
            <input type="checkbox" checked={radical && hasRadical} disabled={!hasRadical} onChange={(e) => setRadical(e.target.checked)} />
            <span>
              Radical in <span style={{ color: 'var(--zhu)' }}>vermilion</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
          </label>
        </div>
        <div className="faint small">Stroke order: {stdLabel}</div>
      </div>
    </div>
  );
}
