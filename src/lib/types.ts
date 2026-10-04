// Shapes of the JSON shards written by scripts/build-data.mjs.

export type Script = 'trad' | 'simp';
/** 's' simplified-only, 't' traditional-only, 'b' used in both */
export type ScriptKind = 's' | 't' | 'b';

export interface TreeNode {
  c?: string;
  op?: string;
  ids?: string;
  kids?: TreeNode[];
  role?: 'semantic' | 'phonetic' | 'form';
  /** stroke indices of the root character covered by this component (first level only) */
  strokes?: number[];
}

export interface Etymology {
  type: 'ideographic' | 'pictographic' | 'pictophonetic';
  hint?: string | null;
  semantic?: string | null;
  phonetic?: string | null;
}

/** [char, numbered pinyin, script kind, frequency rank] */
export type SeriesMember = [string, string | null, ScriptKind, number];

export type AncientForm = 'oracle' | 'bronze' | 'silk' | 'slip' | 'seal' | 'bigseal' | 'clerical';

export interface CharShard {
  c: string;
  trad?: string[];
  simp?: string[];
  k: ScriptKind;
  sc: number | null;
  rs: { n: number; c: string; x: number; s: boolean } | null;
  rad: string | null;
  fr: number | null;
  def: string | null;
  rd: {
    m: string[];
    hp: string[];
    yue: string[];
    jaOn: string[];
    jaKun: string[];
    ja: string[];
    ko: string[];
    koR: string[];
    vi: string[];
  };
  mn: { p: string; d: string[] }[];
  /** [trad, simp, numbered pinyin, gloss, freq per million] */
  w: [string, string, string, string, number][];
  mm?: { from: string; ids: string; ety: Etymology | null; def: string | null };
  tree?: TreeNode;
  sr: { head: string; m: SeriesMember[] }[];
  an: { from: string; f: Partial<Record<AncientForm, string>> } | null;
  seal: { from: string; reviewed: boolean } | null;
  sw: {
    from: string;
    head: string;
    id: number;
    e: string;
    r: string;
    f: string;
    v: string;
    duan: [string, string][];
  } | null;
  /** stroke data available: 'm' Make Me a Hanzi (PRC order), 't' AnimCJK (Taiwan order) */
  st: ('m' | 't')[];
  var: { sem: string[]; z: string[] };
}

export interface StrokeData {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
}

export interface SealGlyph {
  cp: string;
  vb: string;
  d: string[];
  reviewed: boolean;
}

/** form → [freq per million, pinyin, gloss, pinyin, gloss, …] */
export type WordShard = Record<string, (string | number)[]>;
