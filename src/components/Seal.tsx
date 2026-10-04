import { useEffect, useId, useState } from 'react';
import { getSeal } from '../lib/data';
import type { SealGlyph } from '../lib/types';

const boxCache = new Map<string, DOMRect | { x: number; y: number; width: number; height: number }>();
/** Union bounding box of a glyph's outlines, measured once in a hidden SVG. */
function glyphBox(g: SealGlyph) {
  let b = boxCache.get(g.cp);
  if (!b) {
    const [vx, vy, vw, vh] = g.vb.split(' ').map(Number);
    b = { x: vx, y: vy, width: vw, height: vh };
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
      const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const d of g.d) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        grp.appendChild(p);
      }
      svg.appendChild(grp);
      document.body.appendChild(svg);
      const r = grp.getBBox();
      svg.remove();
      if (r.width > 0 && r.height > 0) b = { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch {
      /* keep the em box */
    }
    boxCache.set(g.cp, b);
  }
  return b;
}

/**
 * A vermilion 白文 seal (white characters cut into red), laid out the traditional way:
 * columns read top-to-bottom, right-to-left. Uses Kaiyuan small-seal outlines when they exist,
 * otherwise the 楷書 font.
 */
export function Seal({ text, size = 72, className, stamp = false }: { text: string; size?: number; className?: string; stamp?: boolean }) {
  const id = useId().replace(/:/g, '');
  const chars = [...text].slice(0, 4);
  const [glyphs, setGlyphs] = useState<(SealGlyph | null)[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all(chars.map((c) => getSeal(c))).then((g) => live && setGlyphs(g));
    return () => {
      live = false;
    };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Columns right-to-left. 1 → [1]; 2 → [1][1]; 3 → [1][2]; 4 → [2][2]
  const cols: number[] = chars.length <= 1 ? [1] : chars.length === 2 ? [1, 1] : chars.length === 3 ? [1, 2] : [2, 2];
  const inner = 84; // drawing area inside the border (viewBox 100)
  const colW = inner / cols.length;
  const cells: { c: string; g: SealGlyph | null; x: number; y: number; w: number; h: number }[] = [];
  let k = 0;
  cols.forEach((rows, ci) => {
    const x = 8 + inner - (ci + 1) * colW;
    const h = inner / rows;
    for (let r = 0; r < rows; r++) {
      cells.push({ c: chars[k], g: glyphs[k] ?? null, x, y: 8 + r * h, w: colW, h });
      k++;
    }
  });

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={'seal' + (stamp ? ' stamp' : '') + (className ? ' ' + className : '')} role="img" aria-label={`Seal: ${text}`}>
      <defs>
        {/* Uneven ink and worn edges, like a real impression */}
        <filter id={`${id}rough`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={text.length * 7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" result="d" />
          {/* sparse worn patches: alpha stays 1 except where the noise peaks */}
          <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="2" seed="11" result="blot" />
          <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -12 9.4" result="mask" />
          <feComposite in="d" in2="mask" operator="in" />
        </filter>
        <mask id={`${id}m`}>
          <rect x="0" y="0" width="100" height="100" fill="white" />
          {cells.map((cell, i) => {
            if (cell.g) {
              // Fit the glyph's real ink bounds (not its 1000-unit em box) into the cell.
              const b = glyphBox(cell.g);
              const pad = 0.05;
              const sx = (cell.w * (1 - pad * 2)) / b.width;
              const sy = (cell.h * (1 - pad * 2)) / b.height;
              const vx = b.x;
              const vy = b.y;
              return (
                <g key={i} transform={`translate(${cell.x + cell.w * pad} ${cell.y + cell.h * pad}) scale(${sx} ${sy}) translate(${-vx} ${-vy})`}>
                  {/* thicken the carved lines so they survive being squeezed into a column */}
                  {cell.g.d.map((d, j) => (
                    <path key={j} d={d} fill="black" stroke="black" strokeWidth={chars.length > 1 ? 34 : 18} strokeLinejoin="round" />
                  ))}
                </g>
              );
            }
            const fs = Math.min(cell.w * 1.1, cell.h) * 0.88;
            return (
              <text
                key={i}
                x={cell.x + cell.w / 2}
                y={cell.y + cell.h / 2}
                dy="0.36em"
                textAnchor="middle"
                fontSize={fs}
                fontFamily="var(--f-kai)"
                fill="black"
                transform={cell.w < cell.h * 0.8 ? `translate(${cell.x + cell.w / 2} 0) scale(${(cell.w * 1.05) / fs} 1) translate(${-(cell.x + cell.w / 2)} 0)` : undefined}
              >
                {cell.c}
              </text>
            );
          })}
        </mask>
      </defs>
      <g filter={`url(#${id}rough)`}>
        {/* the carved strokes show the paper beneath, as on a real impression */}
        <rect x="5" y="5" width="90" height="90" fill="#efe6d6" opacity={0.92} />
        <rect x="3" y="3" width="94" height="94" rx="4" fill="#c8361f" mask={`url(#${id}m)`} />
      </g>
    </svg>
  );
}
