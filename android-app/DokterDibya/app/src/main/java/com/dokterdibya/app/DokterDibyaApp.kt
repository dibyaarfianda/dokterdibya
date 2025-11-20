package com.dokterdibya.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class DokterDibyaApp : Application(), Configuration.Provider {

    override fun onCreate() {
        super.onCreate()

        // Initialize Timber for logging
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }

        // Create notification channels
        createNotificationChannels()

        Timber.d("DokterDibyaApp initialized")
    }

    override fun getWorkManagerConfiguration(): Configuration {
        return Configuration.Builder()
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) android.util.Log.DEBUG else android.util.Log.ERROR)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Default channel
            val defaultChannel = NotificationChannel(
                CHANNEL_DEFAULT,
                "General Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General app notifications"
            }

            // Appointment channel
            val appointmentChannel = NotificationChannel(
                CHANNEL_APPOINTMENT,
                "Appointments",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Appointment reminders and updates"
            }

            // Announcement channel
            val announcementChannel = NotificationChannel(
                CHANNEL_ANNOUNCEMENT,
                "Announcements",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Clinic announcements"
            }

            // Chat channel
            val chatChannel = NotificationChannel(
                CHANNEL_CHAT,
                "Team Chat",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Team chat messages"
            }

            notificationManager.createNotificationChannels(listOf(
                defaultChannel,
                appointmentChannel,
                announcementChannel,
                chatChannel
            ))
        }
    }

    companion object {
        const val CHANNEL_DEFAULT = "dokter_dibya_default"
        const val CHANNEL_APPOINTMENT = "dokter_dibya_appointment"
        const val CHANNEL_ANNOUNCEMENT = "dokter_dibya_announcement"
        const val CHANNEL_CHAT = "dokter_dibya_chat"
    }
}
