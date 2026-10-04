# 字境 data pipeline — sources, licenses, coverage

Run `npm run data` (= `data:download` + `data:romanization` + `data:build`). Raw files are cached in
`data-raw/` (gitignored); output goes to `public/data/` (also gitignored, regenerate it).

## Sources (verified 2026-09-30)

| Dataset | Status / format | License | Used for |
|---|---|---|---|
| Make Me a Hanzi `dictionary.txt`, `graphics.txt` (skishore/makemeahanzi) | ✅ live; JSON-lines, 9,574 chars | dictionary: LGPL-3.0+; graphics: Arphic Public License | strokes + medians, IDS decomposition, radical, etymology (type/semantic/phonetic/hint), stroke→component `matches` |
| Hanzi Writer (npm `hanzi-writer` 3.7.3) | ✅ | MIT | animation + quiz engine. Data is served from our own shards, not the jsDelivr CDN |
| AnimCJK `graphicsZhHant.txt` (parsimonhi/animCJK) | ✅ live; same JSON shape as MMAH, 1,013 chars | Arphic Public License (graphics) | Taiwan (教育部) stroke-order alternative |
| CC-CEDICT (MDBG export) | ✅ live; 125,149 entries (2026-09-30) | CC BY-SA 4.0 | definitions, pinyin, trad/simp, words containing a char, segmentation dictionary |
| Unihan (Unicode 18.0.0) | ✅ live; tab-separated | Unicode License v3 | stroke count, radical-stroke, variants, Cantonese/Japanese/Korean/Vietnamese readings |
| SUBTLEX-CH word + character frequencies (Cai & Brysbaert 2010) | ✅ live at ugent.be (old crr.ugent.be URL is gone); GB18030 TSV | free for research with citation | ranking "common words", character frequency rank, segmentation weights |
| Wikimedia Commons Ancient Chinese Characters Project | ✅ indexed via API; ~18k SVGs across 6 script categories, 3,894 distinct named characters | public domain / CC0 | oracle, bronze, Chu silk/slip, Qin slip, Shuowen seal, Liushutong forms (hotlinked at runtime) |
| Kaiyuan Small Seal glyphs (frankslin/kaiyuan-small-seal-font) | ⚠️ **font not released yet**; repo has per-glyph SVGs mapped via Unicode 18 `SealSources.txt` | OFL 1.1 | seal-script fallback when Commons has no seal SVG. Only *approved*/*manual* glyphs are marked reviewed; machine-*aligned* ones are shown with an "unreviewed" note; *rejected* are excluded |
| 說文解字 (shuowenjiezi/shuowen) | ✅ 9,833 JSON entries | Apache-2.0 (text itself is public domain) | Shuowen explanation, 反切, first Duan Yucai notes |
| Wikipedia "Comparison of Standard Chinese transcription systems" | ✅ 417 syllables parsed | CC BY-SA 4.0 | Pinyin → Zhuyin / Wade–Giles / Yale table. All 417 Zhuyin cells were cross-checked against the `pinyin-to-zhuyin` library, and WG/Yale initials against rules |
| OpenCC (npm `opencc-js`) | ✅ | MIT / Apache-2.0 | phrase-aware Traditional ⇄ Simplified conversion (lazy-loaded) |
| Google Fonts: Noto Serif SC/TC, LXGW WenKai TC, Ma Shan Zheng, Zhi Mang Xing, Long Cang, Liu Jian Mao Cao | ✅ CSS API with `text=` subsetting | SIL OFL 1.1 | calligraphy views |

## Output

20,048 character shards (every char in CEDICT ∪ MMAH ∪ AnimCJK ∪ core Unihan sets); ~143 MB total, loaded
one file at a time. A character page fetches `c/<HEX>.json` (≈2–20 KB), and on demand `s/` or `t/`
(strokes), `z/` (seal outline), and `w/` (word list for the reader).

## Coverage gaps

- **Stroke data, traditional:** MMAH covers most traditional characters (all 28 characters in the two test
  sentences have strokes). 26 traditional characters whose simplified form is in the top 3,000 have no
  stroke data. Nearly all of them are *alternate* forms rather than the Taiwan standard: 僞 爲 絶 綫 緑 鋭 閲 顔
  奬 謡 駡 竪 厠 綳 綉 葯 鰐 殻 … (the standard 偽 為 絕 線 綠 銳 閱 顏 … are covered). The app shows a "no stroke data"
  state and links to the variant that has data.
- **Taiwan stroke order:** only 1,013 characters (AnimCJK). Everything else uses MMAH (mainland order),
  which differs for characters like 必, 王-family, and 艹 components. The app shows which standard it is using.
- **Decomposition for traditional-only characters:** MMAH decompositions exist for 10,078 shards (including
  fallback to the simplified/traditional counterpart, flagged in the UI). Some decompositions contain `？`
  (unknown component), e.g. the top of 學; these show as "unidentified component".
- **Ancient forms:** 4,693 shards have at least one Commons SVG (including via trad/simp counterpart).
  Many of the 1,000 most frequent characters have none, but most of them are post-Qin characters
  (你 他 們 的 這 嗎 …) that genuinely have no oracle or bronze form. Numbered `ACC-b00016.svg`-style Commons files are
  skipped because their names don't identify the character.
- **Clerical script (隸書):** no open dataset or open-licensed clerical font found (Commons has 5 files).
  The strip shows "not available" with links to 小學堂 and 漢語多功能字庫.
- **Seal font:** Kaiyuan glyphs cover 8,679 shards, but the project is pre-release and only ~1,200 glyphs
  are human-approved.
- **Shuowen:** 9,923 shards (including forms listed under another headword).
