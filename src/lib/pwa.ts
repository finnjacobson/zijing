// Service-worker registration and update handling (production builds only).
import { useEffect, useState } from 'react';

let waiting: ServiceWorker | null = null;
const listeners = new Set<(w: ServiceWorker | null) => void>();
const announce = (w: ServiceWorker | null) => {
  waiting = w;
  listeners.forEach((f) => f(w));
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  // When the new worker takes over after "Reload", load the new app shell.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL });
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          // Only offer an update when replacing an existing version, not on first install.
          if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
        });
      });
      // A home-screen app can stay open for days: check for a new version when it comes back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {
      /* unsupported or blocked: the app works the same, just without offline support */
    }
  });
}

export function useUpdateAvailable() {
  const [w, setW] = useState<ServiceWorker | null>(waiting);
  useEffect(() => {
    listeners.add(setW);
    return () => void listeners.delete(setW);
  }, []);
  return w ? () => w.postMessage('SKIP_WAITING') : null;
}

/** True when running as an installed home-screen app. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
