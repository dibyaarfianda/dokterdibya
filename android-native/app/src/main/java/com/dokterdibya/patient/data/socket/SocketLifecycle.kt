package com.dokterdibya.patient.data.socket

// Generation checks and installation share one monitor: cancellation cannot
// return while an older collector is still installing a new connection.
internal class SocketLifecycle {
    private var generation = 0L

    @Synchronized
    fun replace(action: (Long) -> Unit) {
        generation += 1
        action(generation)
    }

    @Synchronized
    fun runIfCurrent(expected: Long, action: () -> Unit): Boolean {
        if (generation != expected) return false
        action()
        return true
    }
}
