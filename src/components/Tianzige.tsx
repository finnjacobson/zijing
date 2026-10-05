import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import type { CharShard } from '../lib/types';

// A free-writing 田字格 sheet. Writing lives only on screen: it starts blank each time the page is opened.
// Squares use their own 0–100 coordinates, so writing survives resizes and rotation.

/** A point in a square's own coordinates (0–100 on both axes) with pen pressure 0–1. */
type InkPoint = [number, number, number];
interface InkStroke {
  pts: InkPoint[];
  /** drawn with a pen (real pressure) rather than finger/mouse (simulated) */
  pen?: boolean;
}
const COLS = 6;
const ROWS = 4;
const TOTAL = COLS * ROWS;

interface Reference {
  index: number;
  char: string;
  script: 'traditional' | 'simplified' | 'both';
  lang: string;
}

/** Traditional form in the top-left square; the simplified form starts the second row when it differs. */
function referencesFor(shard: CharShard): Reference[] {
  const trad = shard.k === 's' ? (shard.trad?.[0] ?? shard.c) : shard.c;
  const simp = shard.k === 't' ? (shard.simp?.[0] ?? shard.c) : shard.c;
  if (trad === simp) return [{ index: 0, char: trad, script: 'both', lang: 'zh-Hant' }];
  return [
    { index: 0, char: trad, script: 'traditional', lang: 'zh-Hant' },
    { index: COLS, char: simp, script: 'simplified', lang: 'zh-Hans' },
  ];
}

const position = (i: number) => ({ row: Math.floor(i / COLS) + 1, col: (i % COLS) + 1 });

// ------------------------------------------------------------------ ink rendering
function outlinePath(stroke: InkStroke): string {
  const outline = getStroke(stroke.pts, {
    size: 6.5,
    thinning: 0.62,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: !stroke.pen,
    start: { taper: 0, cap: true },
    end: { taper: stroke.pen ? 0 : 6, cap: true },
    last: true,
  });
  if (outline.length < 2) return '';
  // Quadratic curves through the midpoints give a smooth brush edge.
  let d = `M${outline[0][0].toFixed(2)},${outline[0][1].toFixed(2)} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += `${x0.toFixed(2)},${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)} `;
  }
  return d + 'Z';
}

const Ink = memo(function Ink({ stroke }: { stroke: InkStroke }) {
  const d = useMemo(() => outlinePath(stroke), [stroke]);
  return <path d={d} className="ink" />;
});

/** The 田 guides: frame (drawn by CSS borders) plus dashed centre cross. */
function Guides() {
  return (
    <g aria-hidden className="tzg-guides">
      <line x1="50" y1="0" x2="50" y2="100" />
      <line x1="0" y1="50" x2="100" y2="50" />
    </g>
  );
}

// ------------------------------------------------------------------ one writable square
interface SquareProps {
  index: number;
  strokes: InkStroke[];
  focused: boolean;
  label: string;
  describedBy: string;
  acceptTouch: boolean;
  onCommit: (index: number, stroke: InkStroke) => void;
  onPenSeen: () => void;
  onFocusSquare: (index: number) => void;
  onKey: (e: React.KeyboardEvent, index: number) => void;
  register: (index: number, el: HTMLDivElement | null) => void;
}

const Square = memo(function Square({ index, strokes, focused, label, describedBy, acceptTouch, onCommit, onPenSeen, onFocusSquare, onKey, register }: SquareProps) {
  const [live, setLive] = useState<InkStroke | null>(null);
  const drawing = useRef<{ id: number; stroke: InkStroke; frame: number } | null>(null);

  const toPoint = (e: React.PointerEvent | PointerEvent, rect: DOMRect): InkPoint => [
    Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10,
    Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10,
    e.pointerType === 'pen' ? Math.round((e.pressure || 0.5) * 100) / 100 : 0.5,
  ];

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'pen') onPenSeen();
    // Palm rejection: once a Pencil has been used, resting fingers don't draw.
    if (e.pointerType === 'touch' && !acceptTouch) return;
    // A stroke whose pointerup/cancel never arrived must not block the next one: keep what was drawn.
    const stale = drawing.current;
    if (stale && stale.id !== e.pointerId) {
      cancelAnimationFrame(stale.frame);
      drawing.current = null;
      if (stale.stroke.pts.length > 1) onCommit(index, stale.stroke);
    } else if (stale) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep the stroke even if it wanders outside the square
    } catch {
      /* pointer already gone (or synthetic); drawing still works within the square */
    }
    e.currentTarget.focus({ preventScroll: true });
    const stroke: InkStroke = { pts: [toPoint(e, e.currentTarget.getBoundingClientRect())], pen: e.pointerType === 'pen' };
    drawing.current = { id: e.pointerId, stroke, frame: 0 };
    setLive({ ...stroke, pts: [...stroke.pts] });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Coalesced events keep fast Pencil strokes smooth (120 Hz input, 60 Hz rendering).
    const evts = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evts.length ? evts : [e.nativeEvent]) d.stroke.pts.push(toPoint(ev, rect));
    if (!d.frame) d.frame = requestAnimationFrame(() => {
      if (drawing.current) {
        drawing.current.frame = 0;
        setLive({ ...drawing.current.stroke, pts: [...drawing.current.stroke.pts] });
      }
    });
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    cancelAnimationFrame(d.frame);
    drawing.current = null;
    setLive(null);
    onCommit(index, d.stroke);
  };

  return (
    <div
      ref={(el) => register(index, el)}
      role="gridcell"
      tabIndex={focused ? 0 : -1}
      aria-label={label}
      aria-describedby={describedBy}
      className="tzg-square writable"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onFocus={() => onFocusSquare(index)}
      onKeyDown={(e) => onKey(e, index)}
    >
      <svg viewBox="0 0 100 100" aria-hidden>
        <Guides />
        {strokes.map((s, i) => (
          <Ink key={i} stroke={s} />
        ))}
        {live && <path d={outlinePath(live)} className="ink live" />}
      </svg>
    </div>
  );
});

// ------------------------------------------------------------------ the sheet
type Undo = { index: number; before: InkStroke[] } | { all: Record<number, InkStroke[]> };

export function Tianzige({ shard }: { shard: CharShard }) {
  const refs = useMemo(() => referencesFor(shard), [shard]);
  const refAt = useMemo(() => new Map(refs.map((r) => [r.index, r])), [refs]);
  // Opening any character page (including switching 學 ⇄ 学) starts a fresh sheet.
  const key = refs[0].char;
  const [cells, setCells] = useState<Record<number, InkStroke[]>>({});
  // Source of truth updated synchronously, so two changes in the same tick (e.g. a rescued stroke and
  // the new one) never overwrite each other; React state follows for rendering.
  const cellsRef = useRef<Record<number, InkStroke[]>>({});
  const [focus, setFocus] = useState(1);
  const [announce, setAnnounce] = useState('');
  const [penSeen, setPenSeen] = useState(false);
  const [fingerDrawing, setFingerDrawing] = useState(true);
  const undoStack = useRef<Undo[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const squares = useRef(new Map<number, HTMLDivElement>());
  const sheetRef = useRef<HTMLDivElement>(null);

  // On iPad, dragging the Apple Pencil (or a palm) starts Safari's text-selection / scroll gestures,
  // which cancel the stroke and select nearby text. Pointer events and touch-action can't stop that;
  // cancelling the touch itself can. React only attaches passive touch listeners, so this is native.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const block = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.tzg-square.writable')) e.preventDefault();
    };
    const opts = { passive: false } as const;
    for (const t of ['touchstart', 'touchmove', 'selectstart', 'contextmenu']) el.addEventListener(t, block, opts);
    return () => {
      for (const t of ['touchstart', 'touchmove', 'selectstart', 'contextmenu']) el.removeEventListener(t, block);
    };
  }, []);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    cellsRef.current = {};
    setCells({});
    undoStack.current = [];
    setUndoCount(0);
  }, [key]);

  const update = useCallback((next: Record<number, InkStroke[]>, undo: Undo | null, message?: string) => {
    cellsRef.current = next;
    setCells(next);
    if (undo) {
      undoStack.current.push(undo);
      if (undoStack.current.length > 200) undoStack.current.shift();
      setUndoCount(undoStack.current.length);
    }
    if (message) setAnnounce(message);
  }, []);


  const commit = useCallback(
    (index: number, stroke: InkStroke) => {
      const before = cellsRef.current[index] ?? [];
      update({ ...cellsRef.current, [index]: [...before, stroke] }, { index, before });
    },
    [update],
  );

  const clearSquare = (index: number) => {
    const before = cellsRef.current[index] ?? [];
    if (!before.length) return;
    const { row, col } = position(index);
    update({ ...cellsRef.current, [index]: [] }, { index, before }, `Cleared row ${row}, column ${col}. Undo is available.`);
  };

  const resetSheet = () => update({}, { all: cellsRef.current }, 'Sheet reset. Undo is available.');

  const undo = () => {
    const u = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!u) return;
    if ('all' in u) update(u.all, null, 'Sheet restored.');
    else {
      const { row, col } = position(u.index);
      update({ ...cellsRef.current, [u.index]: u.before }, null, `Undid the last change in row ${row}, column ${col}.`);
    }
  };

  const register = useCallback((i: number, el: HTMLDivElement | null) => {
    if (el) squares.current.set(i, el);
    else squares.current.delete(i);
  }, []);

  const moveFocus = (i: number) => {
    const n = Math.max(0, Math.min(TOTAL - 1, i));
    setFocus(n);
    squares.current.get(n)?.focus();
  };

  // Grid keyboard pattern: arrows move, Home/End jump within the row, Delete clears, ⌘/Ctrl+Z undoes.
  const onKey = useCallback(
    (e: React.KeyboardEvent, i: number) => {
      const { row } = position(i);
      const k = e.key;
      if (k === 'ArrowRight') moveFocus(i + 1);
      else if (k === 'ArrowLeft') moveFocus(i - 1);
      else if (k === 'ArrowDown') moveFocus(i + COLS);
      else if (k === 'ArrowUp') moveFocus(i - COLS);
      else if (k === 'Home') moveFocus((row - 1) * COLS);
      else if (k === 'End') moveFocus(row * COLS - 1);
      else if ((k === 'Delete' || k === 'Backspace') && !refAt.has(i)) clearSquare(i);
      else if ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey)) undo();
      else return;
      e.preventDefault();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, refAt],
  );

  // First Pencil contact turns on palm rejection; the toggle lets fingers draw again.
  const penSeenRef = useRef(false);
  const onPenSeen = useCallback(() => {
    if (penSeenRef.current) return;
    penSeenRef.current = true;
    setPenSeen(true);
    setFingerDrawing(false);
  }, []);

  const written = Object.entries(cells).filter(([i, s]) => s.length && !refAt.has(Number(i))).length;
  const focusedHasInk = !!cells[focus]?.length && !refAt.has(focus);
  const acceptTouch = !penSeen || fingerDrawing;
  const helpId = `${uid}-help`;

  const squareLabel = (i: number) => {
    const { row, col } = position(i);
    const n = cells[i]?.length ?? 0;
    return `Practice square, row ${row}, column ${col}: ${n ? `${n} stroke${n === 1 ? '' : 's'} written` : 'empty'}`;
  };

  return (
    <div className="tianzige">
      <p id={helpId} className="muted small tzg-help">
        Copy the model in each row by hand: finger, Apple Pencil or mouse. The sheet isn’t saved: it starts fresh each time you open this page.
        <span className="sr-only">
          {' '}
          Writing needs a pointer or touch. With the keyboard, use the arrow keys to move between squares, Delete to clear a square, and Command or Control Z to undo.
        </span>
      </p>

      <div className="tzg-toolbar" role="toolbar" aria-label="Practice sheet tools">
        <button className="btn" onClick={undo} disabled={!undoCount} aria-keyshortcuts="Meta+Z Control+Z">
          ↶ Undo
        </button>
        <button className="btn" onClick={() => clearSquare(focus)} disabled={!focusedHasInk}>
          Clear square
        </button>
        <button className="btn ghost" onClick={resetSheet} disabled={!written}>
          Reset sheet
        </button>
        {penSeen && (
          <label className="check">
            <input type="checkbox" checked={fingerDrawing} onChange={(e) => setFingerDrawing(e.target.checked)} /> Draw with finger too
          </label>
        )}
        {written > 0 && (
          <span className="tzg-status small faint" aria-hidden>
            {written} square{written === 1 ? '' : 's'} written
          </span>
        )}
      </div>

      <div className="tzg-scroll">
        <div ref={sheetRef} className="tzg-sheet" role="grid" aria-label={`田字格 practice sheet for ${refs.map((r) => r.char).join(' / ')}`} aria-describedby={helpId} aria-rowcount={ROWS} aria-colcount={COLS}>
          {Array.from({ length: ROWS }, (_, r) => (
            <div key={r} role="row" className="tzg-row" aria-rowindex={r + 1}>
              {Array.from({ length: COLS }, (_, c) => {
                const i = r * COLS + c;
                const ref = refAt.get(i);
                if (ref)
                  return (
                    <div
                      key={i}
                      ref={(el) => register(i, el)}
                      role="gridcell"
                      tabIndex={focus === i ? 0 : -1}
                      aria-label={`Model character ${ref.char}, ${ref.script === 'both' ? 'same in traditional and simplified' : ref.script + ' form'}`}
                      className="tzg-square reference"
                      onFocus={() => setFocus(i)}
                      onKeyDown={(e) => onKey(e, i)}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden>
                        <Guides />
                      </svg>
                      <span className="tzg-model kai" lang={ref.lang} aria-hidden>
                        {ref.char}
                      </span>
                      <span className="tzg-tag" aria-hidden lang={ref.lang}>
                        {ref.script === 'traditional' ? '繁' : ref.script === 'simplified' ? '简' : '繁简'}
                      </span>
                    </div>
                  );
                return (
                  <Square
                    key={i}
                    index={i}
                    strokes={cells[i] ?? EMPTY}
                    focused={focus === i}
                    label={squareLabel(i)}
                    describedBy={helpId}
                    acceptTouch={acceptTouch}
                    onCommit={commit}
                    onPenSeen={onPenSeen}
                    onFocusSquare={setFocus}
                    onKey={onKey}
                    register={register}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {penSeen && !fingerDrawing && <p className="faint small">Apple Pencil detected: fingers won’t draw, so you can rest your hand on the screen.</p>}
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>
    </div>
  );
}

const EMPTY: InkStroke[] = [];
