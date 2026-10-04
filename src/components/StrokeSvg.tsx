import { useId } from 'react';
import type { StrokeData } from '../lib/types';

// Make Me a Hanzi / Hanzi Writer coordinates: 1024 box, y axis up, baseline offset 900.
export const GLYPH_TRANSFORM = 'translate(0, 900) scale(1, -1)';
export const toScreen = ([x, y]: number[]) => [x, 900 - y] as const;

export function medianLength(m: number[][]) {
  let len = 0;
  for (let i = 1; i < m.length; i++) len += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]);
  return len;
}

export interface StrokeSvgProps {
  data: StrokeData;
  /** strokes drawn fully (indices < shown); default all */
  shown?: number;
  /** index of a stroke to animate in as if brushed */
  animate?: number | null;
  /** stroke index → colour override */
  colors?: Record<number, string>;
  /** draw the remaining strokes as a faint outline */
  outline?: boolean;
  numbers?: boolean;
  radical?: boolean;
  /** strokes to emphasise (others dimmed) */
  focus?: number[] | null;
  className?: string;
  /** extra SVG drawn in glyph coordinates (e.g. user's strokes) */
  children?: React.ReactNode;
  title?: string;
}

/** Static or step-wise stroke rendering, sharing coordinates with Hanzi Writer. */
export function StrokeSvg({ data, shown, animate = null, colors, outline = true, numbers = false, radical = false, focus = null, className, children, title }: StrokeSvgProps) {
  const id = useId().replace(/:/g, '');
  const n = data.strokes.length;
  const upto = shown ?? n;
  const rad = new Set(radical ? (data.radStrokes ?? []) : []);
  const fill = (i: number) => colors?.[i] ?? (rad.has(i) ? 'var(--zhu)' : 'var(--paper)');
  return (
    <svg viewBox="0 0 1024 1024" className={'stroke-svg ' + (className ?? '')} role="img" aria-label={title}>
      <g transform={GLYPH_TRANSFORM}>
        {outline && data.strokes.map((d, i) => <path key={'o' + i} d={d} fill="var(--paper)" opacity={0.1} />)}
        {data.strokes.map((d, i) => {
          if (i >= upto && i !== animate) return null;
          const dim = focus && !focus.includes(i);
          if (i === animate) {
            const m = data.medians[i];
            const len = medianLength(m) + 120;
            return (
              <g key={'a' + i + '-' + upto}>
                <clipPath id={`${id}c${i}`}>
                  <path d={d} />
                </clipPath>
                <polyline
                  points={m.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke={fill(i)}
                  strokeWidth={200}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  clipPath={`url(#${id}c${i})`}
                  className="brush-in"
                  style={{ strokeDasharray: len, strokeDashoffset: len, ['--len' as string]: len, animationDuration: `${Math.max(0.35, len / 900)}s` }}
                />
              </g>
            );
          }
          return <path key={i} d={d} fill={fill(i)} opacity={dim ? 0.18 : 1} style={{ transition: 'opacity .5s var(--ease-ink), fill .5s var(--ease-ink)' }} />;
        })}
        {children}
      </g>
      {numbers &&
        data.medians.map((m, i) => {
          if (i >= Math.max(upto, (animate ?? -1) + 1)) return null;
          const [x, y] = toScreen(m[0]);
          return (
            <g key={'n' + i} className="stroke-num">
              <circle cx={x} cy={y} r={34} />
              <text x={x} y={y} dy="0.35em" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/** 米字格 practice grid: frame, centre cross and dashed diagonals. */
export function MiZiGe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={'mizige ' + (className ?? '')} aria-hidden preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="99" height="99" fill="none" className="mz-frame" />
      <line x1="50" y1="0" x2="50" y2="100" className="mz-line" />
      <line x1="0" y1="50" x2="100" y2="50" className="mz-line" />
      <line x1="0" y1="0" x2="100" y2="100" className="mz-diag" />
      <line x1="100" y1="0" x2="0" y2="100" className="mz-diag" />
    </svg>
  );
}
