# Sticky Stack Card-Deck Effect

Scroll-driven sticky stack di mana setiap row menempel (sticky) dan row berikutnya menumpuk di atasnya saat scroll. Deskripsi fade out lalu collapse, menyisakan title bar tipis. Row terakhir punya delay sebelum collapse.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

```html
<div class="proces-section">
    <div class="proces-header">SECTION TITLE</div>

    <a href="/link-1.html" class="proces-row">
        <span class="proces-step">01</span>
        <h3 class="proces-title">JUDUL ROW</h3>
        <p class="proces-desc">Deskripsi row yang akan fade out dan collapse saat scroll.</p>
    </a>

    <a href="/link-2.html" class="proces-row">
        <span class="proces-step">02</span>
        <h3 class="proces-title">JUDUL ROW 2</h3>
        <p class="proces-desc">Deskripsi row kedua.</p>
    </a>

    <!-- Tambah row sebanyak yang dibutuhkan -->

    <div class="proces-spacer"></div> <!-- Wajib: scroll room -->
</div>
```

**Catatan:**
- `proces-spacer` WAJIB ada di akhir section untuk menjaga scroll room
- Bisa pakai `<a>` (link) atau `<div>` untuk `.proces-row`
- Bisa punya multiple `.proces-section` dalam satu halaman

---

## CSS

```css
/* ========== PROCES SECTION (Sticky Stack Card-Deck) ========== */
.proces-section {
    padding-top: 70px;
}

.proces-header {
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-primary);
    margin-bottom: 20px;
}

.proces-row {
    display: grid;
    grid-template-columns: 50px 1fr;
    gap: 4px 20px;
    align-items: center;
    padding: 20px 0 70px 0;       /* PAD_TOP_MAX=20, PAD_BOT_MAX=70 (dianimasikan oleh JS) */
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    background: var(--bg-page);    /* WAJIB: solid background agar menutupi row di bawahnya */
    border-top: 1px solid rgba(0,0,0,0.12);
    position: sticky;              /* Kunci utama: sticky positioning */
    z-index: 2;                    /* Di-override oleh JS secara dinamis */
}

.proces-row:hover { opacity: 1; }
.proces-row:active { opacity: 1; }

.proces-spacer {
    height: 200px;                 /* Scroll room agar sticky terakhir punya ruang collapse */
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
    .proces-title { font-size: 21px; font-weight: 600; }
}
```

---

## JavaScript

```javascript
// ==================== STICKY STACK — Card-Deck Effect ====================
// Setiap row sticky. Saat scroll, deskripsi fade out lalu collapse menjadi
// title bar tipis. Row berikutnya menumpuk di atasnya (card-deck).
// Row terakhir punya delay sebelum collapse.
(function() {
    // ---- KONFIGURASI (sesuaikan sesuai kebutuhan) ----
    var STICKY_OFFSET = 90;          // px dari atas viewport untuk row pertama
    var PAD_TOP_MAX = 20;            // padding-top saat expanded (harus sama dengan CSS)
    var PAD_TOP_MIN = 20;            // padding-top saat collapsed
    var PAD_BOT_MAX = 70;            // padding-bottom saat expanded (harus sama dengan CSS)
    var PAD_BOT_MIN = 30;            // padding-bottom saat collapsed
    var SEGMENT = 420;               // px scroll budget per row
    var DELAY_BEFORE_LAST = 200;     // px extra scroll pause sebelum row terakhir collapse
    var WIPE_HOLD_PX = 20;          // px hold di akhir sebelum reset

    var sections = document.querySelectorAll('.proces-section');
    if (!sections.length) return;

    // Hitung tinggi collapsed dari ukuran title yang sebenarnya
    function getCollapsedH() {
        var sample = document.querySelector('.proces-title');
        if (!sample) return 76;
        var titleH = sample.getBoundingClientRect().height;
        return Math.round(PAD_TOP_MIN + titleH + PAD_BOT_MIN);
    }

    var COLLAPSED_H = getCollapsedH();

    // Assign sticky top position untuk setiap row
    function assignStickyTops() {
        COLLAPSED_H = getCollapsedH();
        sections.forEach(function(section) {
            var rows = Array.from(section.querySelectorAll('.proces-row'));
            if (!rows.length) return;

            rows.forEach(function(row, i) {
                row.style.top = (STICKY_OFFSET + i * COLLAPSED_H) + 'px';
                row.style.zIndex = 100 + i; // later rows on top (card-deck)
            });
        });
    }

    assignStickyTops();
    window.addEventListener('resize', function() { assignStickyTops(); });

    // ---- DATA & METRICS ----
    var ticking = false;
    var animating = false;
    var metricsReady = false;

    var sectionData = [];
    sections.forEach(function(section) {
        var rows = Array.from(section.querySelectorAll('.proces-row'));
        sectionData.push({
            el: section,
            rows: rows,
            startY: 0,
            endY: 0,
            activeIndex: -1,
            targetP: rows.map(function() { return 0; }),
            renderP: rows.map(function() { return 0; })
        });
    });

    function rebuildMetrics() {
        assignStickyTops();
        var scrollY = window.scrollY;
        sectionData.forEach(function(sd) {
            var sectionRect = sd.el.getBoundingClientRect();
            var sectionDocTop = sectionRect.top + scrollY;
            // Collapse mulai saat section sudah cukup terlihat
            sd.startY = sectionDocTop + sectionRect.height - window.innerHeight * 0.3;
            sd.endY = sd.startY + (sd.rows.length * SEGMENT) + (sd.rows.length > 1 ? DELAY_BEFORE_LAST : 0);

            sd.descHeights = sd.rows.map(function(row) {
                var desc = row.querySelector('.proces-desc');
                return desc ? Math.min(desc.scrollHeight, 120) : 80;
            });

            sd.targetP = sd.rows.map(function(_, i) { return sd.targetP[i] || 0; });
            sd.renderP = sd.rows.map(function(_, i) { return sd.renderP[i] || 0; });
        });
        metricsReady = true;
        onScroll();
    }

    // Rebuild saat content-wrapper ditampilkan atau resize
    var rebuildTimer = null;
    function scheduleRebuild() {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuildMetrics, 100);
    }
    // Ganti '#content-wrapper' dengan ID container konten Anda
    var contentEl = document.getElementById('content-wrapper');
    if (contentEl) {
        new MutationObserver(function() { scheduleRebuild(); })
            .observe(contentEl, { attributes: true });
    }
    window.addEventListener('resize', scheduleRebuild);
    setTimeout(rebuildMetrics, 500);

    // ---- APPLY STATE PER ROW ----
    function applyRowState(sd, i, p) {
        var row = sd.rows[i];
        if (!row) return;

        // Z-index: later rows on top (card-deck effect)
        // Expanded (dari bawah) > transitioning > collapsed
        var layer;
        if (p >= 1) layer = 800 + i;        // collapsed: tier terendah
        else if (p > 0) layer = 900 + i;    // transitioning: tier tengah
        else layer = 1000 + i;               // expanded: tier tertinggi
        row.style.zIndex = String(layer);

        // Two-phase fade: desc fade out di 10% pertama, lalu height collapse
        var descH = (sd.descHeights && sd.descHeights[i]) || 80;
        var desc = row.querySelector('.proces-desc');
        if (desc) {
            var collapsePx = p * SEGMENT;
            var fadeCutoffPx = SEGMENT * 0.10;
            var heightStartPx = SEGMENT * 0.10;
            var heightEndPx = SEGMENT * 0.30;

            // Opacity: 1 → 0.35 (di 0-6%), lalu 0.35 → 0 (di 6-10%)
            var fadeP = Math.min(1, collapsePx / fadeCutoffPx);
            var opacity;
            if (fadeP <= 0.60) {
                opacity = 1 - (fadeP / 0.60) * 0.65;
            } else {
                opacity = 0.35 * (1 - ((fadeP - 0.60) / 0.40));
            }
            desc.style.opacity = Math.max(0, opacity).toFixed(3);

            // Height collapse: mulai setelah fade selesai
            var heightP = collapsePx <= heightStartPx
                ? 0
                : Math.min(1, (collapsePx - heightStartPx) / (heightEndPx - heightStartPx));
            desc.style.maxHeight = (descH * (1 - heightP)).toFixed(1) + 'px';
        }

        // Padding animasi
        var padTop = PAD_TOP_MAX - (PAD_TOP_MAX - PAD_TOP_MIN) * p;
        var padBot = PAD_BOT_MAX - (PAD_BOT_MAX - PAD_BOT_MIN) * p;
        row.style.paddingTop = padTop.toFixed(1) + 'px';
        row.style.paddingBottom = padBot.toFixed(1) + 'px';
    }

    // ---- ANIMATION LOOP ----
    function renderAnimatedFrame() {
        if (!metricsReady) { animating = false; return; }

        var needsMore = false;
        sectionData.forEach(function(sd) {
            sd.rows.forEach(function(_, i) {
                var target = sd.targetP[i] || 0;
                var current = sd.renderP[i] || 0;
                var delta = target - current;
                var maxStep = 0.018;
                var step = Math.max(-maxStep, Math.min(maxStep, delta));
                var next = current + step;
                if (Math.abs(delta) <= maxStep) {
                    next = target;
                } else {
                    needsMore = true;
                }
                sd.renderP[i] = next;
                applyRowState(sd, i, next);
            });
        });

        if (needsMore) {
            requestAnimationFrame(renderAnimatedFrame);
        } else {
            animating = false;
        }
    }

    // ---- SCROLL HANDLER ----
    function onScroll() {
        if (!metricsReady) { ticking = false; return; }
        var scrollY = window.scrollY;

        sectionData.forEach(function(sd) {
            var count = sd.rows.length;
            if (count === 0) return;

            // Total scroll termasuk delay sebelum row terakhir
            var hasDelay = count > 1;
            var totalBudget = count * SEGMENT + (hasDelay ? DELAY_BEFORE_LAST : 0);
            var total = Math.max(0, Math.min(totalBudget, scrollY - sd.startY));

            var activeIndex, localP;
            if (scrollY < sd.startY) {
                activeIndex = -1;
                localP = 0;
            } else if (scrollY > sd.endY + WIPE_HOLD_PX) {
                activeIndex = count;
                localP = 0;
            } else if (scrollY > sd.endY) {
                activeIndex = count - 1;
                localP = 1;
            } else {
                // Sequential collapse dengan delay sebelum row terakhir
                var normalEnd = (count - 1) * SEGMENT;
                var delayEnd = normalEnd + (hasDelay ? DELAY_BEFORE_LAST : 0);
                if (!hasDelay || total <= normalEnd) {
                    activeIndex = Math.min(count - 1, Math.floor(total / SEGMENT));
                    localP = Math.max(0, Math.min(1, (total - activeIndex * SEGMENT) / SEGMENT));
                } else if (total <= delayEnd) {
                    // Delay pause: row-row sebelumnya collapsed, row terakhir hold expanded
                    activeIndex = count - 2;
                    localP = 1;
                } else {
                    // Row terakhir mulai collapse setelah delay
                    activeIndex = count - 1;
                    localP = Math.max(0, Math.min(1, (total - delayEnd) / SEGMENT));
                }
            }

            sd.activeIndex = activeIndex;

            sd.rows.forEach(function(_, i) {
                var p;
                if (activeIndex < 0)           p = 0;
                else if (i < activeIndex)      p = 1;
                else if (i === activeIndex)    p = localP;
                else                           p = 0;
                sd.targetP[i] = p;
                if (typeof sd.renderP[i] !== 'number') sd.renderP[i] = p;
            });
        });

        if (!animating) {
            animating = true;
            requestAnimationFrame(renderAnimatedFrame);
        }

        ticking = false;
    }

    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(onScroll);
            ticking = true;
        }
    }, { passive: true });
})();
```

---

## Cara Kerja

### Konsep Utama
1. Setiap `.proces-row` punya `position: sticky` dengan `top` yang berbeda (staggered)
2. Row pertama sticky di `top: 90px`, row kedua di `top: 90 + COLLAPSED_H`, dst.
3. Saat scroll, deskripsi fade out (two-phase), lalu height collapse
4. Row berikutnya menumpuk di ATAS row sebelumnya (card-deck z-index)
5. Row terakhir punya delay 200px sebelum mulai collapse

### Z-Index Strategy (Card-Deck)
- **Expanded (belum collapse):** `1000 + i` — tertinggi, menutupi semua row di atasnya
- **Transitioning (sedang collapse):** `900 + i` — tengah
- **Collapsed (sudah collapse):** `800 + i` — terendah

Later rows (i lebih besar) selalu di atas earlier rows dalam setiap tier.

### Scroll Timeline
```
[startY] → Row 0 collapse (420px) → Row 1 (420px) → ... → Row N-2 (420px) → DELAY (200px) → Row N-1 (420px) → [endY]
```

### Parameter yang Bisa Disesuaikan
| Parameter | Default | Fungsi |
|-----------|---------|--------|
| `STICKY_OFFSET` | 90 | Jarak dari atas viewport untuk row pertama |
| `PAD_TOP_MAX/MIN` | 20/20 | Padding atas expanded/collapsed |
| `PAD_BOT_MAX/MIN` | 70/30 | Padding bawah expanded/collapsed |
| `SEGMENT` | 420 | Px scroll budget per row |
| `DELAY_BEFORE_LAST` | 200 | Px extra pause sebelum row terakhir |
| `WIPE_HOLD_PX` | 20 | Px hold di akhir sebelum reset |

### Syarat Penting
1. `.proces-row` HARUS punya `background` solid (menutupi row di belakangnya)
2. Parent container TIDAK boleh punya `overflow: hidden` pada axis Y
3. `.proces-spacer` WAJIB ada di akhir section untuk scroll room
4. Jika konten awalnya hidden (display:none), gunakan MutationObserver untuk rebuild metrics saat ditampilkan
