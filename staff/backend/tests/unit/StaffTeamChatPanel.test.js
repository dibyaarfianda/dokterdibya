const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The DOM fixture does not render role-coloured messages; leave the module's
// unrelated static role import outside the VM, exercising the complete widget.
const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/chat-popup.js'), 'utf8')
    .replace(/^import \{ ROLE_IDS \} from '[^']+';\r?\n/, '');

function fixture({ width = 400, height = 800, stored = new Map(), storageFails = false, clinic = false, reduced = false, authenticated = false } = {}) {
    const elements = new Map();
    let releaseHistory;
    const history = new Promise(resolve => { releaseHistory = () => resolve({ ok: true, json: async () => ({ success: true, data: [] }) }); });
    function target() {
        const listeners = new Map();
        return {
            addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
            removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(item => item !== fn)); },
            fire(name, props = {}) {
                const event = { type: name, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true,
                    clientX: 350, clientY: 700, detail: 1, preventDefault() { this.defaultPrevented = true; },
                    stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...props };
                for (const fn of listeners.get(name) || []) { fn(event); if (event.stopped) break; }
                if (name === 'click' && this.id === 'chat-toggle-btn' && !event.defaultPrevented && !event.stopped) win.toggleChatPopup();
                return event;
            }
        };
    }
    function element(id) {
        const values = new Map();
        const classes = new Set();
        const attrs = new Map();
        const style = {
            setProperty(k, v) { values.set(k, String(v)); }, getPropertyValue(k) { return values.get(k) || ''; },
            removeProperty(k) { values.delete(k); }, getPropertyPriority() { return ''; },
            set cssText(v) { if (!v) values.clear(); }, get cssText() { return ''; }
        };
        const el = { ...target(), id, style, textContent: '', value: '', children: [], parentNode: null,
            classList: { add(...names) { names.forEach(n => classes.add(n)); }, remove(...names) { names.forEach(n => classes.delete(n)); },
                contains(n) { return classes.has(n); }, toggle(n, enabled) { if (enabled ?? !classes.has(n)) classes.add(n); else classes.delete(n); } },
            setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.get(k) ?? null; }, removeAttribute(k) { attrs.delete(k); },
            appendChild(child) { child.parentNode = this; this.children.push(child); },
            contains(child) { return child === this || this.children.some(c => c.contains(child)); },
            insertAdjacentHTML() {}, querySelector(selector) { return selector === '.chat-badge' ? elements.get('chat-badge') : null; },
            setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; },
            focus() { doc.activeElement = this; this.fire('focus'); }, blur() { doc.activeElement = doc.body; this.fire('blur'); },
            getBoundingClientRect() {
                if (id === 'chat-toggle-btn') {
                    if (style.getPropertyValue('display') === 'none') return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
                    const frame = elements.get('chat-popup-container').getBoundingClientRect();
                    return { left: frame.left, top: frame.top, width: 50, height: 50, right: frame.left + 50, bottom: frame.top + 50 };
                }
                const w = parseFloat(style.getPropertyValue('width')) || 50;
                const h = parseFloat(style.getPropertyValue('height')) || 50;
                const left = parseFloat(style.getPropertyValue('left')) || (win.innerWidth - 64);
                const top = parseFloat(style.getPropertyValue('top')) || (win.innerHeight - 121);
                return { left, top, width: w, height: h, right: left + w, bottom: top + h };
            }
        };
        elements.set(id, el);
        return el;
    }
    const win = { ...target(), innerWidth: width, innerHeight: height,
        location: { hostname: 'fixture.test', origin: 'https://fixture.test' },
        visualViewport: { ...target(), width, height, offsetLeft: 0, offsetTop: 0 },
        localStorage: { getItem(k) { if (storageFails) throw Error('blocked'); return stored.get(k) || null; },
            setItem(k, v) { if (storageFails) throw Error('blocked'); stored.set(k, v); } },
        getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1', getPropertyValue() { return '0'; } }; },
        matchMedia() { return { matches: reduced }; }, getAuthToken() { return authenticated ? 'fixture' : null; },
        requestAnimationFrame(fn) { return setTimeout(fn, 0); }, cancelAnimationFrame: clearTimeout,
        setTimeout, clearTimeout
    };
    const doc = { ...target(), readyState: 'complete', body: element('body'), head: element('head'),
        documentElement: element('html'), getElementById(id) { return elements.get(id) || null; },
        querySelector(selector) { return selector === '.chat-badge' ? elements.get('chat-badge') : null; },
        createElement(tag) { return element(tag); } };
    doc.activeElement = doc.body;
    if (authenticated) {
        win.auth = { currentUser: { id: 'fixture', name: 'Fixture Staff', role: 'staff' } };
        win.socket = { connected: true, on() {}, off() {}, emit() {} };
    }
    if (clinic) doc.body.classList.add('mobile-app-mode', 'sunday-clinic-embedded-active');
    const container = element('chat-popup-container');
    doc.body.appendChild(container);
    for (const id of ['chat-toggle-btn', 'chat-box', 'chat-badge', 'chat-close-btn', 'chat-clear-btn', 'chat-input', 'chat-send-btn', 'chat-messages', 'online-names']) {
        container.appendChild(element(id));
    }
    elements.get('chat-box').style.setProperty('display', 'none');
    vm.runInNewContext(source, { window: win, document: doc, navigator: { userAgent: '', platform: '', maxTouchPoints: 0 },
        console, MutationObserver: class { observe() {} }, requestAnimationFrame: win.requestAnimationFrame,
        localStorage: win.localStorage, fetch: () => history,
        setTimeout, clearTimeout, atob: value => Buffer.from(value, 'base64').toString() });
    return { win, doc, elements, stored, container, releaseHistory, button: elements.get('chat-toggle-btn'), box: elements.get('chat-box') };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each([false, true])('chat fills the visible viewport, including Sunday Clinic=%s', clinic => {
    const f = fixture({ clinic });
    f.button.fire('click');
    expect(f.container.style.getPropertyValue('width')).toBe('400px');
    expect(f.container.style.getPropertyValue('height')).toBe('800px');
    expect(f.button.style.getPropertyValue('display')).toBe('none');
    f.win.visualViewport.height = 310;
    f.win.visualViewport.offsetTop = 24;
    f.win.visualViewport.fire('resize');
    jest.advanceTimersByTime(1);
    expect(f.container.style.getPropertyValue('top')).toBe('24px');
    expect(f.container.style.getPropertyValue('height')).toBe('310px');
});

test('desktop also fills the entire viewport', () => {
    const f = fixture({ width: 1440, height: 900 });
    f.button.fire('click');
    expect(f.container.style.getPropertyValue('width')).toBe('1440px');
    expect(f.container.style.getPropertyValue('height')).toBe('900px');
});

test.each(['mouse', 'touch'])('drag with %s persists position without opening chat, even after navigation', pointerType => {
    const f = fixture();
    f.button.fire('pointerdown', { pointerType });
    f.button.fire('pointermove', { pointerType, clientX: 80, clientY: 160 });
    f.button.fire('pointerup', { pointerType, clientX: 80, clientY: 160 });
    f.button.fire('click');
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
    expect(f.stored.size).toBe(1);
    const left = f.container.style.getPropertyValue('left');
    f.doc.fire('page:changed');
    jest.advanceTimersByTime(1);
    expect(f.container.style.getPropertyValue('left')).toBe(left);
    const reloaded = fixture({ stored: f.stored });
    expect(reloaded.container.style.getPropertyValue('left')).toBe(left);
});

test('a tap within six pixels still opens chat', () => {
    const f = fixture();
    f.button.fire('pointerdown');
    f.button.fire('pointermove', { clientX: 353, clientY: 704 });
    f.button.fire('pointerup');
    f.button.fire('click');
    expect(f.container.classList.contains('chat-is-open')).toBe(true);
});

test('cancelled drag restores the original position and cannot activate chat', () => {
    const f = fixture();
    const before = f.container.style.getPropertyValue('right');
    f.button.fire('pointerdown');
    f.button.fire('pointermove', { clientX: 100, clientY: 100 });
    f.button.fire('pointercancel');
    f.button.fire('click');
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
    expect(f.container.style.getPropertyValue('right')).toBe(before);
    expect(f.stored.size).toBe(0);
});

test('storage failure does not break drag or close and reopen', () => {
    const f = fixture({ storageFails: true });
    f.button.fire('pointerdown');
    f.button.fire('pointermove', { clientX: -500, clientY: 5000 });
    f.button.fire('pointerup');
    f.button.fire('click');
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
    expect(parseFloat(f.container.style.getPropertyValue('left'))).toBe(8);
    expect(parseFloat(f.container.style.getPropertyValue('top'))).toBe(742);
    f.win.toggleChatPopup();
    f.elements.get('chat-input').value = 'unsent draft';
    f.win.closeChatPopup();
    jest.advanceTimersByTime(250);
    expect(f.doc.body.style.getPropertyValue('overflow')).toBe('');
    f.win.toggleChatPopup();
    expect(f.elements.get('chat-input').value).toBe('unsent draft');
});

test('closing animates for 250ms, restores scroll, and rapid reopen cancels pending close', () => {
    const f = fixture();
    f.doc.body.style.setProperty('overflow', 'auto');
    f.win.toggleChatPopup();
    expect(f.doc.body.style.getPropertyValue('overflow')).toBe('hidden');
    f.win.closeChatPopup();
    expect(f.box.style.getPropertyValue('display')).toBe('flex');
    jest.advanceTimersByTime(200);
    f.win.toggleChatPopup();
    jest.advanceTimersByTime(100);
    expect(f.container.classList.contains('chat-is-open')).toBe(true);
    f.win.closeChatPopup();
    jest.advanceTimersByTime(250);
    expect(f.box.style.getPropertyValue('display')).toBe('none');
    expect(f.doc.body.style.getPropertyValue('overflow')).toBe('auto');
});

test('reduced motion closes immediately', () => {
    const f = fixture({ reduced: true });
    f.win.toggleChatPopup();
    f.win.closeChatPopup();
    expect(f.box.style.getPropertyValue('display')).toBe('none');
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
});

test('rotation keeps a stored icon fully within the new viewport', () => {
    const f = fixture();
    f.button.fire('pointerdown');
    f.button.fire('pointermove', { clientX: 8000, clientY: 8000 });
    f.button.fire('pointerup');
    f.win.innerWidth = f.win.visualViewport.width = 800;
    f.win.innerHeight = f.win.visualViewport.height = 400;
    f.win.fire('resize');
    jest.advanceTimersByTime(1);
    expect(f.container.style.getPropertyValue('left')).toBe('742px');
    expect(f.container.style.getPropertyValue('top')).toBe('342px');
});

test('closing restores the saved edge position using the visible icon size', () => {
    const f = fixture();
    f.button.fire('pointerdown');
    f.button.fire('pointermove', { clientX: 8000, clientY: 8000 });
    f.button.fire('pointerup');
    f.win.toggleChatPopup();
    f.win.closeChatPopup();
    jest.advanceTimersByTime(250);
    expect(f.container.style.getPropertyValue('left')).toBe('342px');
    expect(f.container.style.getPropertyValue('top')).toBe('742px');
});

test('opening while history loads keeps one open state after the authenticated handlers upgrade', async () => {
    const f = fixture({ authenticated: true });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    f.win.toggleChatPopup();
    expect(f.container.classList.contains('chat-is-open')).toBe(true);
    f.releaseHistory();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(typeof f.win.addChatMessage).toBe('function');
    f.win.toggleChatPopup();
    jest.advanceTimersByTime(250);
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
    f.win.toggleChatPopup();
    expect(f.container.classList.contains('chat-is-open')).toBe(true);
    f.win.closeChatPopup();
    jest.advanceTimersByTime(250);
    expect(f.container.classList.contains('chat-is-open')).toBe(false);
});
