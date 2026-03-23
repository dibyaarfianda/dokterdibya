# Anvil Typography System

Reference: https://anvil.framer.media/

## Font Families

| Role | Font | Fallback | CDN |
|------|------|----------|-----|
| Primary | Inter | Arial, sans-serif | `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap` |
| Secondary | Roboto | Arial, sans-serif | `https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap` |

Inter is used for all UI text. Roboto appears as a secondary/fallback in some elements.

## Type Scale

### Mobile Base (375px)

| Element | Size | Weight | Line-height | Letter-spacing | Transform |
|---------|------|--------|-------------|----------------|-----------|
| Display (hero) | 48px | 700 | 1.15 | -0.02em | none |
| H1 (page title) | 36px | 700 | 1.15 | -0.02em | none |
| H2 (section head) | 28px | 700 | 1.25 | 0 | none |
| H3 (card title) | 20px | 600 | 1.25 | 0 | none |
| H4 (subsection) | 17px | 600 | 1.3 | 0 | none |
| Body large | 16px | 400 | 1.5 | 0 | none |
| Body default | 14px | 400 | 1.5 | 0 | none |
| Body small | 13px | 400 | 1.6 | 0 | none |
| Caption | 12px | 500 | 1.4 | 0 | none |
| Label | 11px | 600 | 1.3 | 0.18em | UPPERCASE |
| Micro label | 10px | 600 | 1.2 | 0.28em | UPPERCASE |

### Tablet (600px+)

| Element | Size | Change |
|---------|------|--------|
| Display | 56px | +8px |
| H1 | 42px | +6px |
| H2 | 32px | +4px |

### Desktop (768px+)

| Element | Size | Change |
|---------|------|--------|
| Display | 64px | +8px |
| H1 | 48px | +6px |
| H2 | 36px | +4px |

### Large Desktop (1200px+)

| Element | Size | Change |
|---------|------|--------|
| Display | 72px | +8px |
| H1 | 56px | +8px |
| H2 | 40px | +4px |

## Weight Usage

| Weight | Name | Usage |
|--------|------|-------|
| 400 | Regular | Body copy, descriptions, form text |
| 500 | Medium | Captions, meta text, nav links |
| 600 | SemiBold | Card titles, labels, buttons, section heads |
| 700 | Bold | Display headings, hero text, brand |

## Key Typography Patterns

### Uppercase Labels (Signature Anvil Pattern)
```css
.label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-muted);   /* #7d7d7d */
}
```

### Hero Heading
```css
.hero-heading {
    font-size: 48px;            /* scales to 72px at 1200px+ */
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;    /* tight tracking for large text */
    color: var(--text-primary); /* #ffffff */
}
```

### Body Copy
```css
.body-text {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--text-secondary); /* #a6a6a6 */
}
```

### Card Title
```css
.card-title {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
}
```

## Contrast Ratio (WCAG)

| Text | BG | Ratio | Pass |
|------|----|-------|------|
| #ffffff on #0c0c0c | 19.7:1 | AAA |
| #ffffff on #141414 | 17.3:1 | AAA |
| #cccccc on #0c0c0c | 13.7:1 | AAA |
| #a6a6a6 on #0c0c0c | 9.1:1 | AAA |
| #7d7d7d on #0c0c0c | 5.3:1 | AA |
| #999999 on #141414 | 6.8:1 | AA |
| #666666 on #0c0c0c | 3.5:1 | AA (large only) |

## dokterDIBYA Adaptation Note

The Inter font with tight-tracking display + wide-tracking uppercase labels creates Anvil's editorial, professional feel. This is very different from the current Poppins usage. Inter is more neutral and technical — good for a medical portal conveying trust.
