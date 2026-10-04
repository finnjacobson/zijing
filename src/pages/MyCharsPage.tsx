import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportAll, importAll, lastPracticed, mastery, MODES, type Backup, type CharProgress } from '../lib/db';
import { useAllProgress } from '../lib/useProgress';
import { Seal } from '../components/Seal';
import { useSettings } from '../lib/settings';
import './mine.css';

type SortKey = 'mastery' | 'recall' | 'last' | 'views' | 'added';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'mastery', label: 'Mastery' },
  { key: 'recall', label: 'Recall score' },
  { key: 'last', label: 'Last practised' },
  { key: 'views', label: 'Views' },
  { key: 'added', label: 'First seen' },
];

function sortValue(p: CharProgress, k: SortKey): number {
  switch (k) {
    case 'mastery':
      return mastery(p) ?? -1;
    case 'recall':
      return p.modes.recall?.best ?? -1;
    case 'last':
      return lastPracticed(p) ?? -1;
    case 'views':
      return p.views;
    case 'added':
      return p.firstSeen;
  }
}

export async function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  // On iPad/iPhone (especially as a home-screen app) a blob download opens a dead-end preview;
  // the share sheet offers "Save to Files", AirDrop, etc.
  const file = new File([blob], name, { type: 'application/json' });
  if (window.matchMedia('(hover: none)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user closed the sheet
      // NotAllowedError etc.: fall back to a plain download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useBackupActions() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doExport = async () => {
    const b = await exportAll();
    await downloadJson(`zijing-backup-${new Date().toISOString().slice(0, 10)}.json`, b);
    setMsg(`Exported ${b.progress.length} characters.`);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = JSON.parse(await f.text()) as Backup;
      if (b?.app !== 'zijing' || !Array.isArray(b.progress)) throw new Error('not a 字境 backup');
      setPending(b);
      setMsg(null);
    } catch (e) {
      setMsg(`Couldn’t read that file: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const confirm = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    const n = await importAll(pending, mode);
    setPending(null);
    setMsg(`${mode === 'merge' ? 'Merged' : 'Restored'} ${n} characters.`);
  };
  const ui = (
    <div className="backup">
      <div className="row">
        <button className="btn" onClick={doExport}>
          ⤓ Export JSON
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          ⤒ Import JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {pending && (
        <div className="confirm-box">
          <p>
            Backup from {new Date(pending.exportedAt).toLocaleString()} with {pending.progress.length} characters.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => confirm('merge')}>
              Merge with my data
            </button>
            <button className="btn" onClick={() => confirm('replace')}>
              Replace my data
            </button>
            <button className="btn ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
  return ui;
}

export default function MyCharsPage() {
  const progress = useAllProgress();
  const { settings } = useSettings();
  const [sort, setSort] = useState<SortKey>('last');
  const [asc, setAsc] = useState(false);
  const [filter, setFilter] = useState<'all' | 'practised' | 'viewed' | 'sealed'>('all');
  const backup = useBackupActions();

  const rows = useMemo(() => {
    let list = [...progress.values()];
    if (filter === 'practised') list = list.filter((p) => p.attempts.length);
    if (filter === 'viewed') list = list.filter((p) => !p.attempts.length);
    if (filter === 'sealed') list = list.filter((p) => p.sealedAt);
    list.sort((a, b) => (sortValue(a, sort) - sortValue(b, sort)) * (asc ? 1 : -1));
    return list;
  }, [progress, sort, asc, filter]);

  const all = [...progress.values()];
  const practised = all.filter((p) => p.attempts.length).length;
  const sealed = all.filter((p) => p.sealedAt).length;

  return (
    <div className="mine">
      <section className="reader-intro ink-in">
        <h1>
          <span className="kai" lang="zh-Hant" style={{ color: 'var(--zhu)', fontSize: '1.3em' }}>
            藏
          </span>{' '}
          My characters
        </h1>
        <p className="muted">
          {all.length} studied · {practised} practised · {sealed} sealed. Everything is stored locally in this browser.
        </p>
      </section>

      <div className="mine-toolbar">
        <label className="small muted">
          Sort{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn icon" onClick={() => setAsc(!asc)} title={asc ? 'Ascending' : 'Descending'} aria-label="Toggle sort direction">
          {asc ? '↑' : '↓'}
        </button>
        <div className="seg">
          {(['all', 'practised', 'viewed', 'sealed'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'viewed' ? 'viewed only' : f}
            </button>
          ))}
        </div>
        <div className="spacer" />
        {backup}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          {all.length ? 'Nothing matches this filter.' : (
            <>
              No characters yet. Open one from the <Link to="/">reader</Link> and practise it.
            </>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="mine-table">
            <thead>
              <tr>
                <th>字</th>
                <th>Mastery</th>
                {MODES.map((m) => (
                  <th key={m}>
                    {m} <span className="faint">best / last</span>
                  </th>
                ))}
                <th>Last practised</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const m = mastery(p);
                const lp = lastPracticed(p);
                return (
                  <tr key={p.c}>
                    <td>
                      <Link to={`/char/${p.c}`} className="mine-char kai">
                        {p.c}
                      </Link>
                      {p.sealedAt && <Seal text={settings.sealText || '印'} size={22} className="mini-seal" />}
                    </td>
                    <td>
                      {m == null ? (
                        <span className="faint">—</span>
                      ) : (
                        <span className="mastery-cell">
                          <span className="mbar">
                            <span style={{ width: `${m}%`, background: m < 45 ? 'var(--zhu)' : m < 75 ? 'var(--gold)' : 'var(--jade)' }} />
                          </span>
                          {m}
                        </span>
                      )}
                    </td>
                    {MODES.map((mode) => {
                      const s = p.modes[mode];
                      return (
                        <td key={mode}>
                          {s ? (
                            <>
                              <b>{s.best}</b> <span className="faint">/ {s.recent}</span> <span className="faint small">×{s.count}</span>
                            </>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td>{lp ? new Date(lp).toLocaleDateString() : <span className="faint">never</span>}</td>
                    <td>{p.views}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
