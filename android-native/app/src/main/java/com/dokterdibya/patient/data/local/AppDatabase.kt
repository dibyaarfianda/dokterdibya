package com.dokterdibya.patient.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room database for local caching
 * Provides offline-first capability for articles, notifications, and medications
 *
 * MIGRATION STRATEGY:
 * Since this database is used purely for caching (not primary data storage),
 * we use fallbackToDestructiveMigration() in DatabaseModule.
 * This means cache data will be cleared on schema changes, which is acceptable
 * because the data will be re-fetched from the server.
 *
 * For future schema changes that need to preserve data, add migrations below.
 */
@Database(
    entities = [
        ArticleEntity::class,
        NotificationEntity::class,
        MedicationEntity::class,
        CacheMetadata::class,
        ProfileEntity::class,
        AppointmentEntity::class,
        VisitHistoryEntity::class,
        AnnouncementEntity::class
    ],
    version = 2,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
    abstract fun notificationDao(): NotificationDao
    abstract fun medicationDao(): MedicationDao
    abstract fun cacheMetadataDao(): CacheMetadataDao
    abstract fun profileDao(): ProfileDao
    abstract fun appointmentDao(): AppointmentDao
    abstract fun visitHistoryDao(): VisitHistoryDao
    abstract fun announcementDao(): AnnouncementDao

    companion object {
        const val DATABASE_NAME = "dokterdibya_patient_db"

        // Cache expiry times
        const val CACHE_EXPIRY_ARTICLES = 24 * 60 * 60 * 1000L      // 24 hours
        const val CACHE_EXPIRY_NOTIFICATIONS = 60 * 60 * 1000L     // 1 hour
        const val CACHE_EXPIRY_MEDICATIONS = 12 * 60 * 60 * 1000L  // 12 hours
        const val CACHE_EXPIRY_PROFILE = 24 * 60 * 60 * 1000L       // 24 hours
        const val CACHE_EXPIRY_APPOINTMENTS = 2 * 60 * 60 * 1000L  // 2 hours
        const val CACHE_EXPIRY_VISIT_HISTORY = 24 * 60 * 60 * 1000L // 24 hours
        const val CACHE_EXPIRY_ANNOUNCEMENTS = 6 * 60 * 60 * 1000L  // 6 hours

        // Cache keys
        const val CACHE_KEY_ARTICLES = "articles"
        const val CACHE_KEY_NOTIFICATIONS = "notifications"
        const val CACHE_KEY_MEDICATIONS = "medications"
        const val CACHE_KEY_PROFILE = "profile"
        const val CACHE_KEY_APPOINTMENTS = "appointments"
        const val CACHE_KEY_VISIT_HISTORY = "visit_history"
        const val CACHE_KEY_ANNOUNCEMENTS = "announcements"

        /**
         * List of all migrations for use in DatabaseModule
         * Since we use fallbackToDestructiveMigration() for cache DB,
         * migrations are optional but can be added for smoother upgrades.
         */
        val ALL_MIGRATIONS: Array<Migration> = arrayOf(
            // Add migrations here as needed
        )
    }
}
