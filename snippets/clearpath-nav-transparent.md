# ClearPath Progressive Blur - Transparent Bottom Nav

Source: [ClearPath Framer Template](https://clearpath-template.framer.website/)

Teknik 8-layer progressive blur dengan `mask-image` gradient. Setiap layer blur 2x lebih kuat dari sebelumnya, dengan mask yang bergeser 12.5% per layer.

- ClearPath asli: `to top` (header atas)
- Adaptasi bottom nav: `to bottom` (nav bawah)
- Tidak ada background color - murni blur saja
- Container height: 140px (ClearPath asli: 220px)

## Angka-angka Exact

| Layer | Blur | z-index | Mask Gradient Stops |
|-------|------|---------|---------------------|
| 1 | `0.15625px` | 1 | 0% → 12.5% → 25% → 37.5% |
| 2 | `0.3125px` | 2 | 12.5% → 25% → 37.5% → 50% |
| 3 | `0.625px` | 3 | 25% → 37.5% → 50% → 62.5% |
| 4 | `1.25px` | 4 | 37.5% → 50% → 62.5% → 75% |
| 5 | `2.5px` | 5 | 50% → 62.5% → 75% → 87.5% |
| 6 | `5px` | 6 | 62.5% → 75% → 87.5% → 100% |
| 7 | `10px` | 7 | 75% → 87.5% → 100% |
| 8 | `20px` | 8 | 87.5% → 100% |

Pattern: blur = `20 / 2^(8-layer)`, mask shift = `(layer-1) * 12.5%`

## CSS

```css
/* Nav bar - fully transparent, no background */
.bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1002;
    border-top: none;
    box-shadow: none;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    transform: translateY(100%);
    transition: transform 0.7s cubic-bezier(0.76, 0, 0.24, 1) !important;
}

/* Progressive blur container - covers nav + fade zone above */
.nav-blur-fade {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 140px;
    z-index: 1001;
    pointer-events: none;
    transform: translateY(100%);
    transition: transform 0.7s cubic-bezier(0.76, 0, 0.24, 1) !important;
}
.nav-blur-fade.nav-visible {
    transform: translateY(0);
}
.nav-blur-fade > div {
    opacity: 1;
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* 8 blur layers - exact ClearPath values */
.nav-blur-1 {
    z-index: 1;
    backdrop-filter: blur(0.15625px);
    -webkit-backdrop-filter: blur(0.15625px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%);
}
.nav-blur-2 {
    z-index: 2;
    backdrop-filter: blur(0.3125px);
    -webkit-backdrop-filter: blur(0.3125px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,0) 50%);
}
.nav-blur-3 {
    z-index: 3;
    backdrop-filter: blur(0.625px);
    -webkit-backdrop-filter: blur(0.625px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,1) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 62.5%);
}
.nav-blur-4 {
    z-index: 4;
    backdrop-filter: blur(1.25px);
    -webkit-backdrop-filter: blur(1.25px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 37.5%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,0) 75%);
}
.nav-blur-5 {
    z-index: 5;
    backdrop-filter: blur(2.5px);
    -webkit-backdrop-filter: blur(2.5px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,0) 87.5%);
}
.nav-blur-6 {
    z-index: 6;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 62.5%, rgba(0,0,0,1) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%);
}
.nav-blur-7 {
    z-index: 7;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 75%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,1) 100%);
}
.nav-blur-8 {
    z-index: 8;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%);
}
```

## HTML

```html
<!-- ClearPath Progressive Blur Fade Zone -->
<div class="nav-blur-fade" id="nav-blur-fade">
    <div class="nav-blur-1"></div>
    <div class="nav-blur-2"></div>
    <div class="nav-blur-3"></div>
    <div class="nav-blur-4"></div>
    <div class="nav-blur-5"></div>
    <div class="nav-blur-6"></div>
    <div class="nav-blur-7"></div>
    <div class="nav-blur-8"></div>
</div>

<!-- Bottom Navigation (transparent, no background) -->
<nav class="bottom-nav" aria-label="Navigasi bawah">
    <div class="bottom-inner">
        <a href="#" class="nav-item active"><i class="fa-solid fa-house"></i><span>Beranda</span></a>
        <a class="nav-item"><i class="fa-solid fa-folder-open"></i><span>Dokumen</span></a>
        <a class="nav-item"><i class="fa-solid fa-th-large"></i><span>Aplikasi</span></a>
        <a class="nav-item"><i class="fa-solid fa-book-open"></i><span>Edukasi</span></a>
        <a class="nav-item"><i class="fa-solid fa-calendar-check"></i><span>Jadwal</span></a>
    </div>
</nav>
```

## JavaScript (Show/Hide on Scroll)

```javascript
(function() {
    var nav = document.querySelector('.bottom-nav');
    var blurFade = document.getElementById('nav-blur-fade');
    if (!nav) return;
    var threshold = 50;
    window.addEventListener('scroll', function() {
        if (window.scrollY > threshold) {
            nav.classList.add('nav-visible');
            if (blurFade) blurFade.classList.add('nav-visible');
        } else {
            nav.classList.remove('nav-visible');
            if (blurFade) blurFade.classList.remove('nav-visible');
        }
    }, { passive: true });
})();
```

## Cara Kerja

1. 8 div layer ditumpuk dengan `position: absolute; inset: 0`
2. Setiap layer punya `backdrop-filter: blur()` yang makin kuat (2x lipat)
3. `mask-image: linear-gradient()` membatasi area blur tiap layer ke band 12.5%
4. Hasilnya: konten di belakang blur secara gradual dari tajam (atas) ke blur penuh (bawah)
5. Tidak ada background color - efek murni dari blur saja

## Adaptasi Arah

- **Header (top):** gunakan `to top` - blur makin kuat ke atas
- **Bottom nav:** gunakan `to bottom` - blur makin kuat ke bawah
- **Sidebar kiri:** gunakan `to left`
- **Sidebar kanan:** gunakan `to right`
