(function () {
    'use strict';
    const { TRIMESTERS, calculateEstimate } = window.CostEstimateEngine;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    const money = (value, pending = false) => value == null ? (pending ? 'Belum dihitung' : 'Belum lengkap') : 'Rp ' + Number(value).toLocaleString('id-ID');
    const seenKey = 'cost-estimate-preview-guide-v1';
    const serviceGuidance = {
        t1: 'Trimester 1 pemeriksaan 1 kali USG bawah (TVS) dan 2 kali USG perut',
        t2: 'Trimester 2 pemeriksaan 1 kali Skrining Kelainan Janin, 2 kali USG perut',
        t3: 'Trimester 3 pemeriksaan 1 kali USG 4 Dimensi, 4-5 kali USG perut'
    };
    const initialScenario = data => ({
        trimester: 't1',
        repeats: Object.fromEntries(TRIMESTERS.map(key => [key, null])),
        services: Object.fromEntries(TRIMESTERS.flatMap(key => (data?.trimesters[key]?.items || [])
            .filter(item => item.kind === 'service').map(item => [item.key, null])))
    });
    function create(container, shell) {
        let data = null, scenario = initialScenario(), helpShown = false;
        function render() {
            if (!data) return;
            const result = calculateEstimate(data, scenario);
            const missingRepeat = key => scenario.repeats[key] == null;
            const missingServices = key => data.trimesters[key].items.some(item => item.kind === 'service' && scenario.services[item.key] == null);
            const selectedKeys = TRIMESTERS.filter(key => scenario.trimester === 'all' || key === scenario.trimester);
            const pending = selectedKeys.some(key => missingRepeat(key) || missingServices(key));
            container.innerHTML = '<div class="estimate-banner">' + (data.is_dummy ? 'Data Dummy — bukan tarif klinik' : 'Pratinjau pasien — belum diterbitkan') + '</div>' +
                '<div class="estimate-toolbar"><label>Periode estimasi<select class="estimate-input" data-estimate="trimester">' +
                [...TRIMESTERS, 'all'].map((key, i) => '<option value="' + key + '"' + (scenario.trimester === key ? ' selected' : '') + '>' + (key === 'all' ? 'Seluruh semester' : 'Trimester ' + (i + 1)) + '</option>').join('') +
                '</select></label><button type="button" class="estimate-button" data-estimate="help"><i class="fa-regular fa-circle-question"></i> Cara Menggunakan</button></div>' +
                '<p class="estimate-note">Harga dimuat: ' + esc(new Date(data.prices_loaded_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })) + ' WIB. Pengulangan dapat diubah untuk simulasi.</p>' +
                selectedKeys.map(key => '<p class="estimate-note estimate-service-guidance">' + esc(serviceGuidance[key]) + '</p>').join('') +
                '<p class="estimate-note"><strong>USG Transvaginal</strong> hanya dilakukan 1 kali bila usia kehamilan di bawah 8 minggu.</p>' +
                selectedKeys.map(key => {
                    const phase = result.trimesters[key];
                    return '<section class="section estimate-phase"><div class="tool-panel"><div class="estimate-heading"><h3>Trimester ' + (TRIMESTERS.indexOf(key) + 1) + '</h3>' +
                        '<div class="estimate-prescription-control"><label class="estimate-repeat">Pengulangan resep<input class="estimate-input" type="number" min="0" step="1" placeholder="Isi" aria-describedby="estimate-repeat-hint-' + key + '" data-estimate="repeat" data-key="' + key + '" value="' + esc(scenario.repeats[key]) + '"></label><span class="estimate-repeat-hint" id="estimate-repeat-hint-' + key + '">Acuan: ' + esc(data.trimesters[key].repeats ?? 'belum diatur') + (data.trimesters[key].repeats == null ? '' : ' kali') + '</span></div></div>' +
                        '<p class="estimate-note estimate-control-schedule"><strong>Jadwal kontrol:</strong> ' + (key === 't3' ? 'setiap 2 minggu sekali.' : 'setiap 1 bulan sekali.') + '</p>' +
                        (phase.issues.length ? '<div class="estimate-warning" role="status">' + phase.issues.map(esc).join('<br>') + '</div>' : '') +
                        phase.items.map(item => '<div class="estimate-item"><div class="estimate-item-top"><strong>' + esc(item.label) + '</strong><strong class="estimate-price">' + money(item.subtotal, item.kind === 'medication' ? missingRepeat(key) : scenario.services[item.key] == null) + '</strong></div>' +
                            '<div class="estimate-item-detail"><span>' + (item.kind === 'medication' ? 'Obat / suplemen' : 'Layanan / pemeriksaan') + '<br>' +
                            esc(item.quantity) + ' ' + esc(item.unit) + ' × ' + money(item.price) + ' × ' + esc(item.repeats ?? '…') + ' pengulangan</span>' +
                            (item.kind === 'service' ? '<label class="estimate-repeat">Pengulangan<input class="estimate-input" type="number" min="0" step="1" placeholder="Isi" data-estimate="service" data-key="' + item.key + '" value="' + esc(item.repeats) + '"></label>' : '') + '</div></div>').join('') +
                        '<div class="estimate-summary"><div><span>Subtotal obat / suplemen</span><strong>' + money(phase.medication_total, missingRepeat(key)) + '</strong></div><div><span>Subtotal layanan</span><strong>' + money(phase.service_total, missingServices(key)) + '</strong></div><div class="estimate-phase-total"><span>Total trimester</span><strong>' + money(phase.total, missingRepeat(key) || missingServices(key)) + '</strong></div></div></div></section>';
                }).join('') +
                (!result.ready ? '<div class="estimate-warning">' + (pending ? 'Isi jumlah pengulangan resep dan setiap layanan pada periode yang dipilih untuk menghitung estimasi. Angka acuan mengikuti pengaturan klinik.' : 'Total belum tersedia. Lengkapi konfigurasi atau periksa angka pengulangan pada periode yang dipilih.') + '</div>' : '') +
                '<div class="estimate-grand"><p>Total estimasi · ' + (scenario.trimester === 'all' ? 'seluruh semester' : 'trimester ' + scenario.trimester.slice(1)) + '</p><strong id="estimate-total">' + money(result.total, pending) + '</strong></div>' +
                '<p class="estimate-note">Perkiraan ini hanya mencakup item yang tercantum, bukan tagihan atau instruksi pengobatan. Jumlah pengulangan bukan rekomendasi jadwal kontrol. Biaya persalinan dan item yang tidak tercantum belum termasuk. Nama item adalah label yang ditentukan klinik.</p>';
        }
        function help() {
            const previous = document.activeElement;
            shell.openModal('Cara Menggunakan', 'Estimasi biaya', '<div class="estimate-help"><ol>' +
                '<li><strong>Pilih trimester.</strong><br>Lihat satu trimester atau seluruh periode yang sudah dikonfigurasi.</li>' +
                '<li><strong>Atur pengulangan.</strong><br>Isi kolom pengulangan resep dan layanan yang masih kosong. Lihat angka acuan resep di samping kolom dan acuan pemeriksaan setelah informasi harga dimuat. Total dihitung setelah angka diisi. Resep dan setiap layanan memiliki pengulangan terpisah. Isi 0 untuk tidak memasukkannya dalam simulasi.</li>' +
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
                data = value; scenario = initialScenario(data); render();
                let seen = false; try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) {}
                if (!helpShown && !seen) help();
            },
            unavailable(message) { data = null; container.innerHTML = '<div class="estimate-warning" role="status">' + esc(message) + '</div>'; },
            help
        };
    }
    window.CostEstimateView = { create };
})();
