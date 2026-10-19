const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../../../public/community-chat.html'), 'utf8');
const deviceSettings = html.slice(html.indexOf('    const useNewDesignTheme'), html.indexOf('    let socket'));
const update = html.slice(html.indexOf('    function updateMobileBottomOffset()'), html.indexOf('    function initMobileViewportGuard()'));

function viewport({ android = true, standalone = false, webView = false, embed = false, height = 844, visualHeight = 844 } = {}) {
    const properties = new Map([['--mobile-bottom-offset', html.match(/--mobile-bottom-offset:\s*([^;]+);/)[1]]]);
    const context = {
        isStaffEmbed: embed, forceNewTheme: false, forceLegacyTheme: false,
        navigator: { userAgent: android ? `Mozilla/5.0 (Linux; Android 14${webView ? '; wv' : ''}) Chrome/130.0` : 'Mozilla/5.0 iPhone' },
        window: { innerHeight: height, visualViewport: visualHeight == null ? null : { height: visualHeight },
            matchMedia: () => ({ matches: standalone }), navigator: {} },
        document: { documentElement: { style: { setProperty: (name, value) => properties.set(name, value) } } }
    };
    vm.createContext(context);
    vm.runInContext(deviceSettings + update, context);
    return { context, properties };
}

test.each([
    ['Android PWA', { standalone: true }],
    ['Android WebView', { webView: true }],
    ['Android browser', {}],
    ['iOS browser', { android: false }],
    ['Staff embed', { embed: true, standalone: true }],
    ['keyboard visible', { standalone: true, visualHeight: 480 }],
    ['no visualViewport API', { standalone: true, visualHeight: null }]
])('%s keeps the composer at the viewport bottom without a guessed navigation-bar gap', (_, options) => {
    const { context, properties } = viewport(options);
    context.updateMobileBottomOffset();
    expect(properties.get('--mobile-bottom-offset')).toBe('0px');
    expect(properties.get('--app-height')).toBe(`${options.visualHeight ?? 844}px`);
});

test('keyboard open and close follows the available height without restoring a bottom gap', () => {
    const { context, properties } = viewport({ standalone: true });
    for (const height of [844, 480, 844]) {
        context.window.visualViewport.height = height;
        context.updateMobileBottomOffset();
        expect(properties.get('--app-height')).toBe(`${height}px`);
        expect(properties.get('--mobile-bottom-offset')).toBe('0px');
    }
});
