// Distinguish a pasted vocabulary list from running text, and parse vocab rows.

export type InputKind = 'text' | 'vocab';

export interface VocabRow {
  word: string;
  pinyin?: string;
  def?: string;
}

const HEAD = /^\s*([\p{Script=Han}·〇]{1,12})(?:\s*(?:\t|,|，|;|；|\||:|：|\s-\s|\s{1,})\s*(.*))?$/u;
const SENTENCE_PUNCT = /[。！？；，、：「」『』（）《》…—]/u;
// Pinyin with tone marks or numbers, possibly several syllables: "xuéxí", "xue2 xi2", "tu2shu1guan3"
const PINYIN = /^[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ:'’1-5\s-]+$/;

export function detectKind(text: string): InputKind {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return 'text';
  let vocabish = 0;
  for (const l of lines) {
    const m = HEAD.exec(l);
    if (!m) continue;
    const head = m[1];
    const rest = m[2] ?? '';
    // A head word followed by Latin text (pinyin/definition) is a strong vocab signal;
    // a bare short Han line without sentence punctuation counts too (a list of words).
    if (rest && /[a-zA-Z]/.test(rest) && !SENTENCE_PUNCT.test(head)) vocabish++;
    else if (!rest && [...head].length <= 6 && !SENTENCE_PUNCT.test(l)) vocabish++;
  }
  return vocabish / lines.length >= 0.7 ? 'vocab' : 'text';
}

export function parseVocab(text: string): VocabRow[] {
  const rows: VocabRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = HEAD.exec(line);
    if (!m) {
      // Not a recognizable row: keep any Han run so nothing pasted is silently dropped.
      const han = line.match(/[\p{Script=Han}]+/u)?.[0];
      if (han) rows.push({ word: han });
      continue;
    }
    const row: VocabRow = { word: m[1] };
    let rest = (m[2] ?? '').trim();
    if (rest) {
      // Split remaining columns on tabs / " - " / "|" / ";" first, otherwise peel off a leading pinyin run.
      const cols = rest.split(/\t|\s+[-–—|]\s+|\s*[|;；]\s*/).map((s) => s.trim()).filter(Boolean);
      if (cols.length > 1 && PINYIN.test(cols[0])) {
        row.pinyin = cols[0];
        row.def = cols.slice(1).join('; ');
      } else if (cols.length > 1) {
        row.def = cols.join('; ');
      } else {
        // "xuéxí to study" — take leading pinyin-looking tokens
        const words = rest.split(/\s+/);
        const py: string[] = [];
        while (words.length && /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]|\d$/.test(words[0]) && PINYIN.test(words[0])) py.push(words.shift()!);
        if (py.length) row.pinyin = py.join(' ');
        rest = words.join(' ');
        if (rest) row.def = rest;
      }
    }
    rows.push(row);
  }
  return rows;
}
