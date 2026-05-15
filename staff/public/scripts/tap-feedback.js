(function initTapFeedback() {
    if (window.__tapFeedbackInitialized) return;
    window.__tapFeedbackInitialized = true;

    let audioCtx = null;
    const interactiveTags = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);

    function isMobileContext() {
        return window.matchMedia('(pointer: coarse)').matches ||
            window.location.search.includes('mobile=1') ||
            window.isNativePlatform?.();
    }

    function getCtx() {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;

        if (!audioCtx) audioCtx = new AudioContextCtor();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(function() {});
        }

        return audioCtx;
    }

    function playTap() {
        try {
            const ac = getCtx();
            if (!ac) return;

            const osc = ac.createOscillator();
            const clickGain = ac.createGain();
            const bodyGain = ac.createGain();

            osc.connect(clickGain);
            osc.connect(bodyGain);
            clickGain.connect(ac.destination);
            bodyGain.connect(ac.destination);

            osc.type = 'square';
            osc.frequency.setValueAtTime(1480, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(680, ac.currentTime + 0.018);
            osc.frequency.exponentialRampToValueAtTime(420, ac.currentTime + 0.045);

            clickGain.gain.setValueAtTime(0.065, ac.currentTime);
            clickGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.014);

            bodyGain.gain.setValueAtTime(0.0225, ac.currentTime + 0.004);
            bodyGain.gain.exponentialRampToValueAtTime(0.006, ac.currentTime + 0.028);
            bodyGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.05);

            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.05);
        } catch (error) {
            console.debug('[TapFeedback] Tap sound skipped:', error?.message || error);
        }
    }

    function isInteractive(target) {
        let node = target;
        while (node && node !== document.body) {
            if (interactiveTags.has(node.tagName) ||
                node.getAttribute('role') === 'button' ||
                node.getAttribute('role') === 'link' ||
                node.getAttribute('tabindex') !== null ||
                typeof node.onclick === 'function' ||
                node.classList?.contains('btn') ||
                node.classList?.contains('nav-link')) {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    function handleTapStart(event) {
        if (!isMobileContext() || !isInteractive(event.target)) return;

        playTap();
        if ('vibrate' in navigator) {
            navigator.vibrate(8);
        }
    }

    if (window.PointerEvent) {
        document.addEventListener('pointerdown', handleTapStart, { passive: true });
    } else {
        document.addEventListener('touchstart', handleTapStart, { passive: true });
    }
})();