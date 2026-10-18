const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../..');
const helperPath = path.join(root, 'public/scripts/date-time-format.js');
const display = fs.existsSync(helperPath) ? require(helperPath) : {};
const { execFileSync } = require('child_process');
const vm = require('vm');

describe('shared staff and patient display dates', () => {
    test('patient history imports the API helper needed to load dated records', () => {
        const source = fs.readFileSync(path.join(root, 'public/riwayat-kunjungan.html'), 'utf8');
        const names = source.match(/import \{([^}]+)\} from '\/scripts\/patient-utils.js'/)[1].split(',').map(name => name.trim());
        expect(names).toContain('apiRequest');
    });
    test('dashboard graph labels and tooltips use DD-MM-YYYY', () => {
        const source = fs.readFileSync(path.join(root, 'staff/public/scripts/dashboard.js'), 'utf8');
        const chart = source.match(/function renderVisitsChart\(dailyData\) \{[\s\S]*?\n\}/)[0];
        const container = { innerHTML: '' };
        const context = { DibyaDateTime: display, document: { getElementById: () => container } };
        vm.createContext(context);
        vm.runInContext(chart, context);
        context.renderVisitsChart([{ date: '2026-10-18', label: '18 Oktober 2026', fullLabel: '18 Oktober 2026', count: 23 }]);
        expect(container.innerHTML).toContain('18-10-2026');
        expect(container.innerHTML).not.toContain('Oktober');
    });
    test('calendar dates always show DD-MM-YYYY, including leap days', () => {
        expect(typeof display.date).toBe('function');
        expect(display.date('2026-10-18')).toBe('18-10-2026');
        expect(display.date('2024-02-29')).toBe('29-02-2024');
        expect(display.date('2026-02-29')).toBe('-');
        expect(display.date(null)).toBe('-');
        expect(display.date('bad')).toBe('-');
    });

    test('timestamps use WIB, 24 hours and colon separators, including midnight', () => {
        expect(typeof display.dateTime).toBe('function');
        expect(display.dateTime('2026-10-17T17:05:09Z')).toBe('18-10-2026 00:05');
        expect(display.time('2026-10-18T06:07:09Z')).toBe('13:07');
        expect(display.time('2026-10-18 23:09:08', { second: '2-digit' })).toBe('23:09:08');
        expect(display.time('23:09:08')).toBe('23:09');
        expect(display.time('24:09')).toBe('-');
    });

    test('weekday and month headings stay labels; actual dates include the year', () => {
        expect(typeof display.date).toBe('function');
        expect(display.date('2026-10-18', { weekday: 'long' })).toBe('Minggu');
        expect(display.date('2026-10-18', { month: 'long', year: 'numeric' })).toBe('Oktober 2026');
        expect(display.date('2026-10-18', { day: 'numeric', month: 'short' })).toBe('18-10-2026');
        expect(display.date('2026-10-18', { weekday: 'long', day: 'numeric' })).toBe('Minggu, 18-10-2026');
    });

    test('input conversion validates real dates and preserves machine values', () => {
        expect(typeof display.toInputValue).toBe('function');
        expect(display.toInputValue('18-10-2026', 'date')).toBe('2026-10-18');
        expect(display.toInputValue('31-02-2026', 'date')).toBeNull();
        expect(display.toInputValue('', 'date')).toBe('');
        expect(display.toInputValue('13:05', 'time')).toBe('13:05');
        expect(display.toInputValue('01:05 PM', 'time')).toBeNull();
        expect(display.toInputValue('18-10-2026 13:05', 'datetime-local')).toBe('2026-10-18T13:05');
    });

    test.each(['Asia/Makassar', 'Asia/Jayapura', 'Asia/Tokyo', 'America/Los_Angeles'])('patient dates preserve the calendar day in %s', timezone => {
        const script = `
            const fs = require('fs'), vm = require('vm');
            const source = fs.readFileSync(${JSON.stringify(path.join(root, 'public/scripts/patient-utils.js'))}, 'utf8');
            const context = { DibyaDateTime: require(${JSON.stringify(helperPath)}) };
            vm.createContext(context);
            for (const name of ['parseDateOnlyLocal','formatDate','formatDateTime']) {
                const start = source.indexOf('function ' + name + '(');
                const body = source.slice(start, source.indexOf(String.fromCharCode(10) + '}', start) + 2);
                vm.runInContext(body, context);
            }
            process.stdout.write(context.formatDate('2026-10-18') + '|' + context.formatDateTime('2026-10-18T13:05:00+07:00'));
        `;
        const result = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
        expect(result).toBe('18-10-2026|18-10-2026 13:05');
    });

    test('staff and portal serve the identical formatter', () => {
        expect(fs.existsSync(helperPath)).toBe(true);
        expect(fs.readFileSync(path.join(root, 'staff/public/scripts/date-time-format.js'), 'utf8'))
            .toBe(fs.readFileSync(helperPath, 'utf8'));
    });

    test('every web page loads the formatter and date input adapter before page code', () => {
        const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
            const target = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(target) : /\.(html|js)$/.test(target) ? [target] : [];
        });
        const files = [...walk(path.join(root, 'public')), ...walk(path.join(root, 'staff/public'))];
        const missing = [], localFormats = [];
        for (const file of files) {
            if (/\.min\.js$|jquery|bootstrap|date-time-format\.js$/.test(file)) continue;
            const source = fs.readFileSync(file, 'utf8');
            if (file.endsWith('.html') && /<head\b/i.test(source)) {
                if (!source.includes('date-time-format.js?v=') || !source.includes('date-time-inputs.js?v=')) missing.push(path.relative(root, file));
            }
            if (/\.toLocale(?:Date|Time)String\(|\.toLocaleString\([^)]*(?:timeZone|hour:|minute:|dateStyle|timeStyle)|\bnew Date\([^\n;]+?\)\.toLocaleString\(/.test(source)) localFormats.push(path.relative(root, file));
        }
        expect(missing).toEqual([]);
        expect(localFormats).toEqual([]);
        expect(fs.readFileSync(path.join(root, 'staff/public/scripts/date-time-inputs.js'), 'utf8'))
            .toBe(fs.readFileSync(path.join(root, 'public/scripts/date-time-inputs.js'), 'utf8'));
    });
});
