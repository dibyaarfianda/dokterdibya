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

            // Service channel (for foreground service - low importance, silent)
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Koneksi Background",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Menjaga koneksi notifikasi di background"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(serviceChannel)
        }
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "dokterdibya_notifications"
        const val SERVICE_CHANNEL_ID = "dokterdibya_service"
    }
}
