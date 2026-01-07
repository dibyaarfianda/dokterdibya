package com.dokterdibya.patient.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * Room database for local caching
 * Provides offline-first capability for articles, notifications, and medications
 */
@Database(
    entities = [
        ArticleEntity::class,
        NotificationEntity::class,
        MedicationEntity::class,
        CacheMetadata::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
    abstract fun notificationDao(): NotificationDao
    abstract fun medicationDao(): MedicationDao
    abstract fun cacheMetadataDao(): CacheMetadataDao

    companion object {
        const val DATABASE_NAME = "dokterdibya_patient_db"

        // Cache expiry times
        const val CACHE_EXPIRY_ARTICLES = 24 * 60 * 60 * 1000L      // 24 hours
        const val CACHE_EXPIRY_NOTIFICATIONS = 60 * 60 * 1000L     // 1 hour
        const val CACHE_EXPIRY_MEDICATIONS = 12 * 60 * 60 * 1000L  // 12 hours

        // Cache keys
        const val CACHE_KEY_ARTICLES = "articles"
        const val CACHE_KEY_NOTIFICATIONS = "notifications"
        const val CACHE_KEY_MEDICATIONS = "medications"
    }
}
