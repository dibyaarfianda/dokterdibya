(function initTapFeedback() {
    if (window.__tapFeedbackInitialized) return;
    window.__tapFeedbackInitialized = true;

    const tapSound = document.getElementById('tap-feedback-sound');
    const interactiveTags = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);

    function isMobileContext() {
        return window.matchMedia('(pointer: coarse)').matches ||
            window.isMobileAppMode?.() ||
            window.isNativePlatform?.();
    }

    function playTap() {
        try {
            if (!tapSound) return;
            tapSound.volume = 0.7;
            tapSound.currentTime = 0;
            const playback = tapSound.play();
            if (playback?.catch) playback.catch(function() {});
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
            navigator.vibrate(10);
        }
    }

    if (window.PointerEvent) {
        document.addEventListener('pointerdown', handleTapStart, { passive: true });
    } else {
        document.addEventListener('touchstart', handleTapStart, { passive: true });
    }
})();
