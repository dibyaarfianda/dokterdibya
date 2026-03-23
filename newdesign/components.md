# Anvil Component Specifications

Reference: https://anvil.framer.media/

## 1. Navbar (Fixed Top)

```
Position:       fixed, top 0, z-index 1000
Background:     rgba(12, 12, 12, 0.88)  (frosted dark)
Backdrop-filter: blur(24px)
Border-bottom:  1px solid rgba(255,255,255,0.08)
Height:         ~64px
Padding:        12px 16px (mobile), 14px 32px (desktop)
Max-width:      1200px centered
```

### Layout
```
[Brand Logo]                    [Bell] [Avatar]
 └ 72x14px logo                  40px   36px
```

### Sub-elements

| Element | Size | Style |
|---------|------|-------|
| Brand text | 20px / 700 | White + accent color on emphasis |
| Bell button | 40x40px circle | border: 1px solid rgba(255,255,255,0.14), bg: #141414 |
| Bell badge | 8x8px circle | bg: #e45858 (danger), border: 2px solid #141414 |
| Avatar | 36x36px circle | bg: accent color, text: dark, 14px/700 |
| Nav links | 14px / 500 | color: #a6a6a6, hover: #ffffff |

## 2. Welcome Hero Card

```
Background:     #1a1a1a (elevated)
Border:         1px solid rgba(255,255,255,0.08)
Border-radius:  12px
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Padding:        22px 20px
```

### Content Stack

1. **Label** — 10-11px, 600 weight, UPPERCASE, letter-spacing 0.22em, color #7d7d7d
2. **Name/Title** — 30px (mobile) → 40px (desktop), 700 weight, #ffffff, line-height 1.15
3. **Accent bar** — 36px width, 3px height, accent color, border-radius 2px
4. **Body text** — 13-14px, 400 weight, #a6a6a6, line-height 1.7
5. **Status badge** — pill (999px radius), 10px/600, uppercase, letter-spacing 0.18em

## 3. Quick Status Chips (Horizontal Scroll)

```
Container:      flex, gap 10px, overflow-x auto, scroll-snap-type: x mandatory
Scrollbar:      hidden (scrollbar-width: none)
```

### Each Chip
```
Min-width:      200px
Background:     #141414
Border:         1px solid rgba(255,255,255,0.08)
Border-radius:  12px
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Padding:        14px 16px
Layout:         flex row, gap 12px, items center
```

| Element | Size | Style |
|---------|------|-------|
| Icon circle | 40x40px | radius: 50%, bg: accent-soft (rgba), color: accent |
| Label | 10px / 600 | UPPERCASE, letter-spacing 0.18em, color: #ffffff |
| Value/meta | 12px / 400 | color: #a6a6a6 |

## 4. Collapsible Card

```
Background:     #141414
Border:         1px solid rgba(255,255,255,0.08)
Border-radius:  12px
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Overflow:       hidden
```

### Trigger (Header)
```
Padding:        18px 20px
Layout:         flex row, gap 12px, items center
Cursor:         pointer
Active bg:      rgba(255,255,255,0.03)
```

| Element | Style |
|---------|-------|
| Icon | 16px, accent color |
| Title | 11px / 600, UPPERCASE, letter-spacing 0.22em, #ffffff |
| Chevron | 13px, #7d7d7d, rotate(180deg) when open, transition 0.3s |

### Body (Collapsed)
```
Padding:        0 20px 20px
Display:        none (show when toggled)
Text:           13px / 400, #a6a6a6, line-height 1.75
```

## 5. Featured Card (Birth/Image Card)

```
Border-radius:  12px
Overflow:       hidden
Background:     #141414
Border:         1px solid rgba(255,255,255,0.08)
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
```

### Image Area
```
Aspect-ratio:   16 / 10
Overflow:       hidden
Background:     #111111 (fallback)
```

### Gradient Overlay
```
Position:       absolute bottom
Height:         100px
Background:     linear-gradient(to top, #141414 0%, transparent 100%)
```

### Body Content
```
Padding:        0 20px 24px
Margin-top:     -40px (overlaps image)
Z-index:        1
```

| Element | Style |
|---------|-------|
| Tag | 10px / 600, UPPERCASE, letter-spacing 0.28em, accent color |
| Title | 24px / 700, #ffffff, line-height 1.2 |
| Accent bar | 36px x 3px, accent color |
| Meta label | 10px / 500, UPPERCASE, letter-spacing 0.18em, #7d7d7d |
| Feature name | 20px / 700, accent color |

### Stats Grid (2x2)
```
Grid:           2 columns
Border:         1px solid rgba(255,255,255,0.08)
Border-radius:  10px
Cell padding:   14px 16px
Stat label:     10px / 600, UPPERCASE, letter-spacing 0.18em, #7d7d7d
Stat value:     15px / 600, #ffffff
```

## 6. Announcement Card

```
Background:     #141414
Border-radius:  12px
Border:         1px solid rgba(255,255,255,0.08)
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Padding:        20px
Cursor:         pointer
Active:         scale(0.98), transition 0.3s
```

### Header Row
```
Layout:         flex row, gap 12px, items center
```

| Element | Style |
|---------|-------|
| Icon circle | 36x36px, radius: 50%, bg: accent-soft, color: accent |
| Label | 10px / 600, UPPERCASE, letter-spacing 0.22em, accent color |
| Title | 15px / 600, #ffffff |

### Body
```
Font:           13px / 400, #a6a6a6, line-height 1.75
```

## 7. Action Card (Tanya Dokter)

```
Background:     #141414
Border-radius:  12px
Border:         1px solid rgba(255,255,255,0.08)
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Padding:        22px 20px
```

### Button Grid (2 columns)
```
Grid:           2 columns, gap 10px
```

### Primary Button
```
Background:     accent color (#ff2244)
Color:          #ffffff or #0c0c0c (depends on contrast need)
Border-radius:  10px
Padding:        12px 16px
Font:           12px / 600, UPPERCASE, letter-spacing 0.12em
Min-height:     44px
Active:         scale(0.97), brighter bg
Shadow:         var(--shadow-button)
```

### Secondary Button
```
Background:     transparent
Color:          #ffffff
Border:         1px solid rgba(255,255,255,0.14)
Border-radius:  10px
Padding:        12px 16px
Font:           12px / 600, UPPERCASE, letter-spacing 0.12em
Min-height:     44px
Active:         scale(0.97), bg rgba(255,255,255,0.04)
```

## 8. Menu Grid

```
Columns:        2 (mobile) → 3 (600px) → 4 (768px)
Gap:            10px (mobile), 12px (tablet+)
```

### Each Menu Tile
```
Background:     #141414
Border:         1px solid rgba(255,255,255,0.08)
Border-radius:  12px
Box-shadow:     0 8px 30px rgba(0,0,0,0.25)
Padding:        20px 12px 16px
Layout:         flex column, items center, text center
Cursor:         pointer
Active:         scale(0.96), bg: #1a1a1a
```

| Element | Style |
|---------|-------|
| Icon circle | 48px (mobile) / 56px (tablet), radius: 50%, tinted bg |
| Icon | 20px (mobile) / 24px (tablet), accent tint color |
| Title | 12-13px / 600, #ffffff |
| Subtitle | 10px / 400, #7d7d7d |
| Badge | 20x20px circle, bg: #e45858, text: #fff, 10px/600 |

## 9. Bottom Navigation (Fixed)

```
Position:       fixed, bottom 0, z-index 1000
Background:     rgba(12, 12, 12, 0.92)
Backdrop-filter: blur(24px)
Border-top:     1px solid rgba(255,255,255,0.08)
Padding-bottom: env(safe-area-inset-bottom)
```

### Inner Container
```
Max-width:      600px, centered
Layout:         flex, justify: space-around
Padding:        8px 0 6px
```

### Each Nav Item
```
Layout:         flex column, items center, gap 3px
Min-width:      64px
Min-height:     44px (touch target)
Active:         scale(0.9), transition 0.3s
```

| State | Icon | Label | Indicator |
|-------|------|-------|-----------|
| Inactive | 20px, #7d7d7d | 10px/500, UPPERCASE, 0.1em tracking, #7d7d7d | none |
| Active | 20px, accent color | 10px/500, UPPERCASE, accent color | 3px bar at top, accent color, 24px wide |

## 10. Input Fields

```
Height:         35px (compact) or 44px (standard)
Padding:        10px 12px
Background:     #141414
Border:         1px solid #292929
Border-radius:  10px
Font:           14px / 400, Inter
Color:          #ffffff
Placeholder:    #999999
Focus border:   accent color
```

## 11. Decorative Circle (Hero)

```
Size:           674x674px (desktop), 378x378px (mobile)
Position:       absolute, within hero section
Style:          Gradient-filled or blurred circle
Purpose:        Creates depth and visual interest behind hero content
```
