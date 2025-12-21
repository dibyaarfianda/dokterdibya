package com.dokterdibya.patient.data.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.dokterdibya.patient.DokterDibyaApp
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.socket.SocketManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

@AndroidEntryPoint
class NotificationService : Service() {

    companion object {
        private const val TAG = "NotificationService"
        private const val FOREGROUND_ID = 1
        private const val EXTRA_PATIENT_ID = "patient_id"

        fun start(context: Context, patientId: String) {
            val intent = Intent(context, NotificationService::class.java).apply {
                putExtra(EXTRA_PATIENT_ID, patientId)
            }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, NotificationService::class.java))
        }
    }

    @Inject
    lateinit var socketManager: SocketManager

    @Inject
    lateinit var notificationHelper: NotificationHelper

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var isStarted = false

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val patientId = intent?.getStringExtra(EXTRA_PATIENT_ID)

        if (patientId.isNullOrEmpty()) {
            Log.e(TAG, "No patient ID provided, stopping service")
            stopSelf()
            return START_NOT_STICKY
        }

        if (!isStarted) {
            isStarted = true
            startForegroundNotification()
            connectSocket(patientId)
            listenForNotifications()
        }

        return START_STICKY
    }

    private fun startForegroundNotification() {
        val notification = NotificationCompat.Builder(this, DokterDibyaApp.SERVICE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("dokterDIBYA")
            .setContentText("Terhubung untuk notifikasi")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(FOREGROUND_ID, notification)
        Log.d(TAG, "Foreground notification started")
    }

    private fun connectSocket(patientId: String) {
        Log.d(TAG, "Connecting socket for patient: $patientId")
        socketManager.connect(patientId)
    }

    private fun listenForNotifications() {
        // Listen for incoming notifications
        socketManager.notifications
            .onEach { notification ->
                Log.d(TAG, "Received notification: ${notification.title}")
                notificationHelper.showPatientNotification(notification)
            }
            .launchIn(serviceScope)

        // Listen for connection state changes
        socketManager.connectionState
            .onEach { isConnected ->
                Log.d(TAG, "Socket connection state: $isConnected")
                updateForegroundNotification(isConnected)
            }
            .launchIn(serviceScope)
    }

    private fun updateForegroundNotification(isConnected: Boolean) {
        val statusText = if (isConnected) "Terhubung untuk notifikasi" else "Menghubungkan..."

        val notification = NotificationCompat.Builder(this, DokterDibyaApp.SERVICE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("dokterDIBYA")
            .setContentText(statusText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        notificationManager.notify(FOREGROUND_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        socketManager.disconnect()
        serviceScope.cancel()
        isStarted = false
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
