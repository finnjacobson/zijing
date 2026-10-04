import { useEffect, useRef, useState } from 'react';
import { clearOffline, downloadAll, mb, offlineStatus, storageEstimate, type OfflineStatus } from '../lib/offline';
import { isStandalone } from '../lib/pwa';

export function OfflinePanel() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const refresh = () => {
    offlineStatus().then(setStatus);
    storageEstimate().then(setStorage);
  };
  useEffect(() => {
    refresh();
    return () => abort.current?.abort();
  }, []);

  const start = async () => {
    setMsg(null);
    abort.current = new AbortController();
    try {
      const r = await downloadAll((done, total) => {
        setProgress({ done, total });
        setStatus((s) => (s ? { ...s, cached: done, total } : s));
      }, abort.current.signal);
      if (abort.current.signal.aborted) setMsg('Paused. Tap Download again to resume where it stopped.');
      else setMsg(r.failed ? `Finished with ${r.failed} files that failed. Tap Download again to retry them.` : 'Everything is available offline.');
    } catch (e) {
      setMsg(`Download failed: ${(e as Error).message}. Check the connection and try again.`);
    }
    setProgress(null);
    abort.current = null;
    refresh();
  };

  if (!status) return <p className="faint small">Checking offline storage…</p>;
  if (!status.supported)
    return <p className="muted small">Offline storage needs the installed app or a deployed build (it’s off in the development server).</p>;

  const complete = status.total > 0 && status.cached >= status.total;
  const pct = progress ? Math.floor((100 * progress.done) / progress.total) : status.total ? Math.floor((100 * status.cached) / status.total) : 0;

  return (
    <div className="offline">
      <p className="muted small">
        Pages you open are saved automatically. To study anywhere without a connection, download all {status.total.toLocaleString() || '~54,000'} data files (about{' '}
        {mb(status.bytes || 143e6)}). Ancient-form images from Wikimedia are only saved once you’ve viewed them.
      </p>
      <div className="offline-bar" aria-label={`${pct}% available offline`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small">
        {progress
          ? `Downloading… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} (${pct}%)`
          : complete
            ? 'All character data is available offline.'
            : `${status.cached.toLocaleString()} of ${status.total.toLocaleString()} files saved (${pct}%).`}
      </p>
      <div className="row">
        {progress ? (
          <button className="btn" onClick={() => abort.current?.abort()}>
            Pause
          </button>
        ) : (
          <button className="btn primary" onClick={start} disabled={complete}>
            {status.cached > 0 && !complete ? 'Resume download' : 'Download everything'}
          </button>
        )}
        {!progress && status.cached > 0 && !confirmRemove && (
          <button className="btn ghost" onClick={() => setConfirmRemove(true)}>
            Remove offline data…
          </button>
        )}
      </div>
      {confirmRemove && (
        <div className="confirm-box">
          <p>Delete the downloaded character data? Your progress is not affected; pages will download again as you open them.</p>
          <div className="row">
            <button
              className="btn primary"
              onClick={async () => {
                await clearOffline();
                setConfirmRemove(false);
                setMsg('Offline data removed.');
                refresh();
              }}
            >
              Remove
            </button>
            <button className="btn ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="small muted">{msg}</p>}
      {storage && (
        <p className="faint small">
          Storage used by 字境: {mb(storage.usage)}
          {storage.quota ? ` of ${mb(storage.quota)} allowed` : ''} · {storage.persisted ? 'protected from automatic clean-up' : 'may be cleared by the browser if space runs low'}
          {!isStandalone() && ' · Add 字境 to your Home Screen to keep it safe from Safari’s clean-up.'}
        </p>
      )}
    </div>
  );
}
