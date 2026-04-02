# The Window — Sticky Pinned Scroll Window

Full-width dark panel yang menempel (sticky) saat scroll, dengan gap atas 10% dan bawah 20% dari viewport sehingga terlihat seperti jendela mengambang. Konten yang lebih panjang dari jendela otomatis di-scroll via animasi transform saat user scroll halaman.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

```html
<div class="welcome-pinned" id="welcome-pinned">
    <div class="welcome-pinned-inner">
        <div class="welcome-pinned-content" id="welcome-pinned-content">
            <h2>Judul</h2>
            <p>Paragraf konten...</p>
            <p>Paragraf konten...</p>
            <div class="welcome-sign">
                salam hangat,
                <strong>Nama</strong>
            </div>
        </div>
    </div>
</div>
```

**Catatan:**
- `id="welcome-pinned"` dan `id="welcome-pinned-content"` WAJIB ada (dipakai oleh JS)
- Bisa tambah paragraf sebanyak yang dibutuhkan — JS otomatis handle scroll
- Gunakan `<strong style="color:#fff">` untuk emphasis text di dalam paragraf

---

## CSS

```css
/* ========== WELCOME PINNED SCROLL ========== */

/* Outer wrapper — height mengontrol berapa lama window stay pinned */
.welcome-pinned {
    position: relative;
    height: 1800px;
    margin: 0 calc(-50vw + 50%);  /* break out ke full viewport width */
}

/* Sticky inner — the "window" */
.welcome-pinned-inner {
    position: sticky;
    top: 10vh;           /* 10% gap atas */
    height: 70vh;        /* tinggi window (sisa 20% gap bawah) */
    background: #0a0a0a;
    color: #ffffff;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0;
}

/* Content container */
.welcome-pinned-content {
    text-align: center;
    padding: 60px 32px;
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

### Pinned Window Scroll Animation

```javascript
// Saat konten lebih tinggi dari 70vh window, animasi translateY
// menggeser konten dari atas ke bawah seiring user scroll.
//
// Cara kerja:
//   CSS align-items: center menempatkan konten di tengah window.
//   Jika konten overflow, posisi centered memotong atas dan bawah.
//   overflow = contentH - windowH
//   progress 0 (awal): translateY(+overflow/2) → tampilkan atas
//   progress 1 (akhir): translateY(-overflow/2) → tampilkan bawah
//   Formula: translateY = overflow * (0.5 - progress)

(function() {
    var container = document.getElementById('welcome-pinned');
    var content   = document.getElementById('welcome-pinned-content');
    if (!container || !content) return;

    window.addEventListener('scroll', function() {
        var rect       = container.getBoundingClientRect();
        var containerH = container.offsetHeight;        // 1800px
        var viewH      = window.innerHeight * 0.7;      // matches CSS 70vh
        var contentH   = content.scrollHeight;
        var overflow   = contentH - viewH;

        if (overflow <= 0) return; // konten muat — tidak perlu animasi

        // Seberapa jauh sticky inner sudah di-scroll dalam container
        var progress = Math.max(0, Math.min(1, -rect.top / (containerH - viewH)));

        // Konten di-center CSS, jadi atas terpotong overflow/2.
        // progress=0: geser turun (tampilkan atas)
        // progress=1: geser naik (tampilkan bawah)
        var shift = overflow * (0.5 - progress);
        content.style.transform = 'translateY(' + shift + 'px)';
    }, { passive: true });
})();
```

---

## Konfigurasi

| Property | Default | Efek |
|---|---|---|
| `.welcome-pinned` height | `1800px` | Berapa lama window stay pinned saat scroll |
| `.welcome-pinned-inner` top | `10vh` | Gap atas (% viewport) |
| `.welcome-pinned-inner` height | `70vh` | Tinggi window |
| `border-radius` | `0` | Sudut (ubah ke `20px` untuk rounded) |
| `padding` | `60px 32px` | Spacing dalam konten |
| `line-height` (p) | `2` | Jarak antar baris teks |
| `margin-bottom` (p) | `32px` | Jarak antar paragraf |
| JS `viewH` multiplier | `0.7` | **Harus sama dengan CSS height** (70vh = 0.7) |

### Layout Viewport

```
┌─────────────────────────────────┐
│         10vh — page background  │
├─────────────────────────────────┤
│                                 │
│    70vh — dark window           │
│    overflow: hidden             │
│    align-items: center          │
│                                 │
├─────────────────────────────────┤
│         20vh — page background  │
└─────────────────────────────────┘
```
