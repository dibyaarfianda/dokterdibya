package com.dokterdibya.patient

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DokterDibyaApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Main notification channel (for patient notifications)
            val mainChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Notifikasi dokterDIBYA",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifikasi dari dokterDIBYA"
            }
            notificationManager.createNotificationChannel(mainChannel)

            // Service channel (for foreground service - min importance, hidden)
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Koneksi Background",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Menjaga koneksi notifikasi di background"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
            }
            notificationManager.createNotificationChannel(serviceChannel)

            // Delete old channel if exists (for upgrade)
            notificationManager.deleteNotificationChannel("dokterdibya_service")
        }
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "dokterdibya_notifications"
        const val SERVICE_CHANNEL_ID = "dokterdibya_service_v2"  // New ID for IMPORTANCE_MIN
    }
}
