# ClearPath Template — Full Analysis

Template therapy/coaching website dari Framer oleh Anton Drukarov (Templatoria).
URL: `https://clearpath-template.framer.website/`

---

## Daftar Isi

1. [Site Map & Section Breakdown](#1-site-map--section-breakdown)
2. [Design System](#2-design-system)
3. [Animation Catalog](#3-animation-catalog)
4. [Section Detail](#4-section-detail)
5. [Cara Kerja Teknis](#5-cara-kerja-teknis)

---

## 1. Site Map & Section Breakdown

Total **18 section** dari atas ke bawah:

| # | Section | Type | Layout |
|---|---------|------|--------|
| 1 | Hero | Headline + CTA | Single column, centered |
| 2 | Balance Intro | Feature intro + toggle visual | Single column |
| 3 | Services | 4 cards | 4-column grid |
| 4 | Philosophy | Mission statement | Centered text |
| 5 | Client Story 1 | Case study (Maya) | Text + image |
| 6 | How It Works | 3 steps | Vertical flow |
| 7 | CTA Mid-page | Call to action + trust badges | Centered |
| 8 | Pricing | 3 tiers + Monthly/Yearly toggle | 3-column grid |
| 9 | Approach | Values statement | Single column |
| 10 | Founder Quote | Blockquote | Centered |
| 11 | Client Story 2 | Case study (Lisa) | Text + image |
| 12 | Journal/Blog | 3 articles | 3-column grid |
| 13 | Impact Stats | 4 angka besar | 4-column grid |
| 14 | FAQ | 7 accordion items | Single column |
| 15 | Closing Reflection | Inspirational text | Centered |
| 16 | Book Session CTA | Form + trust badges | Centered |
| 17 | Template Promo | "Get this template" | Banner |
| 18 | Footer | Nav links + contact | Multi-column |

---

## 2. Design System

### Color Palette

```
Background utama  : #FFFFFF (putih bersih)
Background section: #F7F5F2 (warm off-white / cream)
Background dark   : #1A1A1A atau #0F0F0F (untuk section kontras)
Text primary      : #1A1A1A (near-black)
Text secondary    : #6B6B6B (warm gray)
Text muted        : #999999
Accent            : #3D5A4C atau #4A7C5E (sage green, khas wellness)
Accent hover      : darken 10%
Border            : #E8E4DF (warm light gray)
Card background   : #FFFFFF
Card shadow       : rgba(0,0,0,0.04) 0 2px 20px
```

### Typography

```
Font Heading : Serif (kemungkinan "Playfair Display", "DM Serif Display", atau custom Framer font)
Font Body    : Sans-serif ("Inter", "DM Sans", atau "Plus Jakarta Sans")

Hero heading  : 56-72px, font-weight: 700, line-height: 1.1, letter-spacing: -0.02em
Section heading: 36-48px, font-weight: 600, line-height: 1.2
Card title    : 20-24px, font-weight: 600
Body text     : 16-18px, font-weight: 400, line-height: 1.7
Label/kicker  : 12-14px, font-weight: 600, uppercase, letter-spacing: 0.1em
Button text   : 14-16px, font-weight: 500
```

### Spacing System

```
Section padding   : 120-160px vertical
Card padding      : 32-40px
Card gap          : 24px
Max content width : 1200px
Card border-radius: 12-16px
Button radius     : 8px atau 999px (pill)
Image radius      : 12-16px
```

### Buttons

```css
/* Primary CTA */
.btn-primary {
    background: #1A1A1A;
    color: #FFFFFF;
    padding: 14px 28px;
    border-radius: 999px;        /* pill shape */
    font-weight: 500;
    transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

/* Secondary / Ghost */
.btn-secondary {
    background: transparent;
    border: 1px solid #E8E4DF;
    color: #1A1A1A;
    padding: 14px 28px;
    border-radius: 999px;
}
```

---

## 3. Animation Catalog

Setiap animasi diberi nama untuk referensi dan reuse.

### 3.1 — "gentle-rise"
**Fade in + slide up saat masuk viewport.**
Animasi paling dasar dan paling sering dipakai. Hampir setiap section heading dan paragraph menggunakan ini.

```css
/* CSS Implementation */
.gentle-rise {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.8s cubic-bezier(0.25, 1, 0.5, 1),
                transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
}

.gentle-rise.visible {
    opacity: 1;
    transform: translateY(0);
}
```

```javascript
// JS — Intersection Observer
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.gentle-rise').forEach(el => observer.observe(el));
```

**Variasi:**
- Delay stagger untuk cards: child ke-1 delay 0ms, ke-2 delay 100ms, ke-3 delay 200ms
- Jarak translateY bervariasi: 20px (halus) sampai 40px (dramatis)

---

### 3.2 — "stagger-cards"
**Cards muncul satu per satu dengan delay bertingkat.**
Dipakai di Services grid, Pricing grid, Journal grid.

```css
.stagger-cards > * {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}

.stagger-cards.visible > *:nth-child(1) { transition-delay: 0ms; }
.stagger-cards.visible > *:nth-child(2) { transition-delay: 120ms; }
.stagger-cards.visible > *:nth-child(3) { transition-delay: 240ms; }
.stagger-cards.visible > *:nth-child(4) { transition-delay: 360ms; }

.stagger-cards.visible > * {
    opacity: 1;
    transform: translateY(0);
}
```

---

### 3.3 — "card-lift"
**Hover effect pada card — angkat + shadow.**
Dipakai pada service cards, pricing cards, journal cards.

```css
.card-lift {
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1),
                box-shadow 0.3s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.card-lift:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.08);
}
```

---

### 3.4 — "counter-roll"
**Angka bergulung dari 0 ke target saat masuk viewport.**
Dipakai di Impact Statistics section (420+, 50+, dll).

```javascript
function counterRoll(el, target, duration) {
    var start = 0;
    var startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        // ease-out curve
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(eased * target) + '+';
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// Trigger saat masuk viewport via IntersectionObserver
// duration: 1500-2000ms
```

---

### 3.5 — "accordion-smooth"
**FAQ item expand/collapse dengan height animation.**

```css
.accordion-body {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 0.5s cubic-bezier(0.25, 1, 0.5, 1),
                opacity 0.3s ease,
                padding 0.5s ease;
    padding: 0 24px;
}

.accordion-item.open .accordion-body {
    max-height: 300px;
    opacity: 1;
    padding: 0 24px 24px;
}

/* Icon rotation */
.accordion-icon {
    transition: transform 0.3s ease;
}
.accordion-item.open .accordion-icon {
    transform: rotate(45deg); /* plus → x */
}
```

---

### 3.6 — "text-reveal"
**Teks muncul per kata atau per baris dengan clip animation.**
Dipakai pada hero heading dan quote section.

```css
.text-reveal {
    clip-path: inset(0 0 100% 0);
    transform: translateY(20px);
    transition: clip-path 0.8s cubic-bezier(0.77, 0, 0.175, 1),
                transform 0.8s cubic-bezier(0.77, 0, 0.175, 1);
}

.text-reveal.visible {
    clip-path: inset(0 0 0% 0);
    transform: translateY(0);
}
```

---

### 3.7 — "image-parallax"
**Gambar bergerak lebih lambat dari scroll — efek kedalaman.**
Dipakai pada Client Story sections.

```javascript
function parallax(el, speed) {
    window.addEventListener('scroll', function() {
        var rect = el.getBoundingClientRect();
        var viewH = window.innerHeight;
        if (rect.bottom < 0 || rect.top > viewH) return;

        var center = (rect.top + rect.height / 2 - viewH / 2) / viewH;
        el.style.transform = 'translateY(' + (center * speed) + 'px)';
    }, { passive: true });
}

// speed: 30-60px range
// Image dalam container overflow:hidden agar tidak terlihat bergeser
```

---

### 3.8 — "toggle-flip"
**Switch/toggle animasi untuk Monthly/Yearly pricing.**

```css
.toggle-track {
    width: 200px;
    height: 40px;
    background: #F0EDE8;
    border-radius: 999px;
    position: relative;
    cursor: pointer;
}

.toggle-thumb {
    position: absolute;
    top: 4px;
    left: 4px;
    width: calc(50% - 4px);
    height: 32px;
    background: #FFFFFF;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

.toggle-track.yearly .toggle-thumb {
    transform: translateX(100%);
}

/* Price number transition */
.price-value {
    transition: opacity 0.2s, transform 0.2s;
}
.price-value.switching {
    opacity: 0;
    transform: translateY(-8px);
}
```

---

### 3.9 — "scale-in"
**Element muncul dari skala kecil ke normal.**
Dipakai pada decorative elements, icons, badges.

```css
.scale-in {
    opacity: 0;
    transform: scale(0.85);
    transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.scale-in.visible {
    opacity: 1;
    transform: scale(1);
}
```

---

### 3.10 — "soft-blur-in"
**Element muncul dari blur ke fokus.**
Efek premium yang dipakai pada section-section penting.

```css
.soft-blur-in {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(16px);
    transition: opacity 0.7s ease,
                filter 0.7s ease,
                transform 0.7s cubic-bezier(0.25, 1, 0.5, 1);
}

.soft-blur-in.visible {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
}
```

---

### 3.11 — "slide-from-side"
**Element masuk dari kiri atau kanan.**
Dipakai pada Client Story (gambar dari satu sisi, teks dari sisi lain).

```css
.slide-left {
    opacity: 0;
    transform: translateX(-40px);
    transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
}

.slide-right {
    opacity: 0;
    transform: translateX(40px);
    transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
}

.slide-left.visible,
.slide-right.visible {
    opacity: 1;
    transform: translateX(0);
}
```

---

### 3.12 — "line-draw"
**Garis dekoratif yang "digambar" saat scroll.**
Sering dipakai Framer template sebagai section divider.

```css
.line-draw {
    width: 0;
    height: 1px;
    background: #E8E4DF;
    transition: width 1s cubic-bezier(0.25, 1, 0.5, 1);
}

.line-draw.visible {
    width: 100%;
}
```

---

## 4. Section Detail

### Hero Section
```
Headline    : "A Path That Shapes Your Future."
Subheadline : "We offer therapy and coaching to help you navigate life's
               challenges with confidence and care..."
CTA Button  : "Start your journey" (pill button, dark bg)
Animasi     : text-reveal pada heading, gentle-rise pada subtext, scale-in pada button
Background  : Clean white atau very light cream
```

### Services Section (4 Cards)
```
Cards:
1. Mindfulness & Stress Support
2. Individual Therapy
3. Clarity Consult
4. Life Coaching

Setiap card: icon + title + description + "read more" link
Animasi masuk : stagger-cards
Animasi hover : card-lift
Layout        : 4 columns (mobile: 1 column stacked)
```

### Client Stories (2x)
```
Story 1: "Finding balance after burnout." — Maya
Story 2: "Starting over and finding herself in the process." — Lisa

Layout   : Split — image satu sisi, text sisi lain
Animasi  : slide-from-side (image dari kiri, text dari kanan)
Image    : Soft rounded corners, mungkin parallax
```

### How It Works (3 Steps)
```
1. "Reach Out" — introductory call
2. "Define Direction" — shape a path
3. "Meet & Reflect" — ongoing sessions

Layout  : Vertical, numbered steps
Animasi : stagger-cards dengan delay lebih panjang (200ms antar step)
Visual  : Step number besar (01, 02, 03) + title + description
```

### Pricing Section
```
Toggle   : Monthly / Yearly (20% OFF) — toggle-flip animation
3 Tiers  : Starter $49, Growth $89, Complete $229
Card tengah (Growth) kemungkinan highlighted/featured
Animasi  : stagger-cards, price switching saat toggle
```

### Impact Stats
```
4 angka : 420+ sessions, 50+ clients, X+ years, X+ programs
Animasi : counter-roll (angka bergulung dari 0)
Layout  : 4-column grid
Font    : Angka besar 48-64px, bold
```

### FAQ Section
```
7 accordion items
Animasi expand : accordion-smooth
Icon           : Plus (+) rotate ke X saat open
Layout         : Single column, max-width ~700px
```

### Founder Quote
```
"What we don't need in the midst of struggle is shame for being human."
— Anna Keller, Therapist & Founder of ClearPath

Animasi : text-reveal atau gentle-rise
Style   : Large italic serif font, centered
```

---

## 5. Cara Kerja Teknis

### Framer Rendering Engine
Framer menggunakan React + Framer Motion di balik layar:
- Setiap section adalah React component
- Animasi menggunakan `framer-motion` library (variants, whileInView, etc)
- Layout menggunakan CSS Grid + Flexbox
- Responsive via Framer's built-in breakpoint system (desktop, tablet, mobile)

### Pola Animasi Framer yang Dipakai

```javascript
// Framer Motion — typical component animation
<motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{
        duration: 0.8,
        ease: [0.25, 1, 0.5, 1]  // custom ease (ease-out-quart)
    }}
>
    {children}
</motion.div>
```

### Implementasi Vanilla JS (tanpa Framer)

Semua animasi di atas bisa diimplementasikan dengan:

1. **CSS transitions + classes** — untuk semua animasi appear
2. **IntersectionObserver** — untuk trigger saat masuk viewport
3. **requestAnimationFrame** — untuk counter dan parallax
4. **CSS max-height transition** — untuk accordion

```javascript
// Universal scroll-trigger observer
function createScrollTrigger(selector, options) {
    var defaults = { threshold: 0.15, rootMargin: '0px 0px -50px 0px' };
    var opts = Object.assign({}, defaults, options);

    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                if (!opts.repeat) observer.unobserve(entry.target);
            }
        });
    }, { threshold: opts.threshold, rootMargin: opts.rootMargin });

    document.querySelectorAll(selector).forEach(function(el) {
        observer.observe(el);
    });
}

// Usage
createScrollTrigger('.gentle-rise');
createScrollTrigger('.stagger-cards');
createScrollTrigger('.counter-roll', { threshold: 0.3 });
```

### Key CSS Easing Curves

```css
/* Framer default ease — smooth deceleration */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

/* Untuk bounce-like feel */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Untuk accordion / height transitions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Untuk text reveal / clip-path */
--ease-expo: cubic-bezier(0.77, 0, 0.175, 1);
```

---

## Quick Reference: Animation Names

| Nama | Efek | Dipakai Di |
|------|------|------------|
| `gentle-rise` | Fade + slide up | Headings, paragraphs, hampir semua |
| `stagger-cards` | Cards muncul bertingkat | Service, pricing, journal grids |
| `card-lift` | Hover angkat + shadow | Semua cards |
| `counter-roll` | Angka bergulung 0→target | Stats section |
| `accordion-smooth` | Expand/collapse halus | FAQ |
| `text-reveal` | Clip-path text unveil | Hero heading, quote |
| `image-parallax` | Gambar gerak lambat | Client stories |
| `toggle-flip` | Switch slide animation | Pricing monthly/yearly |
| `scale-in` | Muncul dari kecil | Icons, badges, decorative |
| `soft-blur-in` | Blur → fokus | Section penting |
| `slide-from-side` | Masuk dari kiri/kanan | Client stories split |
| `line-draw` | Garis tergambar | Section dividers |
