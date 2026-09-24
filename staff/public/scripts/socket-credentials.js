(function (global) {
    'use strict';
    // Shared by classic patient scripts and staff modules. Never retain a principal
    // across a credential change, including while an asynchronous read is pending.
    global.bindSocketCredentials = function (socket, readToken) {
        let credential;
        let generation = 0;
        let readSequence = 0;
        let stopped = false;
        const resolveToken = () => {
            try { return readToken(); } catch (_) { return null; }
        };
        async function refresh(resume = false) {
            const current = ++readSequence;
            const sessionGeneration = generation;
            const token = await Promise.resolve(resolveToken()).catch(() => null);
            if (stopped || current !== readSequence || sessionGeneration !== generation) return;
            const changed = token !== credential;
            if (changed) {
                ++generation;
                socket.disconnect();
                credential = token || null;
            }
            if (!credential) { socket.disconnect(); return; }
            if ((changed || resume) && !socket.connected && !socket.active) socket.connect();
        }
        function invalidate() {
            // Same-tab logout closes synchronously, before any async token read.
            ++generation;
            socket.disconnect();
            credential = undefined;
            refresh();
        }
        socket.auth = async callback => {
            const current = generation;
            const token = await Promise.resolve(resolveToken()).catch(() => null);
            if (stopped || current !== generation) return;
            if (!token || token !== credential) {
                socket.disconnect();
                credential = undefined;
                if (token) refresh();
                return;
            }
            callback({ token });
        };
        const resume = () => refresh(true);
        const events = ['auth:credentials-changed'];
        const storageChanged = () => refresh();
        global.addEventListener('storage', storageChanged);
        events.forEach(event => global.addEventListener(event, invalidate));
        ['online', 'pageshow', 'focus'].forEach(event => global.addEventListener(event, resume));
        const timer = global.setInterval(() => refresh(), 1000);
        socket.refreshCredentials = resume;
        socket.invalidateCredentials = invalidate;
        socket.stopCredentialTracking = () => {
            stopped = true; ++generation;
            global.clearInterval(timer);
            global.removeEventListener('storage', storageChanged);
            events.forEach(event => global.removeEventListener(event, invalidate));
            ['online', 'pageshow', 'focus'].forEach(event => global.removeEventListener(event, resume));
            socket.disconnect();
        };
        refresh();
        return socket;
    };
})(window);
