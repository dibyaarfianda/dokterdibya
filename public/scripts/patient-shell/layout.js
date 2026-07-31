export function bindPatientLayoutLifecycle(callbacks) {
    const listeners = [];
    const bind = (target, eventName, handler, options) => {
        if (typeof handler !== 'function') return;
        target.addEventListener(eventName, handler, options);
        listeners.push(() => target.removeEventListener(eventName, handler, options));
    };

    bind(document, 'DOMContentLoaded', callbacks.init);
    bind(document, 'keydown', callbacks.keydown);
    bind(window, 'scroll', callbacks.scroll, { passive: true });
    bind(window, 'wheel', callbacks.wheel, { passive: true });
    bind(window, 'wheel', callbacks.wheelGuard, { passive: false, capture: true });
    bind(window, 'touchstart', callbacks.touchstart, { passive: true });
    bind(window, 'touchmove', callbacks.touchmove, { passive: true });
    bind(window, 'touchmove', callbacks.touchGuard, { passive: false, capture: true });
    bind(window, 'resize', callbacks.resize, { passive: true });
    bind(window, 'pageshow', callbacks.pageshow);

    if (window.visualViewport) {
        bind(window.visualViewport, 'resize', callbacks.visualResize, { passive: true });
    }

    return () => listeners.splice(0).forEach(remove => remove());
}
