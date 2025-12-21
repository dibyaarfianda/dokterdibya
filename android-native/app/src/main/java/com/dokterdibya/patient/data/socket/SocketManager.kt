package com.dokterdibya.patient.data.socket

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONObject
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

data class PatientNotification(
    val id: Int,
    val patientId: String,
    val type: String,
    val title: String,
    val message: String,
    val icon: String?,
    val iconColor: String?,
    val createdAt: String
)

@Singleton
class SocketManager @Inject constructor() {

    companion object {
        private const val TAG = "SocketManager"
        private const val SOCKET_URL = "https://dokterdibya.com"
    }

    private var socket: Socket? = null
    private var currentPatientId: String? = null

    private val _notifications = MutableSharedFlow<PatientNotification>(replay = 0)
    val notifications: SharedFlow<PatientNotification> = _notifications.asSharedFlow()

    private val _connectionState = MutableSharedFlow<Boolean>(replay = 1)
    val connectionState: SharedFlow<Boolean> = _connectionState.asSharedFlow()

    private val onConnect = Emitter.Listener {
        Log.d(TAG, "Socket connected")
        _connectionState.tryEmit(true)
    }

    private val onDisconnect = Emitter.Listener {
        Log.d(TAG, "Socket disconnected")
        _connectionState.tryEmit(false)
    }

    private val onConnectError = Emitter.Listener { args ->
        Log.e(TAG, "Socket connection error: ${args.getOrNull(0)}")
        _connectionState.tryEmit(false)
    }

    private val onNotification = Emitter.Listener { args ->
        try {
            val data = args[0] as JSONObject
            Log.d(TAG, "Received notification event: $data")

            val notificationObj = data.getJSONObject("notification")
            val notification = PatientNotification(
                id = notificationObj.getInt("id"),
                patientId = notificationObj.getString("patient_id"),
                type = notificationObj.optString("type", "system"),
                title = notificationObj.getString("title"),
                message = notificationObj.getString("message"),
                icon = notificationObj.optString("icon", null),
                iconColor = notificationObj.optString("icon_color", null),
                createdAt = notificationObj.optString("created_at", "")
            )

            // Only emit if this notification is for our patient
            if (notification.patientId == currentPatientId) {
                Log.d(TAG, "Notification for current patient: ${notification.title}")
                _notifications.tryEmit(notification)
            } else {
                Log.d(TAG, "Notification for different patient: ${notification.patientId} (current: $currentPatientId)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing notification", e)
        }
    }

    fun connect(patientId: String) {
        if (socket?.connected() == true && currentPatientId == patientId) {
            Log.d(TAG, "Already connected for patient: $patientId")
            return
        }

        currentPatientId = patientId
        disconnect()

        try {
            val options = IO.Options().apply {
                // Use polling only - WebSocket often fails on Indonesian mobile ISPs
                transports = arrayOf("polling")
                upgrade = false
                reconnection = true
                reconnectionDelay = 2000
                reconnectionDelayMax = 10000
                reconnectionAttempts = 10
            }

            socket = IO.socket(URI.create(SOCKET_URL), options).apply {
                on(Socket.EVENT_CONNECT, onConnect)
                on(Socket.EVENT_DISCONNECT, onDisconnect)
                on(Socket.EVENT_CONNECT_ERROR, onConnectError)
                on("notification:new", onNotification)
            }

            socket?.connect()
            Log.d(TAG, "Connecting to socket for patient: $patientId")

        } catch (e: Exception) {
            Log.e(TAG, "Error creating socket", e)
        }
    }

    fun disconnect() {
        socket?.apply {
            off(Socket.EVENT_CONNECT, onConnect)
            off(Socket.EVENT_DISCONNECT, onDisconnect)
            off(Socket.EVENT_CONNECT_ERROR, onConnectError)
            off("notification:new", onNotification)
            disconnect()
        }
        socket = null
        _connectionState.tryEmit(false)
        Log.d(TAG, "Socket disconnected and cleaned up")
    }

    fun isConnected(): Boolean = socket?.connected() == true
}
