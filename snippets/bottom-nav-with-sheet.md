# Bottom Navigation + Bottom Sheet

Fixed bottom navigation bar dengan backdrop blur. Saat nav item dipilih, bottom sheet muncul dari bawah DI ATAS nav bar (tidak menutupi tombol), dan halaman utama menjadi blur. Nav items dipisahkan garis halus sehingga terkesan tombol individual.

Referensi implementasi: `public/patient-menu-trial.html`

---

## HTML Structure

### Bottom Sheet Overlay + Sheet
```html
<!-- Bottom Sheet Overlay (dark backdrop) -->
<div class="bottom-sheet-overlay" id="sheet-overlay" onclick="closeBottomSheet()"></div>

<!-- Bottom Sheet (muncul di atas nav bar) -->
<div class="bottom-sheet" id="bottom-sheet">
    <div class="bottom-sheet-handle"></div>
    <div class="bottom-sheet-header">
        <div class="sheet-icon" id="sheet-icon"></div>
        <h3 id="sheet-title">Menu</h3>
    </div>
    <div class="bottom-sheet-menu" id="sheet-menu">
        <!-- Menu items di-inject oleh JS -->
    </div>
</div>
```

### Bottom Navigation Bar
```html
<nav class="bottom-nav" aria-label="Navigasi bawah">
    <div class="bottom-inner">
        <a href="/beranda.html" class="nav-item active" aria-current="page">
            <i class="fa-solid fa-house"></i>
            <span>Beranda</span>
        </a>
        <a class="nav-item" onclick="navigateTo('dokumen')">
            <i class="fa-solid fa-folder-open"></i>
            <span>Dokumen</span>
            <span class="nav-badge" id="doc-nav-badge">0</span>
        </a>
        <a class="nav-item" onclick="navigateTo('aplikasi')">
            <i class="fa-solid fa-th-large"></i>
            <span>Aplikasi</span>
        </a>
        <a class="nav-item" onclick="navigateTo('edukasi')">
            <i class="fa-solid fa-book-open"></i>
            <span>Edukasi</span>
        </a>
        <a class="nav-item" onclick="navigateTo('jadwal')">
            <i class="fa-solid fa-calendar-check"></i>
            <span>Jadwal</span>
        </a>
    </div>
</nav>
```

**Catatan:**
- `bottom-sheet` dan `sheet-overlay` HARUS di luar `<main>` agar tidak ikut blur
- `bottom-nav` juga di luar `<main>`
- Urutan: `<main>` → overlay → sheet → nav

---

## CSS

### Bottom Navigation
```css
/* ========== BOTTOM NAVIGATION ========== */
.bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    background: rgba(255, 255, 255, 0.95);
    -webkit-backdrop-filter: blur(24px);
    backdrop-filter: blur(24px);
    border-top: 1px solid var(--line-soft);
    padding-bottom: env(safe-area-inset-bottom, 0px);
}

.bottom-inner {
    max-width: 760px;
    margin: 0 auto;
    padding: 8px 12px 10px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);  /* Sesuaikan jumlah nav items */
    gap: 2px;
}

.nav-item {
    min-height: 48px;
    position: relative;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    color: var(--text-muted);
    text-decoration: none;
    transition: transform 0.25s ease, color 0.25s ease;
    cursor: pointer;
}

.nav-item i { font-size: 18px; }

.nav-item span {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
}

/* Active state: warna gelap + accent bar di atas */
.nav-item.active { color: var(--text-primary); }

.nav-item.active::before {
    content: '';
    position: absolute;
    top: -10px;
    width: 24px;
    height: 3px;
    border-radius: 3px;
    border: none;
    background: var(--accent);
}

/* Tap feedback */
.nav-item:active { transform: scale(0.9); }

/* Separator: garis halus antar nav item */
.nav-item + .nav-item {
    border-left: 1px solid var(--line-soft);
}

/* Badge notifikasi di nav item */
.nav-badge {
    position: absolute;
    top: 2px;
    right: calc(50% - 20px);
    background: var(--accent);
    color: #ffffff;
    font-size: 8px;
    font-weight: 700;
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    text-align: center;
    border-radius: 50%;
    padding: 0 3px;
    display: none;
    border: 2px solid var(--bg-surface);
}
```

### Bottom Sheet
```css
/* ========== BOTTOM SHEET ========== */
.bottom-sheet-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 1000;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
}

.bottom-sheet-overlay.active {
    opacity: 1;
    visibility: visible;
}

.bottom-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-surface);
    border-top: 1px solid var(--line-soft);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.08);
    padding: 0 0 env(safe-area-inset-bottom);
    z-index: 1001;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    max-height: 500px;
    overflow-y: auto;
}

.bottom-sheet.active {
    transform: translateY(0);
}

/* Blur halaman utama saat sheet terbuka */
body.sheet-open main {
    filter: blur(6px);
    transition: filter 0.3s ease;
}
body.sheet-open .bottom-nav {
    filter: blur(0);  /* Nav bar tetap tajam */
}

.bottom-sheet-handle {
    width: 40px;
    height: 4px;
    background: var(--line-soft);
    border-radius: 2px;
    margin: 12px auto;
}

.bottom-sheet-header {
    padding: 0 20px 14px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: center;
    gap: 12px;
}

.bottom-sheet-header .sheet-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: var(--text-primary);
    border: none;
    background: var(--accent-soft);
}

.bottom-sheet-header h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
}

.bottom-sheet-menu {
    padding: 8px 0;
}

.sheet-menu-item {
    display: flex;
    align-items: center;
    padding: 14px 20px;
    color: var(--text-primary);
    text-decoration: none;
    transition: background 0.2s;
}

.sheet-menu-item:hover,
.sheet-menu-item:active {
    background: var(--accent-soft);
}

.sheet-menu-item i.menu-item-icon {
    width: 24px;
    font-size: 15px;
    color: var(--text-secondary);
    margin-right: 14px;
}

.sheet-menu-item span {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
}

.sheet-menu-item .arrow {
    color: var(--text-muted);
    font-size: 11px;
}
```

---

## JavaScript

### Menu Data
```javascript
// Data menu untuk setiap kategori bottom nav
const menuData = {
    'dokumen': {
        title: 'Dokumen',
        icon: 'fa-solid fa-folder-open',
        items: [
            { icon: 'fa-solid fa-image', label: 'Album USG', href: '/album-usg.html' },
            { icon: 'fa-solid fa-flask', label: 'Hasil Lab', href: '/hasil-lab.html' },
            { icon: 'fa-solid fa-file-medical', label: 'Resume Medis', href: '/dokumen-medis.html' }
        ]
    },
    'aplikasi': {
        title: 'Aplikasi',
        icon: 'fa-solid fa-th-large',
        items: [
            { icon: 'fa-solid fa-comments', label: 'Tanya Dokter', href: '/tanya-dokter.html' },
            { icon: 'fa-solid fa-hand', label: 'Gerakan Bayi', href: '/kick-counter.html' },
            { icon: 'fa-solid fa-chart-line', label: 'Monitoring', href: '/pregnancy-tracker.html' }
        ]
    }
    // Tambah kategori sesuai kebutuhan
};
```

### Open/Close Bottom Sheet
```javascript
function openBottomSheet(category) {
    const data = menuData[category];
    if (!data) return;

    // Set header
    document.getElementById('sheet-icon').innerHTML = '<i class="' + data.icon + '"></i>';
    document.getElementById('sheet-title').textContent = data.title;

    // Build menu items
    let menuHtml = '';
    data.items.forEach(function(item) {
        menuHtml += '<a href="' + item.href + '" class="sheet-menu-item">' +
            '<i class="' + item.icon + ' menu-item-icon"></i>' +
            '<span>' + item.label + '</span>' +
            '<i class="fa-solid fa-chevron-right arrow"></i>' +
        '</a>';
    });

    document.getElementById('sheet-menu').innerHTML = menuHtml;

    // Show sheet + blur main content
    document.getElementById('sheet-overlay').classList.add('active');
    document.getElementById('bottom-sheet').classList.add('active');
    document.body.classList.add('sheet-open');     // <-- blur main
    var scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = scrollbarW + 'px';
}

function closeBottomSheet() {
    document.getElementById('sheet-overlay').classList.remove('active');
    document.getElementById('bottom-sheet').classList.remove('active');
    document.body.classList.remove('sheet-open');  // <-- un-blur main
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
}

// Navigation handler
function navigateTo(section) {
    openBottomSheet(section);
}
```

---

## Cara Kerja

### Layer Stack (z-index)
```
z-index 1001  → Bottom Sheet (muncul di atas semua)
z-index 1000  → Sheet Overlay (dark backdrop)
z-index 30    → Bottom Nav (selalu terlihat)
z-index auto  → Main content (halaman utama, di-blur saat sheet terbuka)
```

### Alur Saat Nav Item Ditekan
1. User tap nav item → `navigateTo('kategori')` dipanggil
2. `openBottomSheet()` → inject menu items ke sheet
3. Sheet overlay muncul (dark backdrop, opacity 0 → 1)
4. Bottom sheet slide up dari bawah (`translateY(100%) → 0`)
5. `body.sheet-open` ditambahkan → `<main>` blur 6px
6. Body overflow hidden (prevent scroll di belakang)
7. Bottom nav TETAP terlihat dan tajam (tidak blur)

### Saat Ditutup (tap overlay atau close)
1. Sheet slide down (`translateY(0) → 100%`)
2. Overlay fade out
3. `body.sheet-open` dihapus → blur hilang
4. Body overflow kembali normal

### Fitur Utama
| Fitur | Detail |
|-------|--------|
| Backdrop blur nav bar | `backdrop-filter: blur(24px)` dengan background semi-transparan |
| Separator antar item | `border-left: 1px solid` via `nav-item + nav-item` selector |
| Active indicator | Accent bar 3px di atas item aktif via `::before` pseudo |
| Tap feedback | `scale(0.9)` saat active/pressed |
| Badge notifikasi | Bulat merah di pojok kanan atas icon |
| Sheet di atas nav | z-index 1001 (sheet) > 30 (nav) |
| Main blur | `filter: blur(6px)` pada `<main>` saat `body.sheet-open` |
| Safe area | `env(safe-area-inset-bottom)` untuk iPhone notch |

### Syarat Penting
1. `<main>`, overlay, sheet, dan nav bar HARUS elemen terpisah (bukan nested)
2. Blur hanya pada `<main>` — sheet dan nav bar di luar `<main>`
3. Sheet z-index > nav z-index agar sheet muncul di atas nav bar
4. `env(safe-area-inset-bottom)` pada nav bar untuk support iPhone
5. Font Awesome diperlukan untuk icons
