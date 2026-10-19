const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.resolve(__dirname, '../../../public/profile-settings.html'), 'utf8');
const load = html.slice(html.indexOf('    // Load profile data'), html.indexOf('    // Display profile picture'));
const submit = html.slice(html.indexOf('    // Handle form submission'), html.indexOf('    // Initialize on page load'));

function fixture({ bioFailure = false, loadFailure = false } = {}) {
    const values = new Map(), elements = new Map(), events = new Map();
    const field = selector => {
        if (!elements.has(selector)) {
            const element = {
                val(value) { if (!arguments.length) return values.get(selector) || ''; values.set(selector, value); return element; },
                text: jest.fn(() => element), prop: jest.fn(() => element),
                on: (event, fn) => { events.set(selector + ':' + event, fn); }
            };
            elements.set(selector, element);
        }
        return elements.get(selector);
    };
    const context = {
        currentUser: null, selectedProfilePicture: null, publicBioLoaded: false, loadedPublicBio: null,
        $: field, getToken: async () => 'staff-test-token', displayProfilePicture: jest.fn(),
        showToast: jest.fn(), isEmailLike: () => false, setTimeout: jest.fn(), console,
        window: { location: {} },
        fetch: jest.fn(async (url, options = {}) => {
            if (url === '/api/auth/me') return { ok: true, json: async () => ({ data: { user: { id: 'S1', name: 'Staf Uji' } } }) };
            if (url === '/api/community-chat/me/profile' && options.method !== 'PUT') return { ok: !loadFailure, json: async () => ({ success: !loadFailure, profile: { bio: 'Bio tersimpan', profileVisible: false } }) };
            return { ok: !(bioFailure && url === '/api/community-chat/me/profile'), json: async () => ({ success: !(bioFailure && url === '/api/community-chat/me/profile'), message: 'Gagal simpan bio' }) };
        })
    };
    vm.createContext(context); vm.runInContext(load + submit, context);
    return { context, values, elements, submit: () => events.get('#profile-form:submit')({ preventDefault() {} }) };
}

test('Profile Settings exposes and loads the existing public bio', async () => {
    expect(/<textarea[^>]*id="profile-bio"[^>]*maxlength="500"/.test(html)).toBe(true);
    const { context, values } = fixture();
    await context.loadProfileData();
    expect(values.get('#profile-bio')).toBe('Bio tersimpan');
});

test('one save action submits the edited bio without changing visibility or nickname', async () => {
    const { context, values, submit } = fixture();
    await context.loadProfileData();
    values.set('#profile-bio', 'Bio baru\nBaris kedua');
    await submit();
    const request = context.fetch.mock.calls.find(([url, options]) => url === '/api/community-chat/me/profile' && options?.method === 'PUT');
    expect(request).toBeDefined();
    expect(JSON.parse(request[1].body)).toEqual({ bio: 'Bio baru\nBaris kedua' });
    expect(context.showToast).toHaveBeenCalledWith('Profil berhasil diperbarui!', 'success');
});

test('a failed bio save preserves the entered text and does not report success', async () => {
    const { context, values, submit } = fixture({ bioFailure: true });
    await context.loadProfileData(); values.set('#profile-bio', 'Draft bio');
    await submit();
    expect(values.get('#profile-bio')).toBe('Draft bio');
    expect(context.showToast).not.toHaveBeenCalledWith('Profil berhasil diperbarui!', 'success');
    expect(context.showToast.mock.calls.some(([, type]) => type === 'error')).toBe(true);
});

test('failed initial bio load never overwrites the stored bio while saving other profile fields', async () => {
    const { context, submit } = fixture({ loadFailure: true });
    await context.loadProfileData(); await submit();
    expect(context.fetch.mock.calls.some(([url, options]) => url === '/api/community-chat/me/profile' && options?.method === 'PUT')).toBe(false);
});
