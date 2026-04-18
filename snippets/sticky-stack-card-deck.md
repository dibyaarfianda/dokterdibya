# Sticky Stack Card-Deck Effect

Versi final yang dipakai di `public/patient-menu-trial.html`: setiap row punya sticky slot sendiri, lalu collapse dihitung per-row berdasarkan kapan row itu menyentuh slot-nya. Deskripsi fade out sangat awal, title tetap terkunci, dan row yang lebih bawah bisa dibuat collapse lebih cepat dengan lead tambahan per-row.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

```html
<div class="proces-section patient-features-section">
    <div class="proces-header">
        <h2>Fitur Pasien Portal</h2>
        <p>Tanya dokter, pantau kehamilan, dan atur jadwal vitamin.</p>
    </div>

    <a href="/tanya-dokter.html" class="proces-row">
        <span class="proces-step">01</span>
        <h3 class="proces-title">TANYA DOKTER</h3>
        <p class="proces-desc">Deskripsi row pertama.</p>
    </a>

    <a href="/kick-counter.html" class="proces-row">
        <span class="proces-step">02</span>
        <h3 class="proces-title">GERAKAN BAYI</h3>
        <p class="proces-desc">Deskripsi row kedua.</p>
    </a>

    <a href="/pregnancy-tracker.html" class="proces-row">
        <span class="proces-step">03</span>
        <h3 class="proces-title">MONITORING KEHAMILAN</h3>
        <p class="proces-desc">Deskripsi row ketiga.</p>
    </a>

    <div class="proces-spacer"></div>
</div>
```

Catatan:

- `proces-spacer` wajib ada di akhir section untuk memberi scroll room.
- `patient-features-section` dipakai untuk tuning khusus jika section ini perlu timing berbeda dari section lain.
- `.proces-row` bisa berupa `<a>` atau `<div>`, selama struktur internalnya sama.

---

## CSS

```css
.proces-row {
    display: grid;
    grid-template-columns: 50px 1fr;
    gap: 4px 20px;
    align-items: center;
    padding: 20px 0 70px 0;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    background: var(--bg-page);
    border-top: 1px solid rgba(0,0,0,0.12);
    position: sticky;
    z-index: 2;
}

.proces-row:hover { opacity: 1; }
.proces-row:active { opacity: 1; }

.proces-spacer {
    height: 520px;
}

.proces-step {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    margin: 0;
    grid-column: 1;
    grid-row: 1;
    display: flex;
    align-items: center;
    align-self: center;
    line-height: 1;
}

.proces-title {
    font-size: 26px;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0;
    line-height: 1.2;
    margin: 0;
    grid-column: 2;
    grid-row: 1;
}

.proces-desc {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
    overflow: hidden;
    grid-column: 2;
    grid-row: 2;
    will-change: opacity, max-height;
}

@media (max-width: 600px) {
    .proces-row {
        grid-template-columns: 40px 1fr;
        gap: 4px 12px;
        padding: 20px 0 70px 0;
    }

    .proces-title {
        font-size: 21px;
        font-weight: 600;
    }
}
```

---

## JavaScript

```javascript
// Sticky stack final version: progress dihitung per-row, bukan satu activeIndex global.
(function() {
    var STICKY_OFFSET = 90;
    var PAD_TOP_MAX = 30;
    var PAD_TOP_MIN = 20;
    var PAD_BOT_MAX = 96;
    var PAD_BOT_MIN = 30;
    var DELAY_BEFORE_LAST = 200;
    var COLLAPSE_LEAD_PX = 72;
    var WIPE_HOLD_PX = 20;

    var sections = document.querySelectorAll('.proces-section');
    if (!sections.length) return;

    function getCollapsedH() {
        var sample = document.querySelector('.proces-title');
        if (!sample) return 76;
        var titleH = sample.getBoundingClientRect().height;
        return Math.round(PAD_TOP_MIN + titleH + PAD_BOT_MIN);
    }

    function measureExpandedRow(row) {
        if (!row) {
            return { rowHeight: 140, descHeight: 80 };
        }

        var clone = row.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.pointerEvents = 'none';
        clone.style.top = '0';
        clone.style.left = '0';
        clone.style.zIndex = '-1';
        clone.style.width = (row.getBoundingClientRect().width || row.offsetWidth || row.parentElement.offsetWidth || 600) + 'px';
        clone.style.paddingTop = PAD_TOP_MAX + 'px';
        clone.style.paddingBottom = PAD_BOT_MAX + 'px';

        var cloneDesc = clone.querySelector('.proces-desc');
        if (cloneDesc) {
            cloneDesc.style.opacity = '1';
            cloneDesc.style.maxHeight = 'none';
        }

        document.body.appendChild(clone);
        var rowHeight = clone.getBoundingClientRect().height || 140;
        var descHeight = cloneDesc ? (cloneDesc.getBoundingClientRect().height || cloneDesc.scrollHeight || 80) : 80;
        clone.remove();

        return { rowHeight: rowHeight, descHeight: descHeight };
    }

    var COLLAPSED_H = getCollapsedH();

    function assignStickyTops() {
        COLLAPSED_H = getCollapsedH();
        sections.forEach(function(section) {
            var rows = Array.from(section.querySelectorAll('.proces-row'));
            rows.forEach(function(row, i) {
                row.style.top = (STICKY_OFFSET + i * COLLAPSED_H) + 'px';
                row.style.zIndex = 100 + i;
            });
        });
    }

    assignStickyTops();
    window.addEventListener('resize', assignStickyTops);

    var metricsReady = false;
    var scrollSyncFrame = 0;
    var lastObservedScrollY = window.scrollY;
    var stableFrames = 0;

    var sectionData = Array.from(sections).map(function(section) {
        var rows = Array.from(section.querySelectorAll('.proces-row'));
        return {
            el: section,
            rows: rows,
            startY: 0,
            endY: 0,
            rowStartY: [],
            activeIndex: -1,
            targetP: rows.map(function() { return 0; }),
            renderP: rows.map(function() { return 0; })
        };
    });

    function rebuildMetrics() {
        assignStickyTops();

        sectionData.forEach(function(sd) {
            var firstRow = sd.rows[0];
            var sampleMetrics = measureExpandedRow(firstRow);
            var isPatientFeaturesSection = sd.el.classList.contains('patient-features-section');

            sd.segment = Math.max(96, Math.round(sampleMetrics.rowHeight - COLLAPSED_H));
            sd.startY = firstRow ? (firstRow.offsetTop - STICKY_OFFSET) : 0;
            sd.rowStartY = sd.rows.map(function(row, i) {
                var slotTop = STICKY_OFFSET + (i * COLLAPSED_H);
                var rowLead = COLLAPSE_LEAD_PX;
                if (isPatientFeaturesSection) {
                    rowLead += i * 56;
                }
                var start = row.offsetTop - slotTop - rowLead;
                if (i === sd.rows.length - 1 && sd.rows.length > 1) {
                    start += isPatientFeaturesSection ? 40 : DELAY_BEFORE_LAST;
                }
                return start;
            });
            sd.endY = sd.rowStartY.length ? (sd.rowStartY[sd.rowStartY.length - 1] + sd.segment) : sd.startY;
            sd.descHeights = sd.rows.map(function(row) {
                return Math.min(measureExpandedRow(row).descHeight, 120);
            });
        });

        metricsReady = true;
        onScroll();
    }

    function applyRowState(sd, i, p) {
        var row = sd.rows[i];
        if (!row) return;

        var layer;
        if (p >= 1) layer = 800 + i;
        else if (p > 0) layer = 900 + i;
        else layer = 1000 + i;
        row.style.zIndex = String(layer);

        var descH = (sd.descHeights && sd.descHeights[i]) || 80;
        var desc = row.querySelector('.proces-desc');
        if (desc) {
            var fadeWindow = 0.18;
            var fadeP = Math.max(0, Math.min(1, p / fadeWindow));
            var opacity = 1 - Math.pow(fadeP, 0.72);
            var heightEndP = 0.88;
            var heightP = Math.max(0, Math.min(1, p / heightEndP));
            var remainingDescRatio = Math.max(0, 1 - heightP);

            desc.style.opacity = Math.max(0, opacity).toFixed(3);
            desc.style.maxHeight = (descH * remainingDescRatio).toFixed(1) + 'px';
        }

        var padTop = PAD_TOP_MAX - (PAD_TOP_MAX - PAD_TOP_MIN) * p;
        var padBot = PAD_BOT_MAX - (PAD_BOT_MAX - PAD_BOT_MIN) * p;
        row.style.paddingTop = padTop.toFixed(1) + 'px';
        row.style.paddingBottom = padBot.toFixed(1) + 'px';
    }

    function onScroll() {
        if (!metricsReady) return;

        var scrollY = window.scrollY;

        sectionData.forEach(function(sd) {
            var count = sd.rows.length;
            if (!count) return;

            var segment = sd.segment || 96;
            var activeIndex = -1;
            var rowProgress = sd.rowStartY.map(function(start, i) {
                var p = (scrollY - start) / segment;
                if (i === count - 1 && scrollY > sd.endY + WIPE_HOLD_PX) {
                    p = 1;
                }
                return Math.max(0, Math.min(1, p));
            });

            sd.rows.forEach(function(_, i) {
                var p = rowProgress[i] || 0;
                if (activeIndex === -1 && p > 0 && p < 1) {
                    activeIndex = i;
                }
                sd.targetP[i] = p;
                sd.renderP[i] = p;
                applyRowState(sd, i, p);
            });

            if (activeIndex === -1) {
                if (rowProgress.every(function(p) { return p >= 1; })) {
                    activeIndex = count;
                } else if (rowProgress.some(function(p) { return p > 0; })) {
                    activeIndex = Math.max(0, rowProgress.findIndex(function(p) { return p < 1; }));
                }
            }

            sd.activeIndex = activeIndex;
        });
    }

    function syncScrollFrame() {
        onScroll();

        if (Math.abs(window.scrollY - lastObservedScrollY) > 0.5) {
            lastObservedScrollY = window.scrollY;
            stableFrames = 0;
            scrollSyncFrame = requestAnimationFrame(syncScrollFrame);
            return;
        }

        if (stableFrames < 2) {
            stableFrames += 1;
            scrollSyncFrame = requestAnimationFrame(syncScrollFrame);
            return;
        }

        scrollSyncFrame = 0;
    }

    function scheduleScrollSync() {
        lastObservedScrollY = window.scrollY;
        stableFrames = 0;
        if (!scrollSyncFrame) {
            scrollSyncFrame = requestAnimationFrame(syncScrollFrame);
        }
    }

    var rebuildTimer = null;
    function scheduleRebuild() {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuildMetrics, 100);
    }

    var contentEl = document.getElementById('content-wrapper');
    if (contentEl) {
        new MutationObserver(function() { scheduleRebuild(); })
            .observe(contentEl, { attributes: true });
    }

    window.addEventListener('resize', scheduleRebuild);
    window.addEventListener('scroll', scheduleScrollSync, { passive: true });
    window.addEventListener('wheel', scheduleScrollSync, { passive: true });
    window.addEventListener('touchmove', scheduleScrollSync, { passive: true });

    setTimeout(rebuildMetrics, 500);
    onScroll();
    window.setInterval(onScroll, 33);
})();
```

---

## Cara Kerja Final

1. Setiap row tetap `position: sticky`, tapi collapse tidak lagi digerakkan oleh satu timeline global.
2. Tiap row punya `rowStartY` sendiri, dihitung dari `offsetTop - slotTop - rowLead`.
3. `rowLead` bisa ditambah per row agar row yang lebih bawah tidak terasa terlambat.
4. Untuk `patient-features-section`, row 3 dan 4 dipercepat dengan tambahan `i * 56`.
5. Row terakhir di section itu juga tidak memakai hold `200px` penuh, hanya `40px`, supaya tidak tertinggal.
6. Fade desc dipercepat dengan `fadeWindow = 0.18`, jadi teks cepat hilang sementara title tetap sticky.

---

## Parameter Penting

| Parameter | Nilai saat ini | Fungsi |
| --------- | -------------- | ------ |
| `STICKY_OFFSET` | `90` | Slot sticky row pertama |
| `PAD_TOP_MAX / MIN` | `30 / 20` | Padding atas expanded dan collapsed |
| `PAD_BOT_MAX / MIN` | `96 / 30` | Padding bawah expanded dan collapsed |
| `COLLAPSE_LEAD_PX` | `72` | Start collapse awal untuk semua row |
| `fadeWindow` | `0.18` | Porsi awal timeline untuk fade out desc |
| `DELAY_BEFORE_LAST` | `200` | Hold default row terakhir untuk section umum |
| `patient-features last-row hold` | `40` | Hold row terakhir khusus section fitur pasien |
| `patient-features rowLead bonus` | `i * 56` | Percepatan tambahan untuk row bawah |

---

## Kenapa Versi Ini Lebih Stabil

- Tidak lagi bergantung pada `SEGMENT = 420` hardcoded.
- Tinggi row expanded diukur dari clone tersembunyi, jadi tidak bias oleh state animasi saat ini.
- `TANYA DOKTER` tetap terkunci karena row 1 collapse berdasarkan slot sticky miliknya sendiri.
- Row 2, 3, dan 4 bisa dituning terpisah tanpa merusak timing row sebelumnya.
- Loop sinkronisasi `requestAnimationFrame` plus `setInterval(onScroll, 33)` menjaga state tetap mengikuti `scrollY` saat browser menggabungkan event scroll.

---

## Syarat Penting

1. `.proces-row` harus punya background solid.
2. Parent container jangan memotong sticky dengan `overflow: hidden` di axis Y.
3. `proces-spacer` wajib ada.
4. Kalau container awalnya hidden, rebuild metrics saat ditampilkan.
5. Jika butuh section lain dengan timing berbeda, pakai class khusus seperti `.patient-features-section` lalu tambahkan rule tuning di `rebuildMetrics()`.
