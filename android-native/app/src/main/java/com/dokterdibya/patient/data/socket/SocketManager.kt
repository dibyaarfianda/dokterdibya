package com.dokterdibya.patient.data.socket

import android.util.Log
import com.dokterdibya.patient.data.repository.TokenRepository
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
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
class SocketManager @Inject constructor(private val tokenRepository: TokenRepository) {

    companion object {
        private const val TAG = "SocketManager"
        private const val SOCKET_URL = "https://dokterdibya.com"
    }

    private var socket: Socket? = null
    private var currentPatientId: String? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tokenJob: Job? = null
    private val lifecycle = SocketLifecycle()

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

    private val onConnectError = Emitter.Listener {
        Log.e(TAG, "Socket connection error")
        _connectionState.tryEmit(false)
    }

    private val onNotification = Emitter.Listener { args ->
        try {
            val data = args[0] as JSONObject

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
                _notifications.tryEmit(notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing notification", e)
        }
    }

    fun connect(patientId: String) {
        lifecycle.replace { generation ->
            tokenJob?.cancel()
            closeSocket()
            currentPatientId = patientId
            // Cancellation alone does not stop a collector already in synchronous code.
            tokenJob = scope.launch {
                tokenRepository.getToken().distinctUntilChanged().collect { token ->
                    lifecycle.runIfCurrent(generation) {
                        closeSocket()
                        if (!token.isNullOrBlank()) connectAuthenticated(token)
                    }
                }
            }
        }
    }

    private fun connectAuthenticated(token: String) {
        try {
            val options = authenticatedSocketOptions(token)

            socket = IO.socket(URI.create(SOCKET_URL), options).apply {
                on(Socket.EVENT_CONNECT, onConnect)
                on(Socket.EVENT_DISCONNECT, onDisconnect)
                on(Socket.EVENT_CONNECT_ERROR, onConnectError)
                on("notification:new", onNotification)
            }

            socket?.connect()
            Log.d(TAG, "Connecting authenticated socket")

        } catch (e: Exception) {
            Log.e(TAG, "Error creating socket", e)
        }
    }

    fun disconnect() {
        lifecycle.replace {
            tokenJob?.cancel()
            tokenJob = null
            currentPatientId = null
            closeSocket()
        }
    }

    private fun closeSocket() {
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

internal fun authenticatedSocketOptions(token: String): IO.Options {
    require(token.isNotBlank()) { "Socket credentials are required" }
    return IO.Options().apply {
        auth = mapOf("token" to token)
        transports = arrayOf("polling")
        upgrade = false
        reconnection = true
        reconnectionDelay = 2000
        reconnectionDelayMax = 10000
        reconnectionAttempts = 10
    }
}
