'use strict';

const PERMISSION_ROOM_PREFIX = 'permission:';

const EVENT_PERMISSIONS = Object.freeze({
    'patient:selected': 'patients.view',
    'anamnesa:updated': 'anamnesa.view',
    'physical:updated': 'physical_exam.view',
    'usg:updated': 'usg_exam.view',
    'lab:updated': 'lab_exam.view',
    'billing:updated': 'billing.view',
    'billing_updated': 'billing.view',
    'payment_received': 'billing.view',
    'billing_confirmed': 'billing.view',
    'billing_paid': 'billing.view',
    'revision_requested': 'billing.view',
    'sunday_clinic_closing_updated': 'finance_analysis.view',
    'visit:completed': 'visits.view',
    'medical_record:changed': 'medical_records.view',
    'medical_record:updated': 'medical_records.view',
    'usg:patient_updated': 'usg_exam.view',
    'document:patient_updated': 'patient_documents.view',
    'appointment:confirmation_popup_triggered': 'online_queue.view',
    'booking:new': 'online_queue.view',
    'booking:update': 'online_queue.view',
    'booking:cancel': 'online_queue.view',
    'booking:slots_released': 'online_queue.view',
    'queue:updated': 'online_queue.view',
    'queue:settings_changed': 'online_queue.view',
    'newLog': 'logs.view',
    'docboard:sync': 'docboard.view',
    'medify_progress': 'integrations.view',
    'medify_sync_progress': 'integrations.view',
    'medify_sync_complete': 'integrations.view',
    'staff-announcement:new': 'staff_announcements.view',
    'staff-announcement:updated': 'staff_announcements.view',
    'staff-announcement:deleted': 'staff_announcements.view',
    'support:escalated_message': 'support_chat.view',
    'support:escalated': 'support_chat.view',
    'support:session_rated': 'support_chat.view',
    'support:staff_replied': 'support_chat.view',
    'support:session_locked': 'support_chat.view',
    'support:session_resolved': 'support_chat.view'
});

function permissionRoom(permission) {
    if (typeof permission !== 'string' || !permission.trim()) {
        throw new TypeError('Permission room requires a permission name');
    }
    return `${PERMISSION_ROOM_PREFIX}${permission.trim()}`;
}

function userRoom(userId) {
    return `user:${String(userId)}`;
}

function permissionForEvent(event) {
    return EVENT_PERMISSIONS[event] || null;
}

async function syncPermissionRooms(socket, permissions) {
    const desired = new Set([...permissions].map(permissionRoom));
    const existing = [...socket.rooms].filter(room => room.startsWith(PERMISSION_ROOM_PREFIX));
    await Promise.all(existing.filter(room => !desired.has(room)).map(room => socket.leave(room)));
    await Promise.all([...desired].filter(room => !socket.rooms.has(room)).map(room => socket.join(room)));
}

function emitToPermission(broadcaster, permission, event, payload) {
    broadcaster.to(permissionRoom(permission)).emit(event, payload);
}

module.exports = {
    EVENT_PERMISSIONS,
    PERMISSION_ROOM_PREFIX,
    emitToPermission,
    permissionForEvent,
    permissionRoom,
    syncPermissionRooms,
    userRoom
};
