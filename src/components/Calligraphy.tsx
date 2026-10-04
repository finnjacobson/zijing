import { useEffect, useState } from 'react';
import { hex } from '../lib/data';

interface Face {
  family: string; // Google Fonts family
  style: string; // 書體
  styleEn: string;
  note: string;
}

// All SIL Open Font License, served by Google Fonts.
const FACES: Face[] = [
  { family: 'Noto Serif TC', style: '宋體', styleEn: 'Songti (Ming)', note: 'Noto Serif TC' },
  { family: 'Noto Serif SC', style: '宋体', styleEn: 'Songti (Ming), mainland forms', note: 'Noto Serif SC' },
  { family: 'Noto Sans TC', style: '黑體', styleEn: 'Heiti (sans)', note: 'Noto Sans TC' },
  { family: 'LXGW WenKai TC', style: '楷書', styleEn: 'Kaishu (regular)', note: 'LXGW WenKai TC' },
  { family: 'Ma Shan Zheng', style: '楷書', styleEn: 'Kaishu, brush', note: 'Ma Shan Zheng' },
  { family: 'Zhi Mang Xing', style: '行書', styleEn: 'Xingshu (running)', note: 'Zhi Mang Xing' },
  { family: 'Long Cang', style: '行書', styleEn: 'Xingshu, casual', note: 'Long Cang' },
  { family: 'Liu Jian Mao Cao', style: '草書', styleEn: 'Caoshu (cursive)', note: 'Liu Jian Mao Cao' },
];

const alias = (f: Face, c: string) => `zj-${f.family.replace(/\s+/g, '')}-${hex(c)}`;
const loaded = new Map<string, Promise<boolean>>();

/**
 * Load just this one glyph from Google Fonts (`text=` subsetting) as a FontFace under a
 * per-character alias. Google answers with an error for glyphs a face doesn't have, and a canvas
 * comparison catches any face that loads but still falls back.
 */
function loadFace(f: Face, c: string): Promise<boolean> {
  const name = alias(f, c);
  let p = loaded.get(name);
  if (p) return p;
  p = (async () => {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}&text=${encodeURIComponent(c)}`);
    if (!res.ok) return false;
    const src = /src:\s*url\(([^)]+)\)/.exec(await res.text())?.[1];
    if (!src) return false;
    const face = new FontFace(name, `url(${src})`);
    await face.load();
    document.fonts.add(face);
    return hasGlyph(name, c);
  })().catch(() => false);
  loaded.set(name, p);
  return p;
}

function render(font: string, c: string) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.font = `48px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(c, 8, 32);
  return ctx.getImageData(0, 0, 64, 64).data.join(',');
}

/** The face covers the glyph if the result doesn't depend on the fallback and differs from it. */
function hasGlyph(name: string, c: string) {
  const a = render(`'${name}', serif`, c);
  const b = render(`'${name}', sans-serif`, c);
  return a === b && a !== render('serif', c);
}

export function Calligraphy({ char, counterpart }: { char: string; counterpart?: string }) {
  const [status, setStatus] = useState<Record<string, boolean | undefined>>({});
  const [alt, setAlt] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setStatus({});
    setAlt({});
    let live = true;
    for (const f of FACES)
      loadFace(f, char).then(async (ok) => {
        if (!live) return;
        setStatus((s) => ({ ...s, [f.family]: ok }));
        // Brush fonts often lack traditional forms: fall back to the counterpart, clearly labelled.
        if (!ok && counterpart && (await loadFace(f, counterpart)) && live) setAlt((a) => ({ ...a, [f.family]: true }));
      });
    return () => {
      live = false;
    };
  }, [char, counterpart]);

  const shown = FACES.filter((f) => status[f.family] || alt[f.family]);
  const hidden = FACES.filter((f) => status[f.family] === false && !alt[f.family]);
  const pending = FACES.some((f) => status[f.family] === undefined);

  return (
    <div className="calligraphy">
      <div className="callig-grid">
        {shown.map((f) => {
          const viaAlt = !status[f.family];
          const glyph = viaAlt ? counterpart! : char;
          return (
            <figure key={f.family} className={'callig-card ink-in' + (viaAlt ? ' via-alt' : '')}>
              <div className="callig-glyph" style={{ fontFamily: `'${alias(f, glyph)}'` }}>
                {glyph}
              </div>
              <figcaption>
                <span className="kai" lang="zh-Hant">
                  {f.style}
                </span>{' '}
                <span>{f.styleEn}</span>
                <span className="faint small">{f.note} · OFL</span>
                {viaAlt && <span className="chip">shows {glyph}: font lacks {char}</span>}
              </figcaption>
            </figure>
          );
        })}
        {pending && shown.length === 0 && <div className="loading">Loading fonts…</div>}
      </div>
      {hidden.length > 0 && (
        <p className="faint small">
          Hidden (no glyph for {char}
          {counterpart ? ` or ${counterpart}` : ''}): {hidden.map((f) => f.family).join(', ')}.
        </p>
      )}
    </div>
  );
}
