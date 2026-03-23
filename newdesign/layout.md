# Anvil Layout System

Reference: https://anvil.framer.media/

## Page Structure

```
┌─────────────────────────────────────┐
│  NAVBAR (fixed top, frosted dark)   │  z-index: 1000
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │     HERO SECTION            │    │  gradient bg, decorative circle
│  │     Display heading         │    │  600px height desktop
│  │     CTA + input             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  CONTENT SECTIONS           │    │  max-width: 900-1200px
│  │  Features / Services        │    │  alternating bg colors
│  │  Testimonials               │    │
│  │  Pricing                    │    │
│  │  FAQ                        │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     FOOTER                  │    │  centered, links + social
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  BOTTOM NAV (fixed, mobile only)    │  z-index: 1000
└─────────────────────────────────────┘
```

## Container Widths

| Context | Max-width | Usage |
|---------|-----------|-------|
| Full sections | 1200px | Hero, full-bleed sections |
| Content | 900px | Text-heavy sections, features |
| Mobile content | 600px | Patient portal mobile app |
| Centered text | 640px | Descriptions, body copy blocks |

## Spacing System

### Section Spacing

| Breakpoint | Vertical gap between sections | Horizontal padding |
|------------|-------------------------------|-------------------|
| Mobile (<600px) | 16px | 16px |
| Tablet (600px+) | 24px | 24px |
| Desktop (768px+) | 32-40px | 32px |
| Large (1200px+) | 40-80px | 40-80px |

### Card Internal Spacing

| Element | Padding |
|---------|---------|
| Standard card | 20px (mobile), 22-24px (tablet+) |
| Hero card | 22px 20px |
| Compact card | 14-16px |
| Button | 12px 16px |

### Component Gaps

| Context | Gap |
|---------|-----|
| Card elements (vertical) | 8-12px |
| Grid items | 10px (mobile), 12px (tablet) |
| Horizontal chips | 10px |
| Button group | 10px |
| Nav items | space-around |

## Responsive Breakpoints

Anvil uses three breakpoints (Framer defaults):

| Name | Range | Grid cols | Container |
|------|-------|-----------|-----------|
| Mobile | < 810px | 2 col menu | 100% - 32px |
| Tablet | 810px - 1199px | 3 col menu | 900px |
| Desktop | 1200px+ | 4 col menu | 1200px |

For dokterDIBYA patient portal adaptation (mobile-first):

| Name | Breakpoint | Grid cols | Container |
|------|-----------|-----------|-----------|
| Mobile base | default | 2 col menu | 100% - 32px padding |
| Tablet | min-width: 600px | 3 col menu | 600px |
| Desktop | min-width: 768px | 4 col menu | 640px |

## Grid Systems

### Menu Grid
```css
/* Mobile */
.menu-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

/* Tablet (600px+) */
@media (min-width: 600px) {
    .menu-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Desktop (768px+) */
@media (min-width: 768px) {
    .menu-grid { grid-template-columns: repeat(4, 1fr); }
}
```

### Stats Grid (2x2)
```css
.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
}
```

### Button Grid (2-col)
```css
.btn-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
```

## Content Offsets (Fixed Elements)

```css
.main-content {
    /* Clear fixed navbar */
    padding-top: calc(env(safe-area-inset-top, 0px) + 72px);

    /* Clear fixed bottom nav */
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
}
```

## Z-Index Layers

| Layer | Z-index | Element |
|-------|---------|---------|
| Base | 0 | Page content |
| Cards | auto | Cards, sections |
| Decorative | 1 | Hero circle, overlapping elements |
| Navbar | 1000 | Fixed top nav |
| Bottom nav | 1000 | Fixed bottom nav |
| Overlay | 1100 | Modals, drawers |
| Toast | 1200 | Notifications |

## Overflow Rules

- Page: no horizontal overflow at any viewport (320px minimum)
- Horizontal scroll: only on chip/status rows with hidden scrollbar
- Cards: overflow hidden (for image border-radius clipping)
- Body text: normal wrap, no truncation
- Chip subtitles: ellipsis truncation on single line
