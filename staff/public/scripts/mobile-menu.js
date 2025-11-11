/**
 * DIBYA KLINIK - MOBILE MENU HANDLER
 * Handles mobile sidebar toggle and responsive behavior
 */

// Mobile menu state
let isMobileMenuOpen = false;

// Initialize mobile menu
function initMobileMenu() {
    // Create mobile menu toggle button if it doesn't exist
    createMobileMenuToggle();
    
    // Create sidebar overlay
    createSidebarOverlay();
    
    // Bind events
    bindMobileMenuEvents();
    
    // Handle window resize
    handleWindowResize();
    
    console.log('Mobile menu initialized');
}

// Create mobile menu toggle button
function createMobileMenuToggle() {
    const navbar = document.querySelector('.main-header .navbar');
    if (!navbar) return;
    
    // Check if toggle already exists
    if (document.getElementById('mobile-menu-toggle')) return;
    
    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mobile-menu-toggle';
    toggleBtn.className = 'btn btn-link d-md-none';
    toggleBtn.innerHTML = '<i class="fas fa-bars fa-lg"></i>';
    toggleBtn.style.cssText = 'color: white; padding: 0.5rem; margin-right: 0.5rem;';
    
    // Insert at the beginning of navbar
    const navbarNav = navbar.querySelector('.navbar-nav');
    if (navbarNav) {
        navbar.insertBefore(toggleBtn, navbarNav);
    }
}

// Create sidebar overlay
function createSidebarOverlay() {
    // Check if overlay already exists
    if (document.getElementById('sidebar-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
}

// Bind mobile menu events
function bindMobileMenuEvents() {
    // Toggle button click
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleMobileMenu);
    }
    
    // Overlay click (close menu)
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeMobileMenu);
    }
    
    // Close menu when clicking a menu item
    const menuItems = document.querySelectorAll('.main-sidebar .nav-link');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                closeMobileMenu();
            }
        });
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMobileMenuOpen) {
            closeMobileMenu();
        }
    });
}

// Toggle mobile menu
function toggleMobileMenu() {
    if (isMobileMenuOpen) {
        closeMobileMenu();
    } else {
        openMobileMenu();
    }
}

// Open mobile menu
function openMobileMenu() {
    const sidebar = document.querySelector('.main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) {
        sidebar.classList.add('sidebar-open');
    }
    
    if (overlay) {
        overlay.classList.add('active');
    }
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    isMobileMenuOpen = true;
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.querySelector('.main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) {
        sidebar.classList.remove('sidebar-open');
    }
    
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Restore body scroll
    document.body.style.overflow = '';
    
    isMobileMenuOpen = false;
}

// Handle window resize
function handleWindowResize() {
    let resizeTimer;
    
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Close mobile menu if window is resized to desktop
            if (window.innerWidth >= 768 && isMobileMenuOpen) {
                closeMobileMenu();
            }
        }, 250);
    });
}

// Detect if device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Optimize for mobile
function optimizeForMobile() {
    if (!isMobileDevice()) return;
    
    // Add mobile-specific meta tags if not present
    if (!document.querySelector('meta[name="viewport"]')) {
        const viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(viewport);
    }
    
    // Disable hover effects on touch devices
    document.body.classList.add('touch-device');
    
    // Optimize scroll performance
    document.addEventListener('touchstart', function() {}, { passive: true });
    document.addEventListener('touchmove', function() {}, { passive: true });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMobileMenu();
        optimizeForMobile();
    });
} else {
    initMobileMenu();
    optimizeForMobile();
}

// Export functions for external use
window.mobileMenu = {
    open: openMobileMenu,
    close: closeMobileMenu,
    toggle: toggleMobileMenu,
    isMobile: isMobileDevice
};

