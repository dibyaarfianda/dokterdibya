import { render } from 'preact';
import App from './app';
import './index.css';

const DOCBOARD_PWA_VERSION = '20260712-7';
let reloadingForWorkerUpdate = false;

function showUpdatePrompt(registration) {
  if (document.getElementById('docboard-update-prompt')) return;

  const prompt = document.createElement('div');
  prompt.id = 'docboard-update-prompt';
  prompt.setAttribute('role', 'status');
  prompt.style.cssText = 'position:fixed;left:16px;right:16px;bottom:20px;z-index:2147483647;display:flex;align-items:center;gap:12px;background:#0F172A;color:#FFFFFF;border-radius:8px;padding:12px 14px;box-shadow:0 10px 25px rgba(15,23,42,.24);font:14px system-ui,sans-serif;';

  const text = document.createElement('span');
  text.textContent = 'Update baru tersedia';
  text.style.flex = '1';

  const updateButton = document.createElement('button');
  updateButton.type = 'button';
  updateButton.textContent = 'Perbarui';
  updateButton.style.cssText = 'border:0;border-radius:6px;background:#FFFFFF;color:#0F172A;font:600 13px system-ui,sans-serif;padding:8px 10px;cursor:pointer;';
  updateButton.addEventListener('click', () => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });

  prompt.append(text, updateButton);
  document.body.appendChild(prompt);
}

function watchForWorkerUpdate(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdatePrompt(registration);
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdatePrompt(registration);
      }
    });
  });
}

// Register service worker for PWA + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/docboard/sw.js?v=${DOCBOARD_PWA_VERSION}`, { updateViaCache: 'none' })
      .then((reg) => {
        watchForWorkerUpdate(reg);
        reg.update();
        console.log('SW registered:', reg.scope);
      })
      .catch(err => console.warn('SW registration failed:', err));
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForWorkerUpdate) return;
    reloadingForWorkerUpdate = true;
    window.location.reload();
  });
}

render(<App />, document.getElementById('app'));
