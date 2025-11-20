package com.dokterdibya.app.data.remote.socket

import com.dokterdibya.app.BuildConfig
import com.dokterdibya.app.utils.Constants
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import timber.log.Timber
import java.net.URISyntaxException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor() {

    private var socket: Socket? = null
    private val _connectionState = MutableStateFlow(false)
    val connectionState: StateFlow<Boolean> = _connectionState

    init {
        try {
            val opts = IO.Options().apply {
                reconnection = true
                reconnectionAttempts = 5
                reconnectionDelay = 1000
                timeout = 10000
            }

            socket = IO.socket(BuildConfig.SOCKET_URL, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Timber.d("Socket connected")
                _connectionState.value = true
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Timber.d("Socket disconnected")
                _connectionState.value = false
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Timber.e("Socket connection error: ${args.joinToString()}")
                _connectionState.value = false
            }

        } catch (e: URISyntaxException) {
            Timber.e(e, "Socket URI error")
        }
    }

    fun connect() {
        socket?.connect()
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
