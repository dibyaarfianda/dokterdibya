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

module.exports = {
    init,
    broadcast,
    broadcastToRoom
};
