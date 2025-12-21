package com.dokterdibya.patient

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DokterDibyaApp : Application(), ImageLoaderFactory {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .components {
                add(SvgDecoder.Factory())
            }
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Main notification channel (for patient notifications)
            // Delete old channel first to update settings
            notificationManager.deleteNotificationChannel("dokterdibya_notifications")

            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val mainChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Notifikasi dokterDIBYA",
                NotificationManager.IMPORTANCE_HIGH  // HIGH for heads-up notifications
            ).apply {
                description = "Notifikasi dari dokterDIBYA"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                setSound(soundUri, audioAttributes)
                enableLights(true)
                lightColor = android.graphics.Color.MAGENTA
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(mainChannel)

            // Service channel (for foreground service - NONE importance to hide completely)
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Background Service",
                NotificationManager.IMPORTANCE_NONE
            ).apply {
                description = "Background connection service"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_SECRET
            }
            notificationManager.createNotificationChannel(serviceChannel)

            // Delete old channels if exists (for upgrade)
            notificationManager.deleteNotificationChannel("dokterdibya_service")
            notificationManager.deleteNotificationChannel("dokterdibya_service_v2")
        }
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "dokterdibya_notifications_v2"  // New ID for HIGH importance
        const val SERVICE_CHANNEL_ID = "dokterdibya_service_v3"  // New ID for IMPORTANCE_NONE
    }
}
