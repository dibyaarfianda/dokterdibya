-- Migration: add role_visibility entries for staff_points and staff_briefing
-- Visible to: dokter, admin, managerial. Hidden for everyone else by default.
-- Idempotent: ON DUPLICATE KEY UPDATE preserves existing values if already set.

INSERT INTO role_visibility (role_name, menu_key, is_visible) VALUES
    ('dokter',      'staff_points',   1),
    ('admin',       'staff_points',   1),
    ('managerial',  'staff_points',   1),
    ('bidan',       'staff_points',   0),
    ('front_office','staff_points',   0),
    ('dokter',      'staff_briefing', 1),
    ('admin',       'staff_briefing', 1),
    ('managerial',  'staff_briefing', 1),
    ('bidan',       'staff_briefing', 0),
    ('front_office','staff_briefing', 0)
ON DUPLICATE KEY UPDATE is_visible = VALUES(is_visible);
