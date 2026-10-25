import { startCommunityBadge } from './community-chat-badge.js?v=20261025edgechat1';

export function mountPatientCommunityChat() {
    if (window.__patientCommunityChat) return window.__patientCommunityChat;
    const session = window.PatientSession;
    if (window.parent !== window || !session?.getToken() || session.isDemoMode()) return null;

    const mobile = window.matchMedia('(max-width: 900px)');
    const available = () => Boolean(session.getToken()) && !session.isDemoMode();
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/styles/patient-community-chat.css?v=20261025chatfast1';
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'patient-community-widget';
    root.innerHTML = `
        <button type="button" id="patient-community-launcher" aria-label="Buka chat komunitas" aria-haspopup="dialog" aria-controls="patient-community-panel" aria-expanded="false">
            <svg viewBox="0 0 12 16" width="10" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 3-5 5 5 5"/></svg>
            <span class="patient-community-tab-label" aria-hidden="true">CHAT</span>
            <span id="patient-community-edge-badge" hidden aria-live="polite"></span>
        </button>
        <dialog id="patient-community-panel" aria-labelledby="patient-community-title">
            <header class="patient-community-header">
                <span id="patient-community-title">Chat Komunitas</span>
                <button type="button" id="patient-community-close" aria-label="Tutup chat komunitas">&#215;</button>
            </header>
            <div id="patient-community-content"></div>
        </dialog>`;
    document.body.appendChild(root);
    const launcher = document.getElementById('patient-community-launcher');
    const panel = document.getElementById('patient-community-panel');
    const content = document.getElementById('patient-community-content');
    let frame = null, opened = false, closeTimer = null, pendingBack = false;
    let previousOverflow = '', credential = session.getToken();
    let warmAttempted = false;

    function prepareFrame() {
        if (!mobile.matches || !available()) return;
        if (frame) return;
        warmAttempted = true;
        frame = document.createElement('iframe');
        frame.id = 'patient-community-frame';
        frame.title = 'Percakapan chat komunitas';
        frame.dataset.communityChatVisible = 'false';
        frame.src = '/community-chat.html?embed=patient&v=20261025chatfast1';
        frame.addEventListener('load', () => { if (opened) notifyOpened(); });
        content.appendChild(frame);
    }

    function notifyOpened() {
        frame?.contentWindow?.postMessage({ type: 'PATIENT_COMMUNITY_CHAT_OPEN' }, window.location.origin);
    }
    // Warm once after the portal's initial work; hidden frames never acknowledge reads.
    window.setTimeout(() => { if (!warmAttempted) prepareFrame(); }, 800);

    function updateViewport() {
        const viewport = window.visualViewport;
        panel.style.setProperty('--patient-chat-height', Math.round(viewport?.height || window.innerHeight) + 'px');
        panel.style.setProperty('--patient-chat-top', Math.round(viewport?.offsetTop || 0) + 'px');
        panel.style.setProperty('--patient-chat-left', Math.round(viewport?.offsetLeft || 0) + 'px');
        panel.style.setProperty('--patient-chat-width', Math.round(viewport?.width || window.innerWidth) + 'px');
    }

    function open(fromHistory = false) {
        if (!mobile.matches || !available()) return false;
        if (opened) return true;
        clearTimeout(closeTimer);
        updateViewport();
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (!panel.open) panel.showModal();
        opened = true;
        launcher.setAttribute('aria-expanded', 'true');
        prepareFrame();
        frame.dataset.communityChatVisible = 'true';
        notifyOpened();
        requestAnimationFrame(() => { if (opened) panel.classList.add('is-open'); });
        document.getElementById('patient-community-close').focus({ preventScroll: true });
        if (!fromHistory) {
            try { history.pushState({ ...history.state, patientCommunityChat: true }, '', window.location.href); } catch (_) {}
        }
        return true;
    }

    function close(fromHistory = false) {
        if (!opened) return;
        opened = false;
        if (frame) frame.dataset.communityChatVisible = 'false';
        panel.classList.remove('is-open');
        launcher.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = previousOverflow;
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            if (opened) return;
            panel.close();
            launcher.focus({ preventScroll: true });
            window.dispatchEvent(new Event('community:read'));
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
        if (!fromHistory && history.state?.patientCommunityChat) {
            pendingBack = true;
            history.back();
        }
    }

    launcher.addEventListener('click', () => open());
    document.getElementById('patient-community-close').addEventListener('click', () => close());
    panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // Capture before the home shell's Back-to-exit guard.
    function handleBack(event) {
        if (event.patientCommunityChatHandled) return true;
        if (pendingBack || (opened && !event.state?.patientCommunityChat)) {
            event.patientCommunityChatHandled = true;
            event.stopImmediatePropagation();
            pendingBack = false;
            close(true);
            return true;
        } else if (event.state?.patientCommunityChat) {
            event.patientCommunityChatHandled = true;
            event.stopImmediatePropagation();
            open(true);
            return true;
        }
        return false;
    }
    window.addEventListener('popstate', handleBack, true);
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) return;
        if (event.data?.type === 'PATIENT_COMMUNITY_CHAT_CLOSE') {
            close();
            if (event.data.reset === true) { frame.remove(); frame = null; }
        }
        if (event.data?.type === 'PATIENT_COMMUNITY_CHAT_READ') window.dispatchEvent(new Event('community:read'));
    });
    // Existing home card opens the same panel on mobile; desktop keeps its route.
    document.addEventListener('click', event => {
        const target = event.target.closest('[data-shell-href], a[href]');
        const href = target?.dataset.shellHref || target?.getAttribute('href');
        if (!href || !mobile.matches || !available()) return;
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname !== '/community-chat.html' || url.searchParams.has('room')) return;
        if (open()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    mobile.addEventListener('change', () => { if (!mobile.matches) close(); });
    function checkSession() {
        const next = session.getToken();
        if (next === credential && available()) return;
        close();
        frame?.remove(); frame = null;
        credential = next;
        launcher.hidden = !available();
        window.dispatchEvent(new Event('community:read'));
    }
    window.addEventListener('auth:credentials-changed', checkSession);
    window.addEventListener('storage', checkSession);
    window.addEventListener('pageshow', checkSession);
    startCommunityBadge({
        getToken: () => session.getToken(), enabled: available,
        badge: [document.getElementById('patient-community-edge-badge'), document.getElementById('community-chat-badge')]
    });
    const controller = { open, close, handleBack };
    window.__patientCommunityChat = controller;
    return controller;
}
