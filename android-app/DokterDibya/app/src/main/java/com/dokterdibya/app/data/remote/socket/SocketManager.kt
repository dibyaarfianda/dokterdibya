package com.dokterdibya.app.data.remote.socket

import com.dokterdibya.app.utils.Constants
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor() {

    private var socket: Socket? = null
    private val _connectionState = MutableStateFlow(false)
    val connectionState: StateFlow<Boolean> = _connectionState

    fun connect() {
        // Unused legacy client: fail closed until a TokenRepository-backed migration is packaged.
        Timber.d("Legacy realtime disabled; use authenticated HTTP refresh")
    }

    fun disconnect() {
        socket?.disconnect()
    }

    fun emit(event: String, data: JSONObject) {
        socket?.emit(event, data)
    }

    fun on(event: String, callback: (Array<Any>) -> Unit) {
        socket?.on(event) { args ->
            callback(args)
        }
    }

    fun off(event: String) {
        socket?.off(event)
    }

    // Announcement events
    fun onAnnouncementNew(callback: (JSONObject) -> Unit) {
        on(Constants.SOCKET_EVENT_ANNOUNCEMENT_NEW) { args ->
            if (args.isNotEmpty() && args[0] is JSONObject) {
                callback(args[0] as JSONObject)
            }
        }
    }

    // Appointment events
    fun onAppointmentUpdate(callback: (JSONObject) -> Unit) {
        on(Constants.SOCKET_EVENT_APPOINTMENT_UPDATE) { args ->
            if (args.isNotEmpty() && args[0] is JSONObject) {
                callback(args[0] as JSONObject)
            }
        }
    }

    fun isConnected(): Boolean = socket?.connected() ?: false
}
