# Prompt for Claude: Best-Possible Patient Portal Redesign Using Local New Design System

You are a senior product designer and frontend engineer.

Your task is to create a standalone HTML prototype for a completely reimagined dokterDIBYA patient portal using the local design package in `c:\dokterdibya\newdesign` as the primary visual and UX source of truth.

This is not a small reskin. You are explicitly allowed to rethink the entire portal UI/UX from scratch.

You may:
- change the layout completely
- remove the current card-based structure entirely
- reorganize hierarchy and section order
- replace grids with editorial sections, timelines, split layouts, docked actions, or any other approach
- change navigation patterns if the result is better for patient usability
- introduce a brand new visual language as long as it is grounded in the local `newdesign` system

You must keep the product recognizable as a patient portal, but you do not need to preserve the current structure one-to-one.

## Primary Design Reference

Use the local folder below as the main reference:

- `c:\dokterdibya\newdesign\README.md`
- `c:\dokterdibya\newdesign\design-tokens.css`
- `c:\dokterdibya\newdesign\typography.md`
- `c:\dokterdibya\newdesign\color-palette.md`
- `c:\dokterdibya\newdesign\components.md`
- `c:\dokterdibya\newdesign\layout.md`
- `c:\dokterdibya\newdesign\visual-effects.md`
- `c:\dokterdibya\newdesign\page-structure.md`
- `c:\dokterdibya\newdesign\adaptation-notes.md`

The design package is Anvil-inspired: dark, minimal, editorial, monochromatic, sharp hierarchy, Inter typography, thin borders, restrained depth, and a decisive accent color.

## Output Required

Create one file only:

- `public/prototype-modern-ui.html`

The file must be self-contained:

- HTML + embedded CSS + minimal vanilla JS only when necessary
- no frameworks
- no API calls
- no authentication logic
- no build step
- static placeholder content only

## Mission

Design the best patient portal homepage/dashboard you can, using the local `newdesign` system as your foundation.

Do not think in terms of "adapt the old page section by section".
Think in terms of:

- What should a modern patient feel first on opening the portal?
- What information deserves priority?
- What actions should be most discoverable?
- What layout creates trust, calm, confidence, and premium quality?
- What interaction model feels genuinely better than the existing portal?

Your job is to produce the strongest design you can, not the safest or most literal one.

## Product Constraints

The result still needs to function conceptually as a patient portal. Make these capabilities visible somewhere in the design, even if their presentation changes dramatically:

- patient identity / welcome context
- medical documents access
- appointments / schedule visibility
- education / article access
- doctor communication / question flow
- billing or payment visibility
- notifications or updates
- profile/account access

You may merge, reprioritize, or reinterpret these into a new IA if that improves the experience.

## Hard Rules

- Follow project rules from `CLAUDE.md`
- Do not use `vh` units anywhere because Android WebView is unreliable with viewport height
- Use mobile-first CSS only
- Use only `min-width` breakpoints
- Ensure no horizontal overflow at 320px width
- Ensure all touch targets are at least 40px
- Add `-webkit-tap-highlight-color: transparent`
- Respect `prefers-reduced-motion`
- Keep it deployable as a plain static HTML file

## Source Files to Read Before Designing

Reference only, do not modify:

- `CLAUDE.md`
- `public/patient-menu.html`
- everything inside `c:\dokterdibya\newdesign`

## Design Direction

Use the `newdesign` package faithfully, but do not let it trap you into copying a landing page pattern blindly.

Translate its core traits into a patient portal product:

- deep dark background hierarchy
- restrained monochrome palette
- one decisive accent color
- Inter typography
- uppercase editorial labels with wide tracking
- strong display headlines with tight tracking
- subtle borders on surfaces
- soft dark shadows, not bright glows
- frosted navigation layers
- premium but practical interaction design

The portal should feel:

- premium
- calm
- modern
- medically trustworthy
- product-grade, not template-grade

## Visual System

Base your CSS variables on the local tokens from `design-tokens.css`.

Use this as the starting point:

```css
:root {
    --bg-page: #0c0c0c;
    --bg-secondary: #111111;
    --bg-card: #141414;
    --bg-card-elevated: #1a1a1a;
    --gradient-hero: linear-gradient(167.4deg, #141414 0%, #222222 47.87%, #141414 97.6%);

    --text-primary: #ffffff;
    --text-body: #cccccc;
    --text-secondary: #a6a6a6;
    --text-muted: #7d7d7d;

    --accent-primary: #ff2244;
    --accent-primary-hover: #ff3355;
    --accent-primary-soft: rgba(255, 34, 68, 0.15);
    --accent-success: #0c9100;
    --accent-success-soft: rgba(12, 145, 0, 0.12);

    --border-subtle: rgba(255, 255, 255, 0.08);
    --border-medium: rgba(255, 255, 255, 0.10);
    --border-strong: rgba(255, 255, 255, 0.14);

    --font-primary: 'Inter', Arial, sans-serif;
}
```

If you believe a softened variant of the accent would better suit the medical context, you may adjust it slightly, but stay within the spirit of the local design system.

## Typography

Use Inter as the main font.

Use the local type logic:

- display: 48px mobile, scaling upward at larger breakpoints
- h1: 36px mobile
- h2: 28px mobile
- h3: 20px mobile
- body: 14px
- labels: 11px uppercase with `0.18em` tracking
- micro labels: 10px uppercase with `0.28em` tracking

Keep the Anvil editorial contrast:

- bold large headings
- regular readable body copy
- uppercase tracked labels for section framing

## Layout Freedom

You are free to use any layout system that best serves the portal, including combinations of:

- editorial hero + compact action rail
- stacked sections with alternating density
- asymmetric content blocks
- timeline-like health summaries
- split-pane areas
- docked bottom navigation
- spotlight sections instead of uniform cards
- compact list modules instead of tiles

Cards are optional. You may use few cards, many cards, or no traditional cards at all.

## Functional Content to Represent

Use placeholder data relevant to dokterDIBYA and Indonesian patient context.

Make sure the prototype visibly includes equivalents for:

- a personalized welcome or patient header
- current appointment or booking state
- recent or important medical document access
- a doctor communication entry point
- a notification or announcement mechanism
- a fast path to common actions
- profile/account presence

These do not need to appear as separate boxes. They can be merged into a stronger new flow.

## Interaction Guidance

If you add interactions, keep them minimal and purposeful:

- accordion or reveal sections are acceptable
- active/tap feedback should be subtle
- transitions should use the local token timing
- do not depend on hover for core functionality

## Navigation Guidance

You may redesign navigation completely.

Allowed patterns include:

- fixed top nav + fixed bottom nav
- top nav + floating command bar
- docked utility actions
- segmented or tab-like content zones
- a hero-first layout with secondary navigation below

Do not preserve the current navigation model unless it is genuinely the best solution.

## Responsive Rules

Use a mobile-first approach.

Minimum required breakpoints:

- `@media (min-width: 600px)`
- `@media (min-width: 768px)`

At larger widths, keep the portal feeling like a premium app experience rather than a stretched generic website.

## Accessibility and Quality Bar

- strong contrast on text
- clear hierarchy
- semantic structure where practical
- readable spacing at small widths
- no cramped layouts
- no placeholder lorem ipsum tone; use realistic patient-facing copy
- no visual clutter
- no gimmicky gradients or neon glow effects outside the local design language

## Deliverable Standard

The resulting `public/prototype-modern-ui.html` must:

1. feel like a brand new product direction, not a cosmetic tweak
2. clearly derive from the local `newdesign` package
3. outperform the current patient portal in hierarchy and polish
4. be believable as a premium production direction for dokterDIBYA
5. work well at 375px viewport width
6. contain zero `vh` units
7. use only static HTML/CSS/JS

## Final Instruction

Do not be conservative.

Make the best design you can.
If the strongest solution means abandoning the current card grid, section order, or overall structure, do it.
Your responsibility is to create the most convincing patient portal experience possible using the local `newdesign` system.
