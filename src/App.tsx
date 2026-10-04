import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useSettings } from './lib/settings';
import { useUpdateAvailable } from './lib/pwa';
import ReaderPage from './pages/ReaderPage';

const CharPage = lazy(() => import('./pages/CharPage'));
const MyCharsPage = lazy(() => import('./pages/MyCharsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

function ScriptToggle() {
  const { settings, update } = useSettings();
  return (
    <div className="script-toggle" role="group" aria-label="Script">
      <button aria-pressed={settings.script === 'trad'} onClick={() => update({ script: 'trad' })} title="Traditional characters" lang="zh-Hant">
        繁
      </button>
      <button aria-pressed={settings.script === 'simp'} onClick={() => update({ script: 'simp' })} title="Simplified characters" lang="zh-Hans">
        简
      </button>
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Bottom notices: a new version is ready, or we're offline. */
function Notices() {
  const update = useUpdateAvailable();
  const online = useOnline();
  if (!update && online) return null;
  return (
    <div className="notices" role="status">
      {update && (
        <div className="notice">
          A new version of 字境 is ready.
          <button className="btn primary" onClick={update}>
            Reload
          </button>
        </div>
      )}
      {!online && <div className="notice faint-notice">Offline: saved characters still work.</div>}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const { settings } = useSettings();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className={settings.toneColors ? '' : 'no-tones'}>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="字境 home">
            <span className="brand-mark" lang="zh-Hant">
              字<span>境</span>
            </span>
            <span className="brand-sub">zìjìng</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Reader
            </NavLink>
            <NavLink to="/mine">My characters</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
          <ScriptToggle />
        </div>
      </header>
      <Notices />
      <main className="shell">
        <Suspense fallback={<div className="loading">研墨…</div>}>
          <Routes>
            <Route path="/" element={<ReaderPage />} />
            <Route path="/char/:c" element={<CharPage />} />
            <Route path="/mine" element={<MyCharsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<div className="loading">Nothing here. <NavLink to="/">Back to the reader</NavLink></div>} />
          </Routes>
        </Suspense>
        <footer className="footer">
          <span>字境 · local-only study app — your data stays in this browser.</span>
          <NavLink to="/about">Data sources &amp; credits</NavLink>
        </footer>
      </main>
    </div>
  );
}
