/**
 * Mobile Helper Script for AdminLTE Pages
 * Handles mobile-specific interactions and sidebar toggling
 */

(function() {
    'use strict';

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        setupSidebarToggle();
        setupResponsiveTables();
        setupMobileOptimizations();
    }

    /**
     * Setup sidebar toggle for mobile
     */
    function setupSidebarToggle() {
        const pushMenuBtn = document.querySelector('[data-widget="pushmenu"]');
        const body = document.body;

        if (!pushMenuBtn) return;

        // Toggle sidebar on button click
        pushMenuBtn.addEventListener('click', function(e) {
            e.preventDefault();

            if (window.innerWidth <= 768) {
                body.classList.toggle('sidebar-open');
            }
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.main-sidebar');
                const pushMenu = document.querySelector('[data-widget="pushmenu"]');

                if (body.classList.contains('sidebar-open') &&
                    sidebar &&
                    !sidebar.contains(e.target) &&
                    !pushMenu.contains(e.target)) {
                    body.classList.remove('sidebar-open');
                }
            }
        });

        // Close sidebar on window resize if switching to desktop
        window.addEventListener('resize', debounce(function() {
            if (window.innerWidth > 768) {
                body.classList.remove('sidebar-open');
            }
        }, 250));
    }

    /**
     * Make tables responsive by wrapping them
     */
    function setupResponsiveTables() {
        const tables = document.querySelectorAll('table:not(.dataTable)');

        tables.forEach(function(table) {
            // Skip if already wrapped
            if (table.parentElement.classList.contains('table-responsive')) {
                return;
            }

            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'table-responsive';

            // Wrap table
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }

    /**
     * Mobile-specific optimizations
     */
    function setupMobileOptimizations() {
        // Prevent iOS zoom on input focus (already handled by font-size in CSS)

        // Add touch event handling for better mobile experience
        if (isTouchDevice()) {
            document.body.classList.add('touch-device');

            // Improve button tap response
            const buttons = document.querySelectorAll('.btn, button');
            buttons.forEach(function(btn) {
                btn.addEventListener('touchstart', function() {
                    this.classList.add('active');
                }, {passive: true});

                btn.addEventListener('touchend', function() {
                    setTimeout(() => {
                        this.classList.remove('active');
                    }, 150);
                }, {passive: true});
            });
        }

        // Fix viewport height for mobile browsers (addresses bar)
        updateViewportHeight();
        window.addEventListener('resize', debounce(updateViewportHeight, 250));
    }

    /**
     * Update viewport height for mobile browsers
     */
    function updateViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    /**
     * Check if device supports touch
     */
    function isTouchDevice() {
        return (('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                (navigator.msMaxTouchPoints > 0));
    }

    /**
     * Debounce function to limit function calls
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction() {
            const context = this;
            const args = arguments;
            const later = function() {
                timeout = null;
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Utility: Detect if on mobile
     */
    window.isMobileView = function() {
        return window.innerWidth <= 768;
    };

    /**
     * Utility: Open sidebar programmatically
     */
    window.openSidebar = function() {
        if (window.isMobileView()) {
            document.body.classList.add('sidebar-open');
        }
    };

    /**
     * Utility: Close sidebar programmatically
     */
    window.closeSidebar = function() {
        document.body.classList.remove('sidebar-open');
    };

})();
