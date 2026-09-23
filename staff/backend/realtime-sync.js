/**
 * Real-time Sync Module
 * Handles Socket.IO broadcasting for real-time updates
 */

let io = null;
const PATIENT_REFRESH_EVENTS = new Set([
    'usg:patient_updated', 'document:patient_updated', 'appointment:confirmation_popup_triggered'
]);

/**
 * Initialize with Socket.IO instance
 */
function init(socketIO) {
    io = socketIO;
    console.log('[RealTimeSync] Initialized with Socket.IO');
}

/**
 * Broadcast staff domain events to verified staff only
 */
function broadcast(event) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized, cannot broadcast');
        return false;
    }

    try {
        const rooms = ['staff'];
        if (PATIENT_REFRESH_EVENTS.has(event.type) && event.patient_id) rooms.push(`patient:${event.patient_id}`);
        io.to(rooms).emit(event.type, event);
        return true;
    } catch (error) {
        console.error('[RealTimeSync] Broadcast failed');
        return false;
    }
}

/**
 * Broadcast to specific room/channel
 */
function broadcastToRoom(room, event) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized');
        return false;
    }

    try {
        io.to(room).emit(event.type, event);
        return true;
    } catch (error) {
        console.error('[RealTimeSync] Room broadcast failed');
        return false;
    }
}

/**
 * Broadcast new booking notification
 */
function broadcastNewBooking(booking) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized');
        return false;
    }

    const event = {
        type: 'booking:new',
        booking: {
            id: booking.id,
            patient_name: booking.patient_name,
            appointment_date: booking.appointment_date,
            session: booking.session,
            session_label: booking.session_label,
            status: booking.status || 'scheduled',
            created_at: booking.created_at || new Date().toISOString()
        },
        timestamp: new Date().toISOString()
    };

    io.to('staff').emit('booking:new', event);
    return true;
}

/**
 * Broadcast booking status update
 */
function broadcastBookingUpdate(booking) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized');
        return false;
    }

    const event = {
        type: 'booking:update',
        booking: {
            id: booking.id,
            patient_name: booking.patient_name,
            appointment_date: booking.appointment_date,
            session: booking.session,
            status: booking.status,
            updated_at: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
    };

    io.to('staff').emit('booking:update', event);
    return true;
}

/**
 * Broadcast booking cancellation
 */
function broadcastBookingCancel(booking) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized');
        return false;
    }

    const event = {
        type: 'booking:cancel',
        booking: {
            id: booking.id,
            patient_name: booking.patient_name,
            appointment_date: booking.appointment_date
        },
        timestamp: new Date().toISOString()
    };

    io.to('staff').emit('booking:cancel', event);
    return true;
}

/**
 * Broadcast new patient notification
 */
function broadcastPatientNotification(notification) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized');
        return false;
    }

    const event = {
        type: 'notification:new',
        notification: {
            id: notification.id,
            patient_id: notification.patient_id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            icon: notification.icon,
            icon_color: notification.icon_color,
            created_at: notification.created_at || new Date().toISOString()
        },
        timestamp: new Date().toISOString()
    };

    if (!notification.patient_id) return false;
    io.to(`patient:${notification.patient_id}`).emit('notification:new', event);
    return true;
}

module.exports = {
    init,
    broadcast,
    broadcastToRoom,
    broadcastNewBooking,
    broadcastBookingUpdate,
    broadcastBookingCancel,
    broadcastPatientNotification
};
