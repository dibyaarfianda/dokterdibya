# Anvil Visual Effects

Reference: https://anvil.framer.media/

## Shadows

### Card Shadow (Default)
```css
box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
```
Soft, deep shadow. On dark backgrounds this creates a subtle "lift" effect.

### Card Shadow (Hover/Active)
```css
box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
```
Slightly stronger on interaction.

### Button Shadow (Multi-layer)
```css
box-shadow:
    0 0.6px 0.6px -1.25px rgba(0, 0, 0, 0.18),
    0 2.3px 2.3px -2.5px rgba(0, 0, 0, 0.16),
    0 10px 10px -3.75px rgba(0, 0, 0, 0.08);
```
Three-layer shadow for realistic depth on buttons.

### Elevated Shadow
```css
box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
```
For modals, popovers, elevated content.

## Gradients

### Hero Background
```css
background: linear-gradient(167.4deg, #141414 0%, #222222 47.87%, #141414 97.6%);
```
Diagonal gradient creating depth. Lighter in center (#222), darker at edges (#141414).

### Image Overlay (Bottom Fade)
```css
background: linear-gradient(to top, #141414 0%, transparent 100%);
height: 100px;
position: absolute;
bottom: 0;
```
Fades image into card background for seamless text overlay.

### Mobile Mask Effect
```css
background: linear-gradient(rgba(0,0,0,0.5) 0%, transparent 55%);
```
Top-down fade for mobile hero area.

## Borders

### Subtle Border (Cards)
```css
border: 1px solid rgba(255, 255, 255, 0.08);
```
Barely visible on dark bg. Creates card definition without harsh edges.

### Strong Border (Inputs, Buttons)
```css
border: 1px solid rgba(255, 255, 255, 0.14);
```
More visible for interactive elements.

### Solid Border (Inputs)
```css
border: 1px solid #292929;
```
For form inputs — solid, clear boundary.

### Separator Line
```css
border-bottom: 1px solid rgba(255, 255, 255, 0.06);
/* or */
border-bottom: 3px solid var(--accent-primary);  /* Accent separator */
```

## Backdrop Filter (Frosted Glass)

### Navbar
```css
background: rgba(12, 12, 12, 0.88);
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
```

### Bottom Nav
```css
background: rgba(12, 12, 12, 0.92);
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
```

Slightly higher opacity on bottom nav for stronger contrast.

## Animations

### Entrance Animation (Fade + Slide Up)
```css
@keyframes fadeSlideUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-in {
    animation: fadeSlideUp 0.5s ease both;
}
```

### Staggered Delays
```css
.delay-1 { animation-delay: 0.05s; }
.delay-2 { animation-delay: 0.10s; }
.delay-3 { animation-delay: 0.15s; }
.delay-4 { animation-delay: 0.20s; }
.delay-5 { animation-delay: 0.25s; }
.delay-6 { animation-delay: 0.30s; }
.delay-7 { animation-delay: 0.35s; }
.delay-8 { animation-delay: 0.40s; }
```

50ms stagger between each section.

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

## Transitions

| Element | Transition | Duration |
|---------|------------|----------|
| Buttons (all states) | all | 0.3s ease |
| Chevron rotation | transform | 0.3s ease |
| Nav link color | color | 0.3s ease |
| Card hover | transform, box-shadow | 0.3s ease |
| Background color | background | 0.3s ease |

## Interactive States

### Button :active
```css
transform: scale(0.97);
/* Primary: brighter background */
/* Secondary: subtle background rgba(255,255,255,0.04) */
```

### Card :active
```css
transform: scale(0.96) to scale(0.98);
background: var(--bg-card-elevated);  /* #1a1a1a */
```

### Nav item :active
```css
transform: scale(0.9);
```

### Input :focus
```css
border-color: var(--accent-primary);
outline: none;
```

## Decorative Elements

### Hero Circle
```
Size: 674x674px (desktop), 378x378px (mobile)
Position: absolute within hero
Style: Gradient or blurred circle
Purpose: Creates visual depth and movement
```

### Accent Bars
```css
/* Under headings */
.accent-bar {
    width: 36px;
    height: 3px;
    background: var(--accent-primary);
    border-radius: 2px;
}
```

### Active Indicator (Bottom Nav)
```css
/* Gold/accent bar on active nav item */
.active::after {
    content: '';
    position: absolute;
    top: 0;
    width: 24px;
    height: 3px;
    background: var(--accent-primary);
    border-radius: 0 0 3px 3px;
}
```

## Text Selection
```css
::selection {
    background: #292929;
    color: #ffffff;
}
```

## Tap Highlight
```css
* {
    -webkit-tap-highlight-color: transparent;
}
```
