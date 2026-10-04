export function externalLinks(c: string) {
  const e = encodeURIComponent(c);
  return [
    { label: '小學堂 字形演變', href: `https://xiaoxue.iis.sinica.edu.tw/yanbian?char=${e}` },
    { label: '漢語多功能字庫', href: `https://humanum.arts.cuhk.edu.hk/Lexis/lexi-mf/search.php?word=${e}` },
    { label: 'zi.tools', href: `https://zi.tools/zi/${e}` },
    { label: 'Wiktionary', href: `https://en.wiktionary.org/wiki/${e}` },
    { label: 'MDBG', href: `https://www.mdbg.net/chinese/dictionary?page=worddict&wdqb=${e}` },
  ];
}
