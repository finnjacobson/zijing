import { useState } from 'react';
import { useSettings, DEFAULT_SETTINGS } from '../lib/settings';
import { Seal } from '../components/Seal';
import { useBackupActions } from './MyCharsPage';
import { allProgress, deleteProgress } from '../lib/db';
import { OfflinePanel } from '../components/OfflinePanel';
import './mine.css';

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [seal, setSeal] = useState(settings.sealText);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const backup = useBackupActions();
  const sealChars = [...seal.replace(/\s/g, '')];
  const sealValid = sealChars.length >= 1 && sealChars.length <= 4;

  return (
    <div className="settings">
      <section className="reader-intro ink-in">
        <h1>
          <span className="kai" lang="zh-Hant" style={{ color: 'var(--zhu)', fontSize: '1.3em' }}>
            設
          </span>{' '}
          Settings
        </h1>
      </section>

      <div className="settings-grid">
        <section className="panel">
          <h2>Script</h2>
          <p className="muted small">Converts reader text and character pages. Traditional uses Taiwan standard forms (為, 裡).</p>
          <div className="seg">
            <button aria-pressed={settings.script === 'trad'} onClick={() => update({ script: 'trad' })}>
              繁體 Traditional
            </button>
            <button aria-pressed={settings.script === 'simp'} onClick={() => update({ script: 'simp' })}>
              简体 Simplified
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Stroke order</h2>
          <p className="muted small">
            Taiwan-standard stroke data (AnimCJK) exists for about 1,000 traditional characters. Everything else uses Make Me a Hanzi (mainland standard).
          </p>
          <div className="seg">
            <button aria-pressed={settings.strokeStd === 'm'} onClick={() => update({ strokeStd: 'm' })}>
              Mainland (PRC)
            </button>
            <button aria-pressed={settings.strokeStd === 't'} onClick={() => update({ strokeStd: 't' })}>
              Taiwan where available
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Seal 印章</h2>
          <p className="muted small">Stamped on a character’s page when you write it in Recall mode without a single mistake. 1–4 characters; seal-script forms are used where available.</p>
          <div className="seal-setting">
            <Seal text={sealValid ? sealChars.join('') : DEFAULT_SETTINGS.sealText} size={96} />
            <div>
              <input type="text" value={seal} onChange={(e) => setSeal(e.target.value)} maxLength={8} lang="zh-Hant" style={{ fontSize: '1.3rem', width: '8em' }} aria-label="Seal text" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={!sealValid || sealChars.join('') === settings.sealText} onClick={() => update({ sealText: sealChars.join('') })}>
                  Save
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setSeal(DEFAULT_SETTINGS.sealText);
                    update({ sealText: DEFAULT_SETTINGS.sealText });
                  }}
                >
                  Reset to {DEFAULT_SETTINGS.sealText}
                </button>
              </div>
              {!sealValid && <p className="small" style={{ color: 'var(--zhu-bright)' }}>Use 1 to 4 characters.</p>}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Display</h2>
          <div className="stack">
            <label className="check">
              <input type="checkbox" checked={settings.toneColors} onChange={(e) => update({ toneColors: e.target.checked })} /> Colour pinyin by tone
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.showPinyin} onChange={(e) => update({ showPinyin: e.target.checked })} /> Pinyin above reader text
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.masteryOverlay} onChange={(e) => update({ masteryOverlay: e.target.checked })} /> Mastery overlay in the reader
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>Offline</h2>
          <OfflinePanel />
        </section>

        <section className="panel">
          <h2>Your data</h2>
          <p className="muted small">Progress lives in this browser’s IndexedDB. Export a backup before clearing site data or switching browsers.</p>
          {backup}
          <div style={{ marginTop: 14 }}>
            {!confirmClear ? (
              <button className="btn" onClick={() => setConfirmClear(true)}>
                Clear all progress…
              </button>
            ) : (
              <div className="confirm-box">
                <p>Delete every view, attempt and seal? This can’t be undone (export first if unsure).</p>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={async () => {
                      const all = await allProgress();
                      for (const p of all) await deleteProgress(p.c);
                      setCleared(all.length);
                      setConfirmClear(false);
                    }}
                  >
                    Delete everything
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {cleared != null && <p className="small muted">Cleared {cleared} characters.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
