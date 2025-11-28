/**
 * Real-time Sync Module
 * Handles Socket.IO broadcasting for real-time updates
 */

let io = null;

/**
 * Initialize with Socket.IO instance
 */
function init(socketIO) {
    io = socketIO;
    console.log('[RealTimeSync] Initialized with Socket.IO');
}

/**
 * Broadcast event to all connected clients
 */
function broadcast(event) {
    if (!io) {
        console.warn('[RealTimeSync] Socket.IO not initialized, cannot broadcast');
        return false;
    }

    try {
        // Get all connected socket IDs
        const sockets = Array.from(io.sockets.sockets.keys());
        const clientCount = sockets.length;

        console.log(`[RealTimeSync] Broadcasting ${event.type} to ${clientCount} clients:`, {
            socketIds: sockets,
            eventData: {
                type: event.type,
                mrId: event.mrId,
                patientName: event.patientName,
                revisionId: event.revisionId,
                message: event.message?.substring(0, 50)
            }
        });

        // Emit to all connected clients (only once!)
        io.emit(event.type, event);

        console.log(`[RealTimeSync] ✅ Successfully emitted to ${clientCount} sockets`);
        return true;
    } catch (error) {
        console.error('[RealTimeSync] Broadcast failed:', error);
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
        console.log(`[RealTimeSync] Broadcasted to room ${room}:`, event.type);
        return true;
    } catch (error) {
        console.error('[RealTimeSync] Room broadcast failed:', error);
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

    console.log('[RealTimeSync] Broadcasting new booking:', event.booking.patient_name);
    io.emit('booking:new', event);
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

    console.log('[RealTimeSync] Broadcasting booking update:', booking.id, booking.status);
    io.emit('booking:update', event);
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

    console.log('[RealTimeSync] Broadcasting booking cancellation:', booking.id);
    io.emit('booking:cancel', event);
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

    console.log('[RealTimeSync] Broadcasting patient notification:', notification.patient_id, notification.title);
    io.emit('notification:new', event);
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
