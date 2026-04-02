/*
 * ClearPath Animation Engine
 * ===========================
 * Vanilla JS — zero dependencies.
 * Auto-triggers CSS animations saat element masuk viewport.
 * Gunakan bersama animations.css.
 *
 * Usage:
 *   <div class="gentle-rise">Konten</div>
 *   <div class="stagger-cards"><div>Card 1</div><div>Card 2</div></div>
 *   <div class="counter-roll" data-target="420" data-suffix="+">0</div>
 *   <div class="image-parallax" data-speed="40"><img src="..."></div>
 *
 * Semua animasi auto-detected dan auto-triggered.
 */

(function() {
    'use strict';

    // ==================== SCROLL-TRIGGER OBSERVER ====================
    // Menambahkan class "visible" saat element masuk viewport.

    var ANIMATION_CLASSES = [
        'gentle-rise', 'gentle-rise-sm',
        'stagger-cards',
        'text-reveal',
        'soft-blur-in',
        'scale-in', 'scale-in-bounce',
        'slide-left', 'slide-right',
        'line-draw', 'line-draw-center'
    ];

    var selector = ANIMATION_CLASSES.map(function(c) { return '.' + c; }).join(',');

    var scrollObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                scrollObserver.unobserve(entry.target); // sekali saja
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
    });

    // Observe semua animated elements
    document.querySelectorAll(selector).forEach(function(el) {
        scrollObserver.observe(el);
    });


    // ==================== COUNTER-ROLL ====================
    // Angka bergulung dari 0 ke data-target saat masuk viewport.
    //
    // HTML: <span class="counter-roll" data-target="420" data-suffix="+">0</span>
    // Optional: data-duration="2000" (ms, default 1500)

    var counterObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            counterObserver.unobserve(entry.target);

            var el = entry.target;
            var target = parseInt(el.getAttribute('data-target')) || 0;
            var suffix = el.getAttribute('data-suffix') || '';
            var duration = parseInt(el.getAttribute('data-duration')) || 1500;
            var startTime = null;

            function step(timestamp) {
                if (!startTime) startTime = timestamp;
                var progress = Math.min((timestamp - startTime) / duration, 1);
                // Ease-out cubic
                var eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.floor(eased * target) + suffix;
                if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.counter-roll').forEach(function(el) {
        counterObserver.observe(el);
    });


    // ==================== IMAGE-PARALLAX ====================
    // Gambar bergerak lebih lambat dari scroll.
    //
    // HTML:
    //   <div class="image-parallax" data-speed="40">
    //       <img src="..." alt="">
    //   </div>
    //
    // CSS (wajib):
    //   .image-parallax { overflow: hidden; }
    //   .image-parallax img { will-change: transform; }

    var parallaxEls = document.querySelectorAll('.image-parallax');

    if (parallaxEls.length > 0) {
        window.addEventListener('scroll', function() {
            var viewH = window.innerHeight;
            parallaxEls.forEach(function(el) {
                var rect = el.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > viewH) return;

                var speed = parseInt(el.getAttribute('data-speed')) || 40;
                var img = el.querySelector('img');
                if (!img) return;

                var center = (rect.top + rect.height / 2 - viewH / 2) / viewH;
                img.style.transform = 'translateY(' + (center * speed) + 'px) scale(1.1)';
            });
        }, { passive: true });
    }


    // ==================== ACCORDION ====================
    // Toggle open/close pada FAQ items.
    //
    // HTML:
    //   <div class="accordion-item" onclick="toggleAccordion(this)">
    //       <div class="accordion-header">
    //           <span>Question?</span>
    //           <span class="accordion-icon">+</span>
    //       </div>
    //       <div class="accordion-body">
    //           <p>Answer.</p>
    //       </div>
    //   </div>

    window.toggleAccordion = function(item) {
        var wasOpen = item.classList.contains('open');

        // Close semua dulu (single-open mode)
        var parent = item.parentElement;
        if (parent) {
            parent.querySelectorAll('.accordion-item.open').forEach(function(el) {
                el.classList.remove('open');
            });
        }

        // Toggle yang diklik
        if (!wasOpen) {
            item.classList.add('open');
        }
    };


    // ==================== PRICING TOGGLE ====================
    // Switch antara monthly/yearly pricing.
    //
    // HTML:
    //   <div class="toggle-track" onclick="togglePricing()">
    //       <span class="toggle-option active" data-period="monthly">Monthly</span>
    //       <span class="toggle-option" data-period="yearly">Yearly</span>
    //       <div class="toggle-thumb"></div>
    //   </div>
    //
    //   <span class="price-value" data-monthly="49" data-yearly="39">49</span>

    window.togglePricing = function() {
        var track = document.querySelector('.toggle-track');
        if (!track) return;

        var options = track.querySelectorAll('.toggle-option');
        var thumb = track.querySelector('.toggle-thumb');
        var isYearly = options[1].classList.contains('active');

        // Switch active
        options[0].classList.toggle('active');
        options[1].classList.toggle('active');

        // Move thumb
        if (!isYearly) {
            thumb.style.left = options[1].offsetLeft + 'px';
            thumb.style.width = options[1].offsetWidth + 'px';
        } else {
            thumb.style.left = options[0].offsetLeft + 'px';
            thumb.style.width = options[0].offsetWidth + 'px';
        }

        // Update prices with animation
        var period = isYearly ? 'monthly' : 'yearly';
        document.querySelectorAll('.price-value').forEach(function(el) {
            el.classList.add('switching');
            setTimeout(function() {
                el.textContent = el.getAttribute('data-' + period);
                el.classList.remove('switching');
            }, 200);
        });
    };

})();
