# Clearpath Stretch + Parallax Cards

Replicates the Clearpath template's 4-card hover animation: cards stretch vertically (frame grows ±80px top/bottom) based on horizontal cursor proximity, with a per-card spring physics ease-in + ease-out feel. Background image stays pixel-perfect fixed during stretch (no drift), and continues to parallax on scroll even while hovering. Title sits at top-left (follows frame top), "Buka Halaman" CTA sits at bottom-left with fade-in on hover (follows frame bottom).

## Key techniques

1. **Stretch lockstep (no CSS transition drift)**
   Frame and media both derive `top`/`bottom` from shared `--journey-stretch` variable via `calc()`. Media's inset mathematically cancels the frame's stretch so the media container size stays constant → percentage `background-position` never shifts → zero image drift. CSS transitions on `top`/`bottom` are REMOVED; smoothness comes from JS spring updating the variable each RAF.

2. **Per-card proximity spring (ease-in + ease-out)**
   Each card has its own `currentProximity` and `proximityVelocity` state. A critically-damped spring eases toward target proximity (derived from cursor horizontal distance). This gives natural acceleration from rest → deceleration into target. Smoothing cursor X alone is NOT enough because cursor itself is already smooth.

3. **Parallax preserved, never locked**
   `transform: translateY(var(--journey-parallax-y))` on media. `--journey-parallax-y` is scroll-based only (not set during hover stretch). Parallax continues during hover. No "lock on enter → unlock on leave" logic (that causes a catch-up jump).

4. **Title & CTA follow frame edges**
   Both use `calc(26px + var(--journey-stretch) * -0.5)` (for top) or same formula for `bottom`, so they move with the frame's outer edges as it stretches. No CSS transition on `top`/`bottom` (same lockstep rule).

5. **Reduced-motion whitelist**
   All `.journey-card-*` classes are added to the `@media (prefers-reduced-motion: reduce)` `:not()` whitelist so transitions (fade, parallax transform) don't get killed for users with "reduce motion" OS setting.

## HTML

```html
<section class="journey-showcase">
  <div class="journey-showcase-grid">
    <button type="button" class="journey-card card-perjalanan is-short" onclick="...">
      <span class="journey-card-frame" aria-hidden="true">
        <span class="journey-card-media" aria-hidden="true"></span>
      </span>
      <span class="journey-card-copy">
        <span class="journey-card-kicker">Perjalanan Ibu</span>
        <span class="journey-card-title">Langkah Awal Ibu</span>
      </span>
      <span class="journey-card-cta" aria-hidden="true">
        <span class="journey-card-cta-dot"></span>
        <span class="journey-card-cta-text">Buka Halaman</span>
      </span>
    </button>
    <!-- repeat for card-membaca, card-update, card-obgyn -->
  </div>
</section>
```

## CSS

```css
.journey-showcase-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    align-items: end;
    width: min(calc(100vw - 100px), 1320px);
    margin-left: 50%;
    transform: translateX(-50%);
}

.journey-card {
    --journey-base-height: 386px;
    --journey-stretch: 0px;
    --journey-parallax-y: -118px;
    --journey-shadow-alpha: 0.14;
    --journey-sat: 1;
    --journey-contrast: 1;
    position: relative;
    height: var(--journey-base-height);
    border: 0;
    overflow: visible;
    cursor: pointer;
    appearance: none;
    display: flex;
    padding: 26px 22px;
    isolation: isolate;
    transition: filter 0.42s cubic-bezier(0.22, 1, 0.36, 1);
    width: 100%;
    font: inherit;
    will-change: filter;
    background: none;
    filter: saturate(var(--journey-sat)) contrast(var(--journey-contrast));
}

/* Frame: stretches via --journey-stretch; NO transition on top/bottom */
.journey-card-frame {
    position: absolute;
    top: calc(var(--journey-stretch) * -0.5);
    bottom: calc(var(--journey-stretch) * -0.5);
    left: 0;
    right: 0;
    overflow: hidden;
    background-color: #c7d4cf;
    box-shadow: 0 26px 56px rgba(31, 38, 35, var(--journey-shadow-alpha));
    transition: box-shadow 0.42s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    z-index: -3;
}

/* Media: inset compensation cancels frame's stretch → container size constant */
.journey-card-media {
    position: absolute;
    top: calc(-88px + var(--journey-stretch) * 0.5);
    bottom: calc(-240px + var(--journey-stretch) * 0.5);
    left: 0;
    right: 0;
    background-image: var(--journey-image);
    background-size: var(--journey-bg-size, cover);
    background-position: var(--journey-position, center center);
    background-repeat: no-repeat;
    transform: translateY(var(--journey-parallax-y));
    transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
                filter 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    pointer-events: none;
    filter: saturate(0.98) contrast(0.98);
}

.journey-card-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(16, 19, 18, 0.08) 0%, rgba(16, 19, 18, 0.28) 42%, rgba(16, 19, 18, 0.68) 100%);
    z-index: -2;
}
.journey-card-frame::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.34), transparent 34%), linear-gradient(135deg, rgba(147, 183, 172, 0.12), rgba(20, 22, 24, 0.12));
    mix-blend-mode: screen;
    z-index: -1;
}

.journey-card:active {
    filter: saturate(1.01) contrast(1.01);
    transition: filter 0.14s ease;
}

/* Copy at top — follows frame top */
.journey-card-copy {
    position: absolute;
    top: calc(26px + var(--journey-stretch) * -0.5);
    left: 22px;
    right: 22px;
    z-index: 1;
    color: #f7f8f5;
    pointer-events: none;
}

.journey-card-kicker {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(247, 248, 245, 0.82);
}

.journey-card-title {
    margin: 0;
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(34px, 4vw, 54px);
    line-height: 0.92;
    font-weight: 500;
    letter-spacing: -0.03em;
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.18);
    text-align: left;
}

/* CTA at bottom — dot always visible, text fades on hover */
.journey-card-cta {
    position: absolute;
    bottom: calc(26px + var(--journey-stretch) * -0.5);
    left: 22px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #f7f8f5;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
}

.journey-card-cta-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #f7f8f5;
    flex-shrink: 0;
}

.journey-card-cta-text {
    opacity: 0;
    transition: opacity 0.3s ease;
}

.journey-card:hover .journey-card-cta-text,
.journey-card:focus-visible .journey-card-cta-text {
    opacity: 1;
}

/* Per-card image positioning (tune per image aspect ratio) */
.journey-card.card-perjalanan {
    --journey-image: url('/images/hamil.png');
    --journey-position: 50% 61%;
    --journey-bg-size: 156% auto;
}
.journey-card.card-membaca {
    --journey-image: url('/images/buku.png');
    --journey-position: 50% calc(60% - 20px);
    --journey-bg-size: 156% auto;
}
.journey-card.card-update {
    --journey-image: url('/images/mata.png');
    --journey-position: 52% calc(63% + 20px);
    --journey-bg-size: 150% auto;
}
.journey-card.card-obgyn {
    --journey-image: url('/images/uterus.png');
    --journey-position: 54% 69%;
    --journey-bg-size: 142% auto;
}
```

## Reduced-motion whitelist

Add these selectors to the `@media (prefers-reduced-motion: reduce)` `:not()` chain so their transitions aren't killed:

```
.journey-card, .journey-card-frame, .journey-card-media,
.journey-card-copy, .journey-card-kicker, .journey-card-title,
.journey-card-cta, .journey-card-cta-dot, .journey-card-cta-text
```

## JavaScript

```javascript
(function() {
    var MAX_STRETCH = 160;  // Frame extends ±80px top/bottom at full stretch
    var lastClientX = window.innerWidth * 0.5;

    function getCardBaseHeight(card) {
        var cssValue = getComputedStyle(card).getPropertyValue('--journey-base-height');
        var parsed = parseFloat(cssValue);
        return Number.isFinite(parsed) ? parsed : 272;
    }

    function resetJourneyCard(card) {
        card.style.removeProperty('--journey-stretch');
        card.style.removeProperty('--journey-parallax-y');
        card.style.removeProperty('--journey-shadow-alpha');
        card.style.removeProperty('--journey-sat');
        card.style.removeProperty('--journey-contrast');
        card.style.filter = '';
        card.style.zIndex = '';
    }

    function getParallaxShift(card) {
        var rect = card.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        var travel = 106;
        var startOffset = -200;
        var progress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
        var eased = Math.max(0, Math.min(1, progress));
        eased = eased * eased * (3 - (2 * eased));
        return startOffset + (travel * eased);
    }

    function applyJourneyCardState(card, stretch, intensity, zIndex) {
        var parallaxShift = Number(card.dataset.parallaxShift);
        if (!Number.isFinite(parallaxShift)) {
            parallaxShift = getParallaxShift(card);
        }
        var shadowAlpha = 0.14 + (intensity * 0.12);
        var saturation = 1 + (intensity * 0.06);
        var contrast = 1 + (intensity * 0.03);

        card.style.setProperty('--journey-stretch', stretch.toFixed(2) + 'px');
        card.style.setProperty('--journey-parallax-y', parallaxShift.toFixed(2) + 'px');
        card.style.setProperty('--journey-shadow-alpha', shadowAlpha.toFixed(3));
        card.style.setProperty('--journey-sat', saturation.toFixed(3));
        card.style.setProperty('--journey-contrast', contrast.toFixed(3));
        card.style.filter = 'saturate(' + saturation.toFixed(3) + ') contrast(' + contrast.toFixed(3) + ')';
        card.style.zIndex = String(zIndex);
    }

    function getHorizontalProximity(gridRect, cardMetric, clientX) {
        if (!gridRect.width || !cardMetric.width) return 0;
        var cursorNormalized = (clientX - gridRect.left) / gridRect.width;
        var centerNormalized = (cardMetric.centerX - gridRect.left) / gridRect.width;
        var radius = 0.58;
        var raw = Math.max(0, 1 - (Math.abs(cursorNormalized - centerNormalized) / radius));
        return raw * (0.72 + (raw * 0.28));
    }

    function isGridVisible(grid) {
        var rect = grid.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    document.querySelectorAll('.journey-showcase-grid').forEach(function(grid) {
        var cards = Array.from(grid.querySelectorAll('.journey-card'));
        var metrics = [];
        var targetClientX = lastClientX;
        var currentClientX = lastClientX;
        var frameId = 0;

        function rebuildMetrics() {
            var oldMetrics = metrics;
            metrics = cards.map(function(card, i) {
                var rect = card.getBoundingClientRect();
                var baseHeight = getCardBaseHeight(card);
                var parallaxShift = getParallaxShift(card);
                card.dataset.baseHeight = String(baseHeight);
                card.dataset.parallaxShift = String(parallaxShift);
                var prev = oldMetrics[i];
                return {
                    card: card,
                    centerX: rect.left + (rect.width / 2),
                    width: rect.width,
                    baseHeight: baseHeight,
                    currentProximity: prev ? prev.currentProximity : 0,
                    proximityVelocity: prev ? prev.proximityVelocity : 0
                };
            });
        }

        function clear() {
            cards.forEach(resetJourneyCard);
        }

        function updateAll(clientX) {
            if (!isGridVisible(grid)) return false;
            if (metrics.length !== cards.length) rebuildMetrics();

            var gridRect = grid.getBoundingClientRect();
            var stillMoving = false;

            metrics.forEach(function(metric) {
                var card = metric.card;
                var targetProximity = getHorizontalProximity(gridRect, metric, clientX);

                // Per-card spring on proximity → ease-in + ease-out for stretch.
                // stiffness=0.006, damping=0.15, settling time ~600ms.
                if (metric.currentProximity === undefined) metric.currentProximity = 0;
                if (metric.proximityVelocity === undefined) metric.proximityVelocity = 0;

                var delta = targetProximity - metric.currentProximity;
                metric.proximityVelocity += delta * 0.006 - metric.proximityVelocity * 0.15;
                metric.currentProximity += metric.proximityVelocity;

                if (Math.abs(delta) < 0.0015 && Math.abs(metric.proximityVelocity) < 0.0015) {
                    metric.currentProximity = targetProximity;
                    metric.proximityVelocity = 0;
                } else {
                    stillMoving = true;
                }

                var prox = metric.currentProximity;
                var stretch = MAX_STRETCH * prox;
                applyJourneyCardState(card, stretch, prox, Math.round(4 + (prox * 6)));
            });

            return stillMoving;
        }

        function animateToTarget() {
            frameId = 0;
            if (!isGridVisible(grid)) {
                clear();
                return;
            }
            currentClientX = targetClientX;
            var stillMoving = updateAll(currentClientX);
            if (stillMoving) scheduleUpdate();
        }

        function scheduleUpdate() {
            if (frameId) return;
            frameId = window.requestAnimationFrame(animateToTarget);
        }

        function refresh() {
            if (!isGridVisible(grid)) {
                clear();
                return;
            }
            rebuildMetrics();
            currentClientX = targetClientX;
            updateAll(currentClientX);
            scheduleUpdate();
        }

        window.addEventListener('pointermove', function(event) {
            lastClientX = event.clientX;
            targetClientX = event.clientX;
            scheduleUpdate();
        }, { passive: true });

        grid.addEventListener('pointermove', function(event) {
            lastClientX = event.clientX;
            targetClientX = event.clientX;
            scheduleUpdate();
        }, { passive: true });

        cards.forEach(function(card) {
            card.addEventListener('pointerenter', function(event) {
                lastClientX = event.clientX;
                targetClientX = event.clientX;
                scheduleUpdate();
            }, { passive: true });

            card.addEventListener('pointermove', function(event) {
                lastClientX = event.clientX;
                targetClientX = event.clientX;
                scheduleUpdate();
            }, { passive: true });

            card.addEventListener('pointerleave', function() {
                scheduleUpdate();
            }, { passive: true });
        });

        window.addEventListener('scroll', refresh, { passive: true });
        window.addEventListener('resize', refresh);

        refresh();
    });
})();
```

## Tuning reference

| Parameter | Value | Effect |
|-----------|-------|--------|
| `MAX_STRETCH` | `160` | Total vertical stretch range (frame extends ±80px top/bottom) |
| Spring stiffness | `0.006` | How strongly proximity is pulled to target. Lower = slower |
| Spring damping | `0.15` | How quickly velocity decays. Near-critical = smooth, no overshoot |
| Settling time | ~600ms | How long to reach target after cursor stops |
| Media compensation math | `-88px + stretch·0.5` (top), `-240px + stretch·0.5` (bottom) | Cancels frame stretch; media container size stays constant |
| Parallax travel | `106px` | Total vertical range of scroll-based parallax translation |

## Gotchas

- **Don't add `transition: top` or `transition: bottom` to frame/media/copy/cta** — it desynchronizes the lockstep. JS spring drives everything via the shared `--journey-stretch` variable in the same RAF tick.
- **Don't set `--journey-parallax-y` during hover** — only on scroll (via `getParallaxShift` in `rebuildMetrics`). Otherwise the image drifts during stretch.
- **Card must have `position: relative`** so `.journey-card-frame` is positioned relative to the card, and media's compensation math works.
- **Card must have `overflow: visible`** so the frame can extend beyond the card's natural bounds on stretch.
