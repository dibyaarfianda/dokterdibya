-- Staff sidebar "new" red dots: when each staff member last opened each menu.
-- nav_key = <li id> of the sidebar menu (see staff/backend/config/menu-activity-sources.js).
-- The table is also created lazily by services/StaffMenuBadges.js.
CREATE TABLE IF NOT EXISTS staff_menu_seen (
    user_id VARCHAR(64) NOT NULL,
    nav_key VARCHAR(80) NOT NULL,
    seen_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, nav_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
