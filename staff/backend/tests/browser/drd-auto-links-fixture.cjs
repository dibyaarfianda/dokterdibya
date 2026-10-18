// Run with Node, then open http://127.0.0.1:8786 in the Codex in-app browser.
// All data is local; this fixture performs no clinical or financial writes.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const app = express();
const publicRoot = path.resolve(__dirname, '../../../public');

app.get('/closing-fixture.js', (_req, res) => {
    const source = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/components/shared/closing.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/^export default /m, 'const closingDefault = ')
        .replace(/^export /gm, '');
    res.type('js').send(`${source}\nwindow.renderClosingFixture = renderPreview;`);
});
app.use('/staff/public', express.static(publicRoot));
app.get('/', (_req, res) => res.type('html').send(String.raw`<!doctype html>
<html lang="id"><meta charset="utf-8"><title>Uji tautan DRD otomatis</title>
<link rel="stylesheet" href="/staff/public/styles/staff-shell.css">
<style>body{font:16px Arial;padding:24px;max-width:1000px;margin:auto}li{margin:8px 0}#results{white-space:pre-wrap;padding:16px;background:#edf3f9}input,textarea{display:block;margin:8px 0}</style>
<h1>Uji tautan DRD otomatis</h1><p>Fixture lokal, tanpa data pasien produksi.</p>
<pre id="results" role="status">Menjalankan pengujian...</pre>
<div id="initial">Kontrol DRD0858, drd0042 / DRD12345. Tagihan DRD0858-T01.</div>
<div id="invalid">XDRD0858 DRD0858X _DRD0858 DRD123 DRD0858_ éDRD0858 DRD0858é</div>
<div id="protected"><a href="#original">DRD0858</a><button>DRD0858</button><label>DRD0858</label>
<input value="DRD0858"><textarea>DRD0858</textarea><select><option>DRD0858</option></select>
<div contenteditable="true"><span>DRD0858</span></div><span role="button">DRD0858</span>
<div onclick="void 0"><span>DRD0858</span></div><div data-no-drd-link>DRD0858</div></div>
<div id="dynamic"></div><div id="changed">Menunggu data</div>
<div id="sunday-clinic-closing-subtitle"></div><div id="sunday-clinic-closing-content"></div>
<button id="btn-submit-sunday-clinic-closing">Closing</button><div id="sunday-clinic-closing-footer-status"></div>
<script src="/staff/public/scripts/date-time-format.js"></script>
<script src="/closing-fixture.js"></script>
<script>
// Same canonical route contract as the Staff shell, including mobile context.
window.buildSundayClinicAppUrl = (mr, section) => '/staff/public/index-adminlte.html?page=sunday-clinic&mr=' + encodeURIComponent(mr.toLowerCase()) + '&section=' + section + '&mobile=1';
</script>
<script src="/staff/public/scripts/shell/drd-links.js"></script>
<script>
(async () => {
    const results = [];
    const pause = () => new Promise(resolve => setTimeout(resolve, 80));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    async function test(name, run) {
        try { await run(); results.push('PASS ' + name); }
        catch (error) { results.push('FAIL ' + name + ': ' + error.message); }
    }
    await pause();
    await test('initial text, multiple DRDs, lowercase, long IDs and invoice suffix', () => {
        const links = [...document.querySelectorAll('#initial a')];
        assert(links.map(link => link.textContent).join(',') === 'DRD0858,drd0042,DRD12345,DRD0858', 'expected four DRD links');
        assert(document.querySelector('#initial').textContent === 'Kontrol DRD0858, drd0042 / DRD12345. Tagihan DRD0858-T01.', 'text must stay unchanged');
        assert(links[0].getAttribute('href') === '/staff/public/index-adminlte.html?page=sunday-clinic&mr=drd0858&section=identitas&mobile=1', 'wrong visit URL or missing mobile context');
    });
    await test('invalid and embedded identifiers stay plain text', () => {
        assert(!document.querySelector('#invalid a'), 'invalid identifier linked');
    });
    await test('forms, editors, buttons and existing actions stay unchanged', () => {
        assert(document.querySelectorAll('#protected a').length === 1, 'interactive content changed');
        assert(document.querySelector('#protected a').getAttribute('href') === '#original', 'existing link replaced');
        assert(document.querySelector('#protected textarea').value === 'DRD0858', 'draft changed');
    });
    await test('new HTML, modal and chat content becomes clickable', async () => {
        document.querySelector('#dynamic').innerHTML = '<div class="modal"><p>Chat: DRD0012 dan DRD0013</p></div>';
        await pause();
        assert(document.querySelectorAll('#dynamic a').length === 2, 'dynamic links missing');
    });
    await test('characterData updates become clickable', async () => {
        document.querySelector('#changed').firstChild.data = 'Hasil DRD0014';
        await pause();
        assert(document.querySelector('#changed a')?.textContent === 'DRD0014', 'updated text not linked');
    });
    await test('closing unpaid blockers and transaction DRDs link to the exact visit', async () => {
        window.renderClosingFixture({ clinic_date: '2026-10-18', can_close: false, summary: {},
            blockers: [{message: 'Tagihan utama DRD0858 belum lunas.'}, {message: 'Tagihan tambahan DRD0858-T01 belum lunas.'}],
            transactions: [{mr_id: 'DRD0042', patient_id: 'fixture', patient_name: 'Pasien Fixture', items: []}]
        });
        await pause();
        const links = [...document.querySelectorAll('#sunday-clinic-closing-content .sc-closing-issues a')];
        assert(links.length === 2, 'unpaid closing DRDs not clickable');
        assert(links.every(link => new URL(link.href).searchParams.get('mr') === 'drd0858'), 'invoice suffix used as visit ID');
        assert(document.querySelector('#btn-submit-sunday-clinic-closing').disabled, 'closing payment guard changed');
        assert(document.querySelector('#sunday-clinic-closing-content .sc-closing-table a')?.textContent === 'DRD0042', 'transaction DRD not clickable');
    });
    await test('text escaping survives linkification', async () => {
        const element = document.createElement('p');
        element.id = 'escaped';
        element.textContent = '<img src=x onerror=alert(1)> DRD0050';
        document.querySelector('#dynamic').append(element);
        await pause();
        assert(!element.querySelector('img'), 'text was parsed as HTML');
        assert(element.querySelector('a')?.textContent === 'DRD0050', 'safe text not linked');
    });
    await test('fallback route works before the main module is available', async () => {
        delete window.buildSundayClinicAppUrl;
        window.buildMobileUrl = url => url + '&mobile=1';
        const element = document.createElement('p'); element.textContent = 'DRD0051';
        document.querySelector('#dynamic').append(element);
        await pause();
        assert(element.querySelector('a')?.getAttribute('href') === '/staff/public/index-adminlte.html?page=sunday-clinic&mr=drd0051&section=identitas&mobile=1', 'fallback route is wrong');
    });
    await test('repeated initialization does not nest or duplicate links', async () => {
        const before = document.querySelectorAll('a').length;
        await new Promise(resolve => { const script = document.createElement('script'); script.src = '/staff/public/scripts/shell/drd-links.js'; script.onload = script.onerror = resolve; document.head.append(script); });
        await pause();
        assert(document.querySelectorAll('a').length === before && !document.querySelector('a a'), 'duplicate links');
    });
    const failed = results.filter(result => result.startsWith('FAIL')).length;
    document.querySelector('#results').textContent = results.join('\n') + '\n\n' + (results.length - failed) + '/' + results.length + ' passed';
    document.title = (failed ? 'FAIL' : 'PASS') + ' — Uji tautan DRD';
})();
</script></html>`));
app.listen(8786, '127.0.0.1', () => console.log('DRD link fixture: http://127.0.0.1:8786'));
