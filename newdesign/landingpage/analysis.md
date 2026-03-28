# Complete Analysis - womenob.net

**Source:** Wayback Machine snapshot (Feb 22, 2026)
**Site:** WOMEN Obstetrics & Gynecology, Nashville TN
**URL:** https://www.womenob.net/

---

## 1. Technology Stack

| Technology | Details |
|-----------|---------|
| CMS | WordPress (multisite, site ID 398) |
| Theme | `2106-template` by PBHS (version 2120) |
| CSS Framework | Bootstrap 3.4.1 |
| Icons | Font Awesome 4.x + custom Symbols webfont |
| JavaScript | jQuery 1.11.1 |
| Forms | Gravity Forms 2.8.17 |
| Fonts | Adobe Typekit (kit `bnm0qvv`) - `franklin-gothic-urw` |
| Analytics | Cloudflare Insights |
| Hosting | PBHS Hosting |
| CDN | Cloudflare |
| Accessibility | PBHS Accessibility Wheel (custom) |

## 2. Fonts

**Primary:** `franklin-gothic-urw, Helvetica, Arial, sans-serif`
- Loaded via Adobe Typekit: `https://use.typekit.net/bnm0qvv.js`
- Base size: 62.5% (10px), body: 1.8rem (18px)
- Headings: weight 400 (normal), uppercase

| Element | Size | Weight |
|---------|------|--------|
| h1 | 3rem (30px) | 400 |
| h2 | 2.4rem (24px) | 400 |
| h3 | 2rem (20px) | 400 |
| h4 | 1.6rem (16px) | 400 |
| h5 | 1.4rem (14px) | 400 |
| h6 | 1.2rem (12px) | 400 |
| .btn | 2.6rem (26px) | - |
| p | 1.8rem (18px) | 400, text-align: justify |
| footer | 1.4rem (14px) | - |

**Custom Symbols Font:**
- `sym-arrow-right` → `\0021`
- `sym-arrow-up` → `\0022`
- `sym-arrow-left` → `\0023`
- `sym-arrow-down` → `\0024`

## 3. Color Scheme

See `color-palette.css` for full details.

**Key colors:**
- Accent: `#a3b3b8` (soft blue-gray)
- Theme: `#206e93` (teal/dark cyan)
- Dark: `#333` / `#222`
- Light text: `#797979` / `#989898`
- Icons: `#dbdbdb`

## 4. Layout

See `structure.md` for full HTML breakdown.

**Key measurements:**
- Side panel: 320px fixed width
- Bucket cards: 400px each, full viewport height
- Footer: 90px fixed at bottom
- Content padding: 45px-60px in buckets
- Title padding: 60px left/right

## 5. Animations

See `animations.css` for full code with comments.

**12 animation effects total:**
1. Bucket hover overlay (slide direction varies odd/even)
2. Bucket content fade-in
3. Button color/background transitions
4. Background class transitions
5. Side nav hover background
6. Social links color hover
7. Footer height expansion
8. Contact panel slide-in
9. Scroll arrow opacity
10. Content transition bar
11. Image border color hover
12. Footer info icon hover

## 6. Navigation

See `navigation.md` for full tree structure.

**10 top-level items**, sub-pages for About, Meet Us, Gynecology, Pregnancy, Patient Information.

## 7. Images

See `images-map.md` for complete numbered catalog.

**7 homepage images** (1 logo + 6 bucket backgrounds)
**10 interior photos** (office/welcome page)

## 8. JavaScript Functionality

### Horizontal Scroll (Homepage)
- Custom scroll box with left/right arrows
- Overflow-x scroll with hidden scrollbar (`-ms-overflow-style: none`, `::-webkit-scrollbar { height: 0 }`)
- Arrows control scroll position

### Navigation
- Superfish-style vertical menu (`sf-menu sf-vertical`)
- Mobile slide-in menu via `sidr`
- Current page highlighting via `pbhs_menu_set_current_page()`

### Contact Form
- Gravity Forms embedded in slide-in panel
- Triggered by "Contact Us" buttons

### Accessibility Wheel
- 5 options: White on Black, Black on White, Font Up, Font Down, Reset
- Saves preferences to `localStorage`
- Fly animation on open

### Content Loading
- Page transition effects
- Loading indicator in header ("Loading ...")

## 9. SEO & Meta

```html
<title>Obstetrics and Gynecology Nashville TN, Obstetrician Gynecologist</title>
<meta name="description" content="Obstetrics and Gynecology in Nashville TN..."/>
<meta property="og:type" content="website"/>
<meta property="og:image" content="WOMEN-logo-black-1.jpg"/>
<meta property="og:image:width" content="1024"/>
<meta property="og:image:height" content="415"/>
<meta name="twitter:card" content="summary"/>
```

## 10. Responsive Design

| Breakpoint | Key Changes |
|-----------|-------------|
| >= 1200px | Full side panel + horizontal scroll buckets |
| 992-1199px | Side panel visible, buckets overflow both axes |
| 768-991px | Side panel visible, buckets stack vertically, overlays always visible |
| < 768px | Mobile hamburger menu, no side panel, stacked layout, no fixed footer |

## 11. External Integrations

- **Google Maps:** Embedded for office location
- **Instagram:** @womenobnashville
- **Adobe Typekit:** Font loading
- **Cloudflare:** CDN + analytics
- **Gravity Forms:** Contact form processing
