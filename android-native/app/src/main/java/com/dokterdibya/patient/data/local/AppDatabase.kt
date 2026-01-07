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
        CacheMetadata::class
    ],
    version = 1,
    exportSchema = true
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

        /**
         * Example migration from version 1 to 2
         * Uncomment and modify when adding new columns/tables
         */
        // val MIGRATION_1_2 = object : Migration(1, 2) {
        //     override fun migrate(database: SupportSQLiteDatabase) {
        //         // Example: Add new column
        //         // database.execSQL("ALTER TABLE articles ADD COLUMN readAt INTEGER")
        //     }
        // }

        /**
         * List of all migrations for use in DatabaseModule
         */
        val ALL_MIGRATIONS: Array<Migration> = arrayOf(
            // Add migrations here as needed, e.g.:
            // MIGRATION_1_2,
            // MIGRATION_2_3,
        )
    }
}
