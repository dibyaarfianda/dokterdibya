const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/main.js'), 'utf8');
const source = main.slice(main.indexOf('function syncCommunityChatFrameHeight()'), main.indexOf('function bindCommunityChatViewportSync()'));

function layout({ zoom = 0.8, height = 720, top = 56, active = true, present = true, visualViewport = true } = {}) {
    const properties = new Map();
    const page = {
        offsetHeight: 600,
        getBoundingClientRect: () => ({ top, height: 600 * zoom })
    };
    const window = { innerHeight: height, visualViewport: visualViewport ? { height } : null };
    const document = {
        body: { classList: { contains: () => active } },
        getElementById: () => present ? page : null,
        documentElement: { clientHeight: height, style: { setProperty: (key, value) => properties.set(key, value) } }
    };
    const context = vm.createContext({ window, document });
    vm.runInContext(source, context);
    return { context, window, properties };
}

test.each([
    ['desktop at 80 percent', { zoom: 0.8 }, '830px'],
    ['unscaled tablet', { zoom: 1, top: 72 }, '648px'],
    ['short desktop window', { zoom: 0.8, height: 240 }, '230px'],
    ['fallback without visualViewport', { zoom: 0.8, visualViewport: false }, '830px']
])('%s fills the visible space below the page in layout pixels', (_, options, expected) => {
    const { context, properties } = layout(options);
    context.syncCommunityChatFrameHeight();
    expect(properties.get('--staff-community-chat-height')).toBe(expected);
});

test('a viewport resize updates chat height while retaining the desktop scale', () => {
    const { context, window, properties } = layout();
    context.syncCommunityChatFrameHeight();
    expect(properties.get('--staff-community-chat-height')).toBe('830px');
    window.visualViewport.height = 480;
    context.syncCommunityChatFrameHeight();
    expect(properties.get('--staff-community-chat-height')).toBe('530px');
});

test.each([{ active: false }, { present: false }])('inactive or absent chat does not change the layout: %j', options => {
    const { context, properties } = layout(options);
    context.syncCommunityChatFrameHeight();
    expect(properties.size).toBe(0);
});
