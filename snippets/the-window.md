# The Window — Sticky Pinned Scroll Window

Full-width dark panel yang menempel (sticky) saat scroll, dengan gap atas dan bawah dari viewport sehingga terlihat seperti jendela mengambang. Inner menutup 100vh penuh agar konten halaman di luar tidak tembus. Konten yang lebih panjang dari jendela otomatis di-scroll via animasi transform saat user scroll halaman. Dilengkapi tombol skip (panah bawah) untuk fast-forward ke akhir konten.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

```html
<div class="welcome-pinned" id="welcome-pinned">
    <div class="welcome-pinned-inner">
        <div class="welcome-window">
            <button class="welcome-skip" id="welcome-skip" onclick="skipWelcomeWindow()" aria-label="Lewati">
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="welcome-pinned-content" id="welcome-pinned-content">
                <h2>Judul</h2>
                <p>Paragraf konten...</p>
                <p>Paragraf konten...</p>
                <div class="welcome-sign" style="margin-bottom: 50px;">
                    salam hangat,
                    <strong>Nama</strong>
                </div>
            </div>
        </div>
    </div>
</div>
```

**Catatan:**
- `id="welcome-pinned"`, `id="welcome-pinned-content"`, dan `id="welcome-skip"` WAJIB ada (dipakai oleh JS)
- Bisa tambah paragraf sebanyak yang dibutuhkan — JS otomatis handle scroll
- Gunakan `<strong style="color:#fff">` untuk emphasis text di dalam paragraf
- `margin-bottom: 50px` pada `.welcome-sign` untuk space di akhir konten

---

## CSS

```css
/* ========== WELCOME PINNED SCROLL ========== */

/* Outer wrapper — height mengontrol berapa lama window stay pinned.
   z-index + background mencegah konten halaman tembus lewat gap. */
.welcome-pinned {
    position: relative;
    height: 1200px;
    margin: 0 calc(-50vw + 50%);  /* break out ke full viewport width */
    z-index: 2;
    background: var(--bg-page);
}

/* Sticky inner — menutup 100vh PENUH agar tidak ada celah.
   Padding atas/bawah menciptakan gap visual (page bg terlihat). */
.welcome-pinned-inner {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding-top: 10vh;       /* gap atas */
    padding-bottom: 10vh;    /* gap bawah */
    box-sizing: border-box;
}

/* Dark window — area konten yang terlihat (flex: 1 = sisa dari 100vh - padding) */
.welcome-window {
    flex: 1;
    position: relative;
    background: #0a0a0a;
    color: #ffffff;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Skip button — panah bawah di kanan atas window */
.welcome-skip {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 2;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: rgba(255, 255, 255, 0.5);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    opacity: 0;
    transition: background 0.2s, color 0.2s, opacity 0.7s;
}

.welcome-skip.visible {
    opacity: 1;
}

.welcome-skip:hover {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
}

/* Content container */
.welcome-pinned-content {
    text-align: center;
    padding: 100px 32px;
    max-width: 640px;
    will-change: transform;
}

.welcome-pinned-content h2 {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 32px;
    letter-spacing: -0.02em;
}

.welcome-pinned-content p {
    font-size: 15px;
    line-height: 2;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 32px;
}

.welcome-pinned-content .welcome-sign {
    margin-top: 40px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
}

.welcome-pinned-content .welcome-sign strong {
    display: block;
    color: rgba(255, 255, 255, 0.8);
    font-size: 16px;
    margin-top: 4px;
}
```

---

## JavaScript

### Scroll to Top on Load

```javascript
// Prevent browser dari restore scroll position sebelumnya
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
```

### Skip Button

```javascript
// Fast-forward ke akhir welcome section
function skipWelcomeWindow() {
    var container = document.getElementById('welcome-pinned');
    if (!container) return;
    var targetY = container.offsetTop + container.offsetHeight - window.innerHeight;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
}
window.skipWelcomeWindow = skipWelcomeWindow;
```

### Pinned Window Scroll Animation

```javascript
// Saat konten lebih tinggi dari window, animasi translateY
// menggeser konten dari atas ke bawah seiring user scroll.
//
// Cara kerja:
//   CSS align-items: center menempatkan konten di tengah window.
//   Jika konten overflow, posisi centered memotong atas dan bawah.
//   overflow = contentH - windowH
//   progress 0 (awal): translateY(+overflow/2) → tampilkan atas
//   progress 1 (akhir): translateY(-overflow/2) → tampilkan bawah
//   Formula: translateY = overflow * (0.5 - progress)
//
// PENTING: progress dihitung pakai full viewport (innerHeight),
// bukan windowH, karena sticky inner = 100vh.

(function() {
    var container = document.getElementById('welcome-pinned');
    var content   = document.getElementById('welcome-pinned-content');
    var skipBtn   = document.getElementById('welcome-skip');
    if (!container || !content) return;

    window.addEventListener('scroll', function() {
        var rect       = container.getBoundingClientRect();
        var containerH = container.offsetHeight;
        var windowH    = window.innerHeight * 0.8;   // matches CSS (100vh - 10vh top - 10vh bottom)
        var contentH   = content.scrollHeight;
        var overflow   = contentH - windowH;

        if (overflow <= 0) return;

        // Progress based on full viewport (inner is 100vh)
        var scrollRange = containerH - window.innerHeight;
        var progress = Math.max(0, Math.min(1, -rect.top / scrollRange));

        // Konten di-center CSS, jadi atas terpotong overflow/2.
        // progress=0: geser turun (tampilkan atas)
        // progress=1: geser naik (tampilkan bawah)
        var shift = overflow * (0.5 - progress);
        content.style.transform = 'translateY(' + shift + 'px)';

        // Show/hide skip button (fade in 0.7s)
        if (skipBtn) {
            if (progress > 0.01 && progress < 0.85) {
                skipBtn.classList.add('visible');
            } else {
                skipBtn.classList.remove('visible');
            }
        }
    }, { passive: true });
})();
```

---

## Konfigurasi

| Property | Default | Efek |
|---|---|---|
| `.welcome-pinned` height | `1200px` | Berapa lama window stay pinned saat scroll |
| `.welcome-pinned-inner` padding-top | `10vh` | Gap atas (% viewport) |
| `.welcome-pinned-inner` padding-bottom | `10vh` | Gap bawah (% viewport) |
| `.welcome-pinned-content` padding | `100px 32px` | Spacing dalam konten |
| `line-height` (p) | `2` | Jarak antar baris teks |
| `margin-bottom` (p) | `32px` | Jarak antar paragraf |
| JS `windowH` multiplier | `0.8` | **Harus = 1 - top - bottom** (100vh - 10vh - 10vh = 0.8) |

### Layout Viewport

```
┌─────────────────────────────────┐  ←  .welcome-pinned-inner (sticky, 100vh)
│         10vh — page background  │      padding-top
├─────────────────────────────────┤
│  [skip btn]                     │  ←  .welcome-window (flex:1 = 80vh)
│                                 │      background: #0a0a0a
│    Content area                 │      overflow: hidden
│    align-items: center          │      align-items: center
│    (auto-scrolls via JS)        │
│                                 │
├─────────────────────────────────┤
│         10vh — page background  │      padding-bottom
└─────────────────────────────────┘

Konten halaman di luar TIDAK tembus karena:
1. Inner = 100vh menutup seluruh viewport
2. Outer (.welcome-pinned) punya z-index: 2 + background
```
