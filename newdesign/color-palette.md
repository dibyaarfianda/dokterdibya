# Anvil Color Palette

Reference: https://anvil.framer.media/

## Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-page` | `#0c0c0c` | Main page background |
| `--bg-secondary` | `#111111` | Alternate section background |
| `--bg-card` | `#141414` | Card / surface default |
| `--bg-card-elevated` | `#1a1a1a` | Hover / active card, modals |
| `--bg-input` | `#141414` | Form input fields |
| `--bg-selection` | `#292929` | Text selection highlight |

### Hero Gradient
```css
background: linear-gradient(167.4deg, #141414 0%, #222222 47.87%, #141414 97.6%);
```
Diagonal gradient creating subtle depth on the hero section.

## Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#ffffff` | Headings, primary content, high contrast |
| `--text-body` | `#cccccc` | Default body copy |
| `--text-secondary` | `#a6a6a6` | Supporting text, descriptions |
| `--text-muted` | `#7d7d7d` | Captions, meta text, labels |
| `--text-placeholder` | `#999999` | Form placeholder text |
| `--text-disabled` | `#666666` | Disabled state text |

## Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#ff2244` | CTA buttons, links, active highlights |
| `--accent-primary-hover` | `#ff3355` | Hover state for primary accent |
| `--accent-primary-soft` | `rgba(255,34,68,0.15)` | Soft tint for badges, tag backgrounds |
| `--accent-success` | `#0c9100` | Success states, positive indicators |
| `--accent-success-soft` | `rgba(12,145,0,0.12)` | Soft success background |

## Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.08)` | Default card borders, dividers |
| `--border-medium` | `rgba(255,255,255,0.10)` | Mid-prominence borders |
| `--border-strong` | `rgba(255,255,255,0.14)` | Input borders, prominent dividers |
| `--border-input` | `#292929` | Input field borders |
| `--border-separator` | `rgba(255,255,255,0.06)` | Thin section dividers |

## Gray Scale (Full)

```
#ffffff  ████  White / primary text
#f8f8f8  ████  Light surface (rarely used)
#cccccc  ████  Body text
#aaaaaa  ████  Mid gray
#a6a6a6  ████  Secondary text
#999999  ████  Placeholder text
#7d7d7d  ████  Muted text
#666666  ████  Disabled text
#292929  ████  Input border / selection
#222222  ████  Gradient mid-point
#1a1a1a  ████  Elevated card
#141414  ████  Card surface
#111111  ████  Secondary bg
#0c0c0c  ████  Page background
```

## Adapting for dokterDIBYA

The Anvil palette uses `#ff2244` red as primary accent. For the patient portal, consider mapping:

| Anvil | dokterDIBYA Option | Purpose |
|-------|-------------------|---------|
| `#ff2244` red | Keep as-is or soften to `#e63950` | CTA buttons, active states |
| `#0c9100` green | `#34d399` or `#44b678` | Health/pregnancy positive states |
| Dark backgrounds | Keep exactly | Premium medical feel |

The dark monochromatic palette with a single bold accent is the core Anvil identity.
