import { render } from 'preact';
import App from './app';
import './index.css';

const DOCBOARD_PWA_VERSION = '20260712-6';
let reloadingForWorkerUpdate = false;

// Register service worker for PWA + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/docboard/sw.js?v=${DOCBOARD_PWA_VERSION}`, { updateViaCache: 'none' })
      .then((reg) => {
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
