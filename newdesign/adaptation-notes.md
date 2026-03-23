# Adapting Anvil Design for dokterDIBYA Patient Portal

## What Makes Anvil Special

Anvil's design identity comes from five core traits:
1. **Deep dark palette** — #0c0c0c page, #141414 cards, near-black everything
2. **Single bold accent** — #ff2244 red used sparingly but decisively
3. **Inter font** — neutral, technical, trustworthy at all sizes
4. **Uppercase editorial labels** — 10-11px, 600 weight, 0.18-0.28em tracking
5. **Subtle card depth** — thin rgba borders + soft shadow on dark surfaces

## Accent Color Decision

Anvil uses `#ff2244` (vivid red). Options for patient portal:

| Option | Hex | Rationale |
|--------|-----|-----------|
| Keep red | `#ff2244` | Bold, high-energy, matches Anvil exactly |
| Warm red | `#e63950` | Softer, more approachable for medical context |
| Coral | `#ff6b6b` | Warm, friendly, less aggressive |
| Gold | `#c9a96e` | Premium feel (current Franco prototype uses this) |
| Teal | `#2dd4bf` | Medical/health association, calming |

**Recommendation:** Keep `#ff2244` or soften to `#e63950`. The bold accent on dark creates the Anvil identity. Going too soft loses the character.

## Font Change: Poppins → Inter

| Aspect | Poppins (current) | Inter (Anvil) |
|--------|-------------------|---------------|
| Feel | Rounded, friendly, warm | Neutral, technical, precise |
| Medical context | Approachable | Trustworthy, clinical |
| Readability | Good | Excellent (designed for screens) |
| Weight range | 300-900 | 300-700 |
| Label style | Less impactful uppercase | Excellent uppercase labels |

Inter is a better fit for a medical portal that needs to feel professional and trustworthy.

## Key Adaptations Needed

### 1. Navbar
- **Anvil**: Dark frosted, logo left, links center, CTA right
- **Portal**: Dark frosted, brand left (dokterDIBYA), bell + avatar right
- **Keep**: Frosted glass effect, thin bottom border, fixed position
- **Change**: No center nav links (single-page app), add subtitle under brand

### 2. Hero → Welcome Card
- **Anvil**: Full-width gradient hero, 600px tall, decorative circle
- **Portal**: Contained card with patient name and status
- **Keep**: Uppercase tag, bold heading, accent bar, body text
- **Add**: Pregnancy badge, left border accent (optional)
- **Skip**: Full-width hero (portal is card-based), decorative circle

### 3. Features → Menu Grid
- **Anvil**: 3-col feature cards with icon + title + description
- **Portal**: 2/3/4-col menu tiles with icon circle + title + subtitle
- **Keep**: Card style (border + shadow), grid layout, 12px radius
- **Change**: Smaller tiles, circular icon containers, tap feedback

### 4. Testimonials → Announcements
- **Anvil**: Quote cards with attribution
- **Portal**: Announcement cards with icon + label + title + body
- **Keep**: Card structure, accent icon circle, body text style
- **Change**: Different content structure

### 5. CTA → Tanya Dokter
- **Anvil**: Input + button CTA block
- **Portal**: Two-button action card (Tanya Baru / Riwayat)
- **Keep**: Card wrapper, bold label, button styles
- **Adapt**: Primary (filled accent) + Secondary (transparent border) buttons

### 6. Footer → Bottom Nav
- **Anvil**: Full footer with columns of links
- **Portal**: Fixed bottom nav with 3 items
- **Keep**: Frosted dark glass, thin top border
- **Change**: 3 icon+label items, active indicator bar

## What to Skip from Anvil

These Anvil elements don't apply to the patient portal:

- [ ] Full-width hero section (portal uses cards)
- [ ] Decorative circle element (too abstract for medical)
- [ ] Logo row / social proof (not applicable)
- [ ] Pricing tiers (no pricing in patient portal)
- [ ] Email input CTAs (already authenticated)
- [ ] Multi-page navigation (SPA pattern)

## What to Keep Exactly

These Anvil patterns must be preserved to maintain the design identity:

- [x] Dark background hierarchy (#0c0c0c → #141414 → #1a1a1a)
- [x] Thin rgba borders on every card
- [x] 12px card border-radius (NOT 2-4px like Martin)
- [x] Inter font with bold headings + regular body
- [x] Uppercase labels with wide letter-spacing
- [x] Accent bar under headings (36px × 3px)
- [x] Frosted glass on navbar + bottom nav
- [x] 0.3s ease transitions
- [x] Fade + slideUp entrance animations
- [x] scale(0.96-0.98) active press feedback
- [x] 44px minimum touch targets

## CSS Variable Mapping (Current → Anvil)

```css
/* Current Franco prototype → Anvil adaptation */

/* Backgrounds */
--bg-primary:       #0c0c0c;     /* was #0c0c0c (same) */
--bg-card:          #141414;     /* was #141414 (same) */
--bg-card-elevated: #1a1a1a;     /* was #1a1a1a (same) */

/* The dark palette is nearly identical to Franco. Main change is accent. */

/* Accent */
--accent-primary:   #ff2244;     /* was #c9a96e gold → now Anvil red */
--accent-soft:      rgba(255, 34, 68, 0.15);  /* was gold soft */

/* Text stays the same dark-on-dark hierarchy */
--text-primary:     #ffffff;
--text-secondary:   #a6a6a6;
--text-muted:       #7d7d7d;

/* Typography */
--font-primary:     'Inter', Arial, sans-serif;  /* was 'DM Sans' */
```

## Implementation Priority

1. **Update CSS variables** — swap accent color + font family
2. **Replace font CDN** — DM Sans → Inter (with weights 400, 500, 600, 700)
3. **Keep card structure** — same border/shadow/radius (already close)
4. **Update button styles** — accent bg + transparent border secondary
5. **Refine labels** — ensure all labels use uppercase + wide letter-spacing
6. **Add accent bars** — 36px × 3px under key headings

Since the current Franco prototype already uses a dark palette with similar card structure, adapting to Anvil is primarily a **color accent + font swap** rather than a full redesign.
