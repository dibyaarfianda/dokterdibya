(function () {
    'use strict';
    const { TRIMESTERS, calculateEstimate } = window.CostEstimateEngine;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    const money = value => value == null ? 'Belum lengkap' : 'Rp ' + Number(value).toLocaleString('id-ID');
    const seenKey = 'cost-estimate-preview-guide-v1';
    function create(container, shell) {
        let data = null, scenario = { trimester: 'all', repeats: {}, services: {} }, helpShown = false;
        function render() {
            if (!data) return;
            const result = calculateEstimate(data, scenario);
            container.innerHTML = '<div class="estimate-banner">' + (data.is_dummy ? 'Data Dummy — bukan tarif klinik' : 'Pratinjau pasien — belum diterbitkan') + '</div>' +
                '<div class="estimate-toolbar"><label>Periode estimasi<select class="estimate-input" data-estimate="trimester">' +
                ['all', ...TRIMESTERS].map((key, i) => '<option value="' + key + '"' + (scenario.trimester === key ? ' selected' : '') + '>' + (i ? 'Trimester ' + i : 'Semua trimester') + '</option>').join('') +
                '</select></label><button type="button" class="estimate-button" data-estimate="help"><i class="fa-regular fa-circle-question"></i> Cara Menggunakan</button></div>' +
                '<p class="estimate-note">Harga dimuat: ' + esc(new Date(data.prices_loaded_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })) + ' WIB. Pengulangan dapat diubah untuk simulasi.</p>' +
                '<p class="estimate-note"><strong>USG Transvaginal</strong> hanya dilakukan 1 kali bila usia kehamilan di bawah 8 minggu.</p>' +
                TRIMESTERS.filter(key => scenario.trimester === 'all' || key === scenario.trimester).map(key => {
                    const phase = result.trimesters[key];
                    return '<section class="section estimate-phase"><div class="tool-panel"><div class="estimate-heading"><h3>Trimester ' + (TRIMESTERS.indexOf(key) + 1) + '</h3>' +
                        '<label class="estimate-repeat">Pengulangan resep<input class="estimate-input" type="number" min="0" step="1" data-estimate="repeat" data-key="' + key + '" value="' + esc(phase.repeats) + '"></label></div>' +
                        '<p class="estimate-note estimate-control-schedule"><strong>Jadwal kontrol:</strong> ' + (key === 't3' ? 'setiap 2 minggu sekali.' : 'setiap 1 bulan sekali.') + '</p>' +
                        (phase.issues.length ? '<div class="estimate-warning" role="status">' + phase.issues.map(esc).join('<br>') + '</div>' : '') +
                        phase.items.map(item => '<div class="estimate-item"><div class="estimate-item-top"><strong>' + esc(item.label) + '</strong><strong class="estimate-price">' + money(item.subtotal) + '</strong></div>' +
                            '<div class="estimate-item-detail"><span>' + (item.kind === 'medication' ? 'Obat / suplemen' : 'Layanan / pemeriksaan') + '<br>' +
                            esc(item.quantity) + ' ' + esc(item.unit) + ' × ' + money(item.price) + ' × ' + esc(item.repeats) + ' pengulangan</span>' +
                            (item.kind === 'service' ? '<label class="estimate-repeat">Pengulangan<input class="estimate-input" type="number" min="0" step="1" data-estimate="service" data-key="' + item.key + '" value="' + esc(item.repeats) + '"></label>' : '') + '</div></div>').join('') +
                        '<div class="estimate-summary"><div><span>Subtotal obat / suplemen</span><strong>' + money(phase.medication_total) + '</strong></div><div><span>Subtotal layanan</span><strong>' + money(phase.service_total) + '</strong></div><div class="estimate-phase-total"><span>Total trimester</span><strong>' + money(phase.total) + '</strong></div></div></div></section>';
                }).join('') +
                (!result.ready ? '<div class="estimate-warning">Total belum tersedia. Lengkapi konfigurasi atau periksa angka pengulangan pada periode yang dipilih.</div>' : '') +
                '<div class="estimate-grand"><p>Total estimasi · ' + (scenario.trimester === 'all' ? 'semua trimester' : 'trimester ' + scenario.trimester.slice(1)) + '</p><strong id="estimate-total">' + money(result.total) + '</strong></div>' +
                '<p class="estimate-note">Perkiraan ini hanya mencakup item yang tercantum, bukan tagihan atau instruksi pengobatan. Jumlah pengulangan bukan rekomendasi jadwal kontrol. Biaya persalinan dan item yang tidak tercantum belum termasuk. Nama item adalah label yang ditentukan klinik.</p>';
        }
        function help() {
            const previous = document.activeElement;
            shell.openModal('Cara Menggunakan', 'Estimasi biaya', '<div class="estimate-help"><ol>' +
                '<li><strong>Pilih trimester.</strong><br>Lihat satu trimester atau seluruh periode yang sudah dikonfigurasi.</li>' +
                '<li><strong>Atur pengulangan.</strong><br>Resep dan setiap layanan memiliki pengulangan terpisah. Isi 0 untuk tidak memasukkannya dalam simulasi.</li>' +
                '<li><strong>Baca rincian.</strong><br>Jumlah × harga satuan × pengulangan menghasilkan subtotal. Nama item merupakan label yang ditentukan klinik.</li>' +
                '<li><strong>Pahami batasnya.</strong><br>Ini perkiraan biaya, bukan tagihan atau petunjuk minum obat. Nilai akhir mengikuti pelayanan dan harga yang berlaku.</li></ol>' +
                '<button class="estimate-button primary" id="estimate-help-done" type="button">Mengerti</button></div>');
            const modal = document.getElementById('shell-modal'), close = document.getElementById('shell-modal-close');
            const done = document.getElementById('estimate-help-done');
            const finish = () => { shell.closeModal(); previous?.focus(); };
            done.onclick = finish;
            close.addEventListener('click', () => previous?.focus(), { once: true });
            const keydown = event => {
                if (!modal.classList.contains('active')) { modal.removeEventListener('keydown', keydown); return; }
                if (event.key === 'Escape') { event.preventDefault(); finish(); modal.removeEventListener('keydown', keydown); }
                if (event.key === 'Tab') {
                    if (event.shiftKey && document.activeElement === close) { event.preventDefault(); done.focus(); }
                    else if (!event.shiftKey && document.activeElement === done) { event.preventDefault(); close.focus(); }
                }
            };
            modal.addEventListener('keydown', keydown); close.focus();
            helpShown = true;
            try { sessionStorage.setItem(seenKey, '1'); } catch (_) {}
        }
        container.addEventListener('click', event => { if (event.target.closest('[data-estimate="help"]')) help(); });
        container.addEventListener('change', event => {
            const target = event.target, type = target.dataset.estimate;
            if (!type || type === 'help') return;
            if (type === 'trimester') scenario.trimester = target.value;
            else {
                (type === 'repeat' ? scenario.repeats : scenario.services)[target.dataset.key] = target.value === '' ? null : Number(target.value);
            }
            render();
            const replacement = container.querySelector('[data-estimate="' + type + '"]' + (target.dataset.key ? '[data-key="' + target.dataset.key + '"]' : ''));
            replacement?.focus();
        });
        return {
            setData(value) {
                data = value; scenario = { trimester: 'all', repeats: {}, services: {} }; render();
                let seen = false; try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) {}
                if (!helpShown && !seen) help();
            },
            unavailable(message) { data = null; container.innerHTML = '<div class="estimate-warning" role="status">' + esc(message) + '</div>'; },
            help
        };
    }
    window.CostEstimateView = { create };
})();
