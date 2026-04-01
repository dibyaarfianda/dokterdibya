# Magnifying Menu Cards (Neighbor Effect)

Grid menu cards dengan efek magnifying: card yang di-hover membesar (scale 1.08), dan card-card tetangga (atas/bawah/kiri/kanan) ikut sedikit membesar (scale 1.03) — mirip efek magnifying glass di macOS dock.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

```html
<div class="section-title">Nama Section</div>
<div class="menu-grid">
    <div class="menu-card" onclick="window.location.href='/page-1.html'">
        <div class="menu-icon"><i class="fa-solid fa-heart"></i></div>
        <h3>Menu 1</h3>
    </div>
    <div class="menu-card" onclick="window.location.href='/page-2.html'">
        <div class="menu-icon"><i class="fa-solid fa-book-open"></i></div>
        <h3>Menu 2</h3>
    </div>
    <div class="menu-card" onclick="window.location.href='/page-3.html'">
        <div class="menu-icon"><i class="fa-solid fa-credit-card"></i></div>
        <h3>Menu 3</h3>
    </div>
</div>
```

**Catatan:**
- Grid default 3 kolom, sesuaikan `grid-template-columns` dan parameter `cols` di JS
- Bisa tambah badge notifikasi dengan `<span class="menu-badge">3</span>` di dalam `.menu-card`

---

## CSS

```css
.menu-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.menu-card {
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    padding: 22px 16px;
    text-align: center;
    cursor: pointer;
    transform: scale(1) translateY(0);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),  /* spring bounce */
                background-color 0.25s ease,
                border-color 0.25s ease,
                box-shadow 0.25s ease;
    position: relative;
    background: var(--bg-surface);
    box-shadow: var(--shadow-soft);
    will-change: transform;
}

/* Hover: card membesar + naik sedikit */
.menu-card:hover {
    transform: scale(1.08) translateY(-2px);
    background: var(--bg-secondary);
    border-color: var(--line-strong);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    z-index: 10;
}

/* Active/tap: shrink feedback */
.menu-card:active {
    transform: scale(0.97) translateY(0);
    transition: transform 0.1s ease;
}

/* Neighbor: card tetangga ikut sedikit membesar */
.menu-card.neighbor {
    transform: scale(1.03);
}

/* Icon container */
.menu-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 10px;
    font-size: 20px;
    color: var(--text-primary);
    border: none;
    background: var(--bg-elevated);
    transition: background 0.2s ease;
}

.menu-card:hover .menu-icon {
    background: rgba(0, 0, 0, 0.08);
}

/* Title */
.menu-card h3 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 2px;
    color: var(--text-primary);
}

/* Optional subtitle */
.menu-card p {
    font-size: 10px;
    color: var(--text-muted);
}

/* Optional: Notification badge */
.menu-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--accent);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
}
```

---

## JavaScript (Neighbor Effect)

```javascript
// ==================== CARD NEIGHBOR EFFECT (Magnifying) ====================
// Saat hover card, card tetangga (atas/bawah/kiri/kanan) ikut scale up.
// Mirip efek magnifying glass di macOS dock.
(function() {
    /**
     * Setup neighbor effect untuk grid container
     * @param {Element} container - Grid container element
     * @param {string} selector - CSS selector untuk card items
     * @param {number} cols - Jumlah kolom di grid
     */
    function setupNeighbors(container, selector, cols) {
        var cards = Array.from(container.querySelectorAll(selector));

        function clear() {
            cards.forEach(function(c) { c.classList.remove('neighbor'); });
        }

        cards.forEach(function(card, i) {
            card.addEventListener('mouseenter', function() {
                clear();
                var col = i % cols;
                // Kanan
                if (col + 1 < cols && cards[i + 1]) cards[i + 1].classList.add('neighbor');
                // Kiri
                if (col - 1 >= 0 && cards[i - 1]) cards[i - 1].classList.add('neighbor');
                // Bawah
                if (cards[i + cols]) cards[i + cols].classList.add('neighbor');
                // Atas
                if (cards[i - cols]) cards[i - cols].classList.add('neighbor');
            });
            card.addEventListener('mouseleave', clear);
        });

        container.addEventListener('mouseleave', clear);
    }

    // Inisialisasi untuk semua .menu-grid (3 kolom)
    document.querySelectorAll('.menu-grid').forEach(function(g) {
        setupNeighbors(g, '.menu-card', 3);
    });
})();
```

---

## Cara Kerja

### Efek Magnifying
1. **Hover card**: `scale(1.08) translateY(-2px)` — membesar 8% + naik 2px
2. **Neighbor cards**: `scale(1.03)` — membesar 3% (efek rambatan)
3. **Active/tap**: `scale(0.97)` — shrink feedback saat ditekan
4. **Spring bounce**: `cubic-bezier(0.34, 1.56, 0.64, 1)` — animasi bouncy

### Neighbor Detection
```
Grid 3 kolom:
[0] [1] [2]
[3] [4] [5]
[6] [7] [8]

Hover card [4]:
- Kiri:  [3] (col-1 >= 0)
- Kanan: [5] (col+1 < cols)
- Atas:  [1] (i - cols)
- Bawah: [7] (i + cols)

Hasil: [1], [3], [5], [7] dapat class "neighbor"
```

### Parameter yang Bisa Disesuaikan
| Parameter | Default | Fungsi |
|-----------|---------|--------|
| `cols` (JS) | 3 | Jumlah kolom grid |
| `scale` hover | 1.08 | Besaran zoom card utama |
| `scale` neighbor | 1.03 | Besaran zoom card tetangga |
| `scale` active | 0.97 | Shrink saat tap/click |
| `translateY` hover | -2px | Seberapa naik card saat hover |
| `cubic-bezier` | 0.34, 1.56, 0.64, 1 | Spring bounce curve |

### Untuk Grid Selain 3 Kolom
Sesuaikan CSS dan parameter JS:
```css
/* 4 kolom */
.menu-grid { grid-template-columns: repeat(4, 1fr); }
```
```javascript
setupNeighbors(container, '.menu-card', 4);
```

### Badge Notifikasi
```html
<div class="menu-card" onclick="...">
    <span class="menu-badge">3</span>  <!-- Angka notifikasi -->
    <div class="menu-icon"><i class="fa-solid fa-bell"></i></div>
    <h3>Notifikasi</h3>
</div>
```
