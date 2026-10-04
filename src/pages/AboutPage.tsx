import { useEffect, useState } from 'react';
import './mine.css';

interface Meta {
  built: string;
  downloaded: string;
  cedict: string;
  unihanVersion: string;
  stats: Record<string, number>;
}

const SOURCES: { name: string; href: string; license: string; licenseHref?: string; use: string; credit?: string }[] = [
  {
    name: 'Make Me a Hanzi',
    href: 'https://github.com/skishore/makemeahanzi',
    license: 'graphics: Arphic Public License · dictionary: LGPL-3.0+',
    licenseHref: 'https://github.com/skishore/makemeahanzi/blob/master/COPYING',
    use: 'Stroke outlines and medians, IDS decomposition, radicals, etymology (semantic / phonetic components).',
    credit: 'Shaunak Kishore; stroke data derived from Arphic PL KaitiM GB and UKai fonts © Arphic Technology Co., Ltd.',
  },
  {
    name: 'Hanzi Writer',
    href: 'https://hanziwriter.org',
    license: 'MIT',
    use: 'Stroke animation and handwriting quiz engine.',
    credit: 'David Chanin',
  },
  {
    name: 'AnimCJK (zh-Hant)',
    href: 'https://github.com/parsimonhi/animCJK',
    license: 'Arphic Public License (graphics)',
    use: 'Taiwan-standard stroke order for ~1,000 traditional characters.',
    credit: 'FM&SH; derived from Arphic PL KaitiM Big5/GB fonts and Make Me a Hanzi.',
  },
  {
    name: 'CC-CEDICT',
    href: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
    license: 'CC BY-SA 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by-sa/4.0/',
    use: 'Definitions, pinyin, traditional/simplified pairs, words containing each character, segmentation dictionary.',
    credit: 'MDBG and the CC-CEDICT contributors. Derived data in this app is shared under the same license.',
  },
  {
    name: 'Unihan Database',
    href: 'https://www.unicode.org/charts/unihan.html',
    license: 'Unicode License v3',
    licenseHref: 'https://www.unicode.org/license.txt',
    use: 'Stroke counts, radical-stroke index, variants, Cantonese / Japanese / Korean / Vietnamese readings.',
    credit: '© Unicode, Inc.',
  },
  {
    name: 'SUBTLEX-CH',
    href: 'https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch',
    license: 'free for research and non-commercial use, with citation',
    use: 'Word and character frequencies used for ranking and segmentation.',
    credit: 'Cai, Q., & Brysbaert, M. (2010). SUBTLEX-CH: Chinese word and character frequencies based on film subtitles. PLoS ONE, 5(6), e10729.',
  },
  {
    name: 'Ancient Chinese Characters Project (Wikimedia Commons)',
    href: 'https://commons.wikimedia.org/wiki/Commons:Ancient_Chinese_characters_project',
    license: 'Public domain / CC0',
    use: 'Oracle-bone, bronze, Chu and Qin slip, small-seal and Liushutong SVGs (loaded from upload.wikimedia.org).',
    credit: 'Wikimedia Commons contributors',
  },
  {
    name: 'Kaiyuan Small Seal (開元小篆)',
    href: 'https://github.com/frankslin/kaiyuan-small-seal-font',
    license: 'SIL Open Font License 1.1',
    licenseHref: 'https://openfontlicense.org',
    use: 'Small-seal outlines when Commons has none, and the seal-script glyphs on your 印章. Pre-release: machine-aligned glyphs are marked “unreviewed”.',
    credit: 'Frank Lin and contributors; traced from public-domain 說文解字 woodblock editions.',
  },
  {
    name: '說文解字 data (shuowenjiezi/shuowen)',
    href: 'https://github.com/shuowenjiezi/shuowen',
    license: 'Apache-2.0 (the text itself is public domain)',
    use: 'Shuowen explanations, 反切 and Duan Yucai notes.',
    credit: 'Shuowen.org contributors',
  },
  {
    name: 'OpenCC (opencc-js)',
    href: 'https://github.com/nk2028/opencc-js',
    license: 'MIT / Apache-2.0',
    use: 'Phrase-aware traditional ⇄ simplified conversion.',
  },
  {
    name: 'Wikipedia: Comparison of Standard Chinese transcription systems',
    href: 'https://en.wikipedia.org/wiki/Comparison_of_Standard_Chinese_transcription_systems',
    license: 'CC BY-SA 4.0',
    use: 'Pinyin → Zhuyin / Wade–Giles / Yale syllable table, cross-checked against the pinyin-to-zhuyin library.',
    credit: 'Wikipedia contributors',
  },
  {
    name: 'Fonts: Noto Serif/Sans CJK, LXGW WenKai TC, Ma Shan Zheng, Zhi Mang Xing, Long Cang, Liu Jian Mao Cao, EB Garamond',
    href: 'https://fonts.google.com',
    license: 'SIL Open Font License 1.1',
    use: 'Interface type and the calligraphy views (served by Google Fonts).',
  },
];

const LIC = import.meta.env.BASE_URL + 'licenses/';
const LICENSE_FILES: [string, string][] = [
  ['NOTICE.txt', 'Notice'],
  ['ARPHIC-PUBLIC-LICENSE.txt', 'Arphic Public License'],
  ['LGPL-3.0-makemeahanzi.txt', 'LGPL 3.0'],
  ['GPL-3.0.txt', 'GPL 3.0'],
  ['CC-BY-SA-4.0.txt', 'CC BY-SA 4.0'],
  ['UNICODE-LICENSE.txt', 'Unicode License v3'],
  ['OFL-1.1-Kaiyuan-Small-Seal.txt', 'SIL OFL 1.1'],
  ['APACHE-2.0-shuowen.txt', 'Apache 2.0'],
];

export default function AboutPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/meta.json')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  return (
    <div className="about">
      <section className="reader-intro ink-in">
        <h1>
          <span className="kai" lang="zh-Hant" style={{ color: 'var(--zhu)', fontSize: '1.3em' }}>
            源
          </span>{' '}
          About &amp; credits
        </h1>
        <p className="muted">
          字境 is a character-first reader and study tool. It runs entirely in your browser: dictionary data is loaded one character at a time from static files, and your
          progress is kept in IndexedDB on this device.
        </p>
      </section>

      <div className="credits">
        {SOURCES.map((s) => (
          <section key={s.name} className="credit">
            <h3>
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            </h3>
            <p className="small">
              <span className="chip">{s.licenseHref ? <a href={s.licenseHref} target="_blank" rel="noreferrer">{s.license}</a> : s.license}</span>
            </p>
            <p className="small muted">{s.use}</p>
            {s.credit && <p className="small faint">{s.credit}</p>}
          </section>
        ))}
      </div>

      {meta && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2>This build</h2>
          <p className="small muted">
            Data built {new Date(meta.built).toLocaleString()} from sources downloaded {meta.downloaded ? new Date(meta.downloaded).toLocaleString() : '—'}. CC-CEDICT {meta.cedict}{' '}
            Unihan {meta.unihanVersion}.
          </p>
          <dl className="facts">
            {[
              ['Characters', meta.stats.chars],
              ['With stroke data', meta.stats.withStrokes],
              ['Taiwan stroke order', meta.stats.withTaiwanStrokes],
              ['With decomposition', meta.stats.withTree],
              ['With ancient forms', meta.stats.withAncient],
              ['With seal glyph', meta.stats.withSeal],
              ['With 說文 entry', meta.stats.withShuowen],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt>{k}</dt>
                <dd>{(v as number)?.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>License texts</h2>
        <p className="small muted">
          The bundled character data is generated from the datasets above and redistributed under their licenses.{' '}
          <a href={LIC + 'NOTICE.txt'}>
            NOTICE.txt
          </a>{' '}
          explains which license covers which files.
        </p>
        <div className="ext-links">
          {LICENSE_FILES.map(([file, label]) => (
            <a key={file} href={LIC + file} target="_blank" rel="noreferrer">
              {label}
            </a>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Known gaps</h2>
        <ul className="small muted">
          <li>Stroke data covers ~9,600 characters. Some alternate traditional forms (爲, 僞, 絶…) have none; their standard forms (為, 偽, 絕) do.</li>
          <li>Taiwan stroke order is only available for ~1,000 characters; the rest follow the mainland standard.</li>
          <li>No open dataset or open-licensed font for clerical script (隸書) was found, so that tile usually says “not available”.</li>
          <li>Ancient forms are hotlinked from Wikimedia Commons and need a network connection.</li>
          <li>Readings for phonetic series are modern Mandarin; they illustrate drift rather than reconstruct Old Chinese.</li>
        </ul>
      </section>
    </div>
  );
}
