-- Staff sidebar "new" red dots: when each staff member last opened each menu.
-- nav_key = <li id> of the sidebar menu (see staff/backend/config/menu-activity-sources.js).
-- Run on deploy: mysql -u root dibyaklinik < staff/backend/migrations/20261104_staff_menu_seen.sql
-- Until it exists, /api/staff-menu-badges returns no dots (logged) instead of failing.
CREATE TABLE IF NOT EXISTS staff_menu_seen (
    user_id VARCHAR(64) NOT NULL,
    nav_key VARCHAR(80) NOT NULL,
    seen_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, nav_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
