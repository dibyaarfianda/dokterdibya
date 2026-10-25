const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');
const filename = path.join(root, 'public/scripts/patient-community-chat.js');

function setup({ token = 'patient-session', mobile = true, demo = false, nested = false, homeGuard = false } = {}) {
    const nodes = new Map(), listeners = new Map(), tasks = [];
    let focused = null;
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = [];
            this.attrs = {}; this.events = {}; this.hidden = false; this.open = false;
            this.classes = new Set(); this.classList = {
                add: name => this.classes.add(name), remove: name => this.classes.delete(name),
                contains: name => this.classes.has(name)
            };
            this.style = { setProperty: (name, value) => { this.style[name] = value; } };
        }
        set id(value) { this._id = value; nodes.set(value, this); }
        get id() { return this._id; }
        set innerHTML(value) {
            this.html = value;
            for (const match of value.matchAll(/<(\w+)[^>]*id="([^"]+)"[^>]*>/g)) {
                const child = new Element(match[1]); child.id = match[2]; this.children.push(child);
            }
        }
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
        setAttribute(key, value) { this.attrs[key] = String(value); }
        getAttribute(key) { return this.attrs[key] ?? null; }
        removeAttribute(key) { delete this.attrs[key]; }
        addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
        removeEventListener() {}
        querySelector(selector) { return nodes.get(selector.replace('#', '')); }
        showModal() { this.open = true; }
        close() { this.open = false; }
        focus() { focused = this; }
        remove() { nodes.delete(this.id); }
        contains(target) { return this === target || this.children.includes(target); }
    }
    const body = new Element('body'); body.style.overflow = 'auto';
    const media = { matches: mobile, addEventListener: (_, fn) => { media.change = fn; }, removeEventListener() {} };
    const history = { state: { patientHomeBackGuard: true }, back: jest.fn(),
        pushState(value) { this.state = value; } };
    const window = {
        location: { origin: 'https://sisiwanita.id', href: 'https://sisiwanita.id/patient-menu.html', pathname: '/patient-menu.html' },
        PatientSession: { getToken: () => token, isDemoMode: () => demo },
        matchMedia: () => media, innerHeight: 844, innerWidth: 390, history,
        visualViewport: { height: 844, offsetTop: 0, offsetLeft: 0, width: 390, addEventListener() {}, removeEventListener() {} },
        addEventListener(name, fn) { (listeners.get(name) || listeners.set(name, []).get(name)).push(fn); },
        removeEventListener() {}, dispatchEvent() {},
        setTimeout: fn => { tasks.push(fn); return tasks.length; }, clearTimeout() {}
    };
    window.parent = nested ? {} : window; window.top = window;
    const document = {
        body, head: new Element('head'), activeElement: new Element('button'),
        createElement: tag => new Element(tag), getElementById: id => nodes.get(id) || null,
        addEventListener() {}, removeEventListener() {},
        documentElement: new Element('html'), querySelector: () => null
    };
    const badgeOptions = [];
    const context = { window, document, history, URL, Event, console,
        startCommunityBadge: options => { badgeOptions.push(options); return () => {}; },
        requestAnimationFrame: fn => { fn(); return 1; },
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.createContext(context);
    if (homeGuard) {
        const exit = new Element(); exit.id = 'exit-app-modal';
        const overlay = new Element(); overlay.id = 'modal-overlay';
        const exitSource = fs.readFileSync(path.join(root, 'public/scripts/patient-shell/exit-controller.js'), 'utf8').replace(/export /g, '');
        vm.runInContext(exitSource + '\ncreatePatientExitController({isHomeRoute:()=>true,closeSheet(){},closeAllModals(){},stopEvent(){}}).install();', context);
    }
    const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') : '';
    vm.runInContext(source, context);
    expect(typeof context.mountPatientCommunityChat).toBe('function');
    const controller = context.mountPatientCommunityChat();
    return { controller, nodes, window, document, history, media, badgeOptions,
        flush: () => tasks.splice(0).forEach(fn => fn()),
        emit: (name, event = {}) => (listeners.get(name) || []).forEach(fn => fn(event)),
        setToken: value => { token = value; }, focused: () => focused };
}

test('does not load a chat iframe until opened, then reuses it to keep the draft', () => {
    const app = setup();
    expect(app.nodes.get('patient-community-frame')).toBeUndefined();
    app.controller.open();
    const frame = app.nodes.get('patient-community-frame');
    expect(frame.src).toContain('/community-chat.html?embed=patient');
    expect(frame.dataset.communityChatVisible).toBe('true');
    app.controller.close(); app.flush();
    expect(frame.dataset.communityChatVisible).toBe('false');
    app.emit('popstate', { state: {}, stopImmediatePropagation() {} });
    app.controller.open();
    expect(app.nodes.get('patient-community-frame')).toBe(frame);
});

test('close restores page scrolling and focus and removes modal presentation', () => {
    const app = setup();
    app.controller.open();
    expect(app.document.body.style.overflow).toBe('hidden');
    expect(app.nodes.get('patient-community-panel').open).toBe(true);
    app.controller.close(); app.flush();
    expect(app.document.body.style.overflow).toBe('auto');
    expect(app.nodes.get('patient-community-panel').open).toBe(false);
    expect(app.focused()).toBe(app.nodes.get('patient-community-launcher'));
});

test('Back closes only the panel without triggering the home exit guard', () => {
    const app = setup(); app.controller.open();
    const stopImmediatePropagation = jest.fn();
    app.emit('popstate', { state: { patientHomeBackGuard: true }, stopImmediatePropagation });
    app.flush();
    expect(stopImmediatePropagation).toHaveBeenCalled();
    expect(app.nodes.get('patient-community-panel').open).toBe(false);
    expect(app.history.back).not.toHaveBeenCalled();
});

test('an already-installed home Back guard yields to the chat history entry', () => {
    const app = setup({ homeGuard: true }); app.controller.open();
    app.emit('popstate', { state: { patientHomeBackGuard: true }, stopImmediatePropagation() {} });
    app.flush();
    expect(app.nodes.get('exit-app-modal').classList.contains('active')).toBe(false);
    expect(app.nodes.get('patient-community-panel').open).toBe(false);
});

test('accepts close messages only from its own same-origin iframe', () => {
    const app = setup(); app.controller.open();
    const frame = app.nodes.get('patient-community-frame'); frame.contentWindow = {};
    const data = { type: 'PATIENT_COMMUNITY_CHAT_CLOSE' };
    app.emit('message', { origin: 'https://evil.example', source: frame.contentWindow, data });
    app.emit('message', { origin: app.window.location.origin, source: {}, data });
    expect(frame.dataset.communityChatVisible).toBe('true');
    app.emit('message', { origin: app.window.location.origin, source: frame.contentWindow, data });
    expect(frame.dataset.communityChatVisible).toBe('false');
});

test('an initialization-abort close resets the iframe so nickname completion can retry', () => {
    const app = setup(); app.controller.open();
    const frame = app.nodes.get('patient-community-frame'); frame.contentWindow = {};
    app.emit('message', { origin: app.window.location.origin, source: frame.contentWindow, data: { type: 'PATIENT_COMMUNITY_CHAT_CLOSE', reset: true } });
    app.flush();
    expect(app.nodes.get('patient-community-frame')).toBeUndefined();
    app.emit('popstate', { state: {}, stopImmediatePropagation() {} });
    app.controller.open();
    expect(app.nodes.get('patient-community-frame')).not.toBe(frame);
});

test('viewport follows the visible keyboard height without a guessed bottom gap', () => {
    const app = setup(); app.window.visualViewport.height = 430;
    app.controller.open();
    expect(app.nodes.get('patient-community-panel').style['--patient-chat-height']).toBe('430px');
});

test.each([{ token: null }, { demo: true }, { nested: true }])('does not mount for an unavailable patient session: %p', options => {
    const app = setup(options);
    expect(app.nodes.get('patient-community-launcher')).toBeUndefined();
});

test('desktop leaves navigation alone and does not open a mobile panel', () => {
    const app = setup({ mobile: false });
    expect(app.controller.open()).toBe(false);
    expect(app.nodes.get('patient-community-frame')).toBeUndefined();
});

test('logging out closes the panel and discards the authenticated iframe', () => {
    const app = setup(); app.controller.open(); app.setToken(null);
    app.emit('auth:credentials-changed'); app.flush();
    expect(app.nodes.get('patient-community-frame')).toBeUndefined();
    expect(app.nodes.get('patient-community-panel').open).toBe(false);
});

test.each([
    [true, 'false', false, false],
    [true, 'true', false, true],
    [false, 'false', false, true],
    [true, 'true', true, false]
])('chat read/poll visibility respects embed=%s, visible=%s, documentHidden=%s', (embed, visible, hidden, expected) => {
    const html = fs.readFileSync(path.join(root, 'public/community-chat.html'), 'utf8');
    const source = html.slice(html.indexOf('    function isCommunityChatVisible()'), html.indexOf('    function scheduleRead()'));
    const context = { isPatientEmbed: embed, document: { hidden }, window: { frameElement: { dataset: { communityChatVisible: visible } } } };
    vm.createContext(context); vm.runInContext(source, context);
    expect(context.isCommunityChatVisible()).toBe(expected);
});

test('opening a patient profile uses replacement navigation to keep Back owned by the panel', () => {
    const html = fs.readFileSync(path.join(root, 'public/community-chat.html'), 'utf8');
    const source = html.slice(html.indexOf('    function bindPatientEmbedProfileLink('), html.indexOf('    function buildMessageNode('));
    const context = { isPatientEmbed: true, URL, window: { location: { replace: jest.fn() } } };
    vm.createContext(context); vm.runInContext(source, context);
    expect(typeof context.bindPatientEmbedProfileLink).toBe('function');
    let click;
    const link = { href: 'https://sisiwanita.id/community-profile.html?userType=patient&userId=example', addEventListener: (_, fn) => { click = fn; } };
    context.bindPatientEmbedProfileLink(link);
    const event = { preventDefault: jest.fn() }; click(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(context.window.location.replace).toHaveBeenCalledWith('https://sisiwanita.id/community-profile.html?userType=patient&userId=example&embed=patient');
});

test('onboarding does not load a community launcher even with an authenticated token', () => {
    const callbacks = [];
    const storage = { getItem: key => key === 'vps_auth_token' ? 'patient-token' : null };
    const loadModule = jest.fn(() => Promise.resolve({ mountPatientCommunityChat() {} }));
    const window = { location: { pathname: '/patient-intake.html' }, localStorage: storage, sessionStorage: storage,
        addEventListener() {}, document: { readyState: 'loading', addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') callbacks.push(fn); }, head: { appendChild() {} }, createElement: () => ({}) } };
    window.parent = window;
    const source = fs.readFileSync(path.join(root, 'public/scripts/patient-session.js'), 'utf8').replace(/import\('\/scripts\/patient-community-chat\.js\?v=[^']+'\)/, 'loadModule()');
    vm.runInNewContext(source, { window, loadModule, console });
    callbacks.forEach(fn => fn());
    expect(loadModule).not.toHaveBeenCalled();
});
