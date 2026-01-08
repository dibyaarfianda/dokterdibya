package com.dokterdibya.patient.di

import android.content.Context
import androidx.room.Room
import com.dokterdibya.patient.data.local.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        )
            // Add all defined migrations
            .addMigrations(*AppDatabase.ALL_MIGRATIONS)
            // For cache database, use destructive migration as fallback
            // This is safe because cache data can always be re-fetched from server
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideArticleDao(database: AppDatabase): ArticleDao {
        return database.articleDao()
    }

    @Provides
    fun provideNotificationDao(database: AppDatabase): NotificationDao {
        return database.notificationDao()
    }

    @Provides
    fun provideMedicationDao(database: AppDatabase): MedicationDao {
        return database.medicationDao()
    }

    @Provides
    fun provideCacheMetadataDao(database: AppDatabase): CacheMetadataDao {
        return database.cacheMetadataDao()
    }

    @Provides
    fun provideProfileDao(database: AppDatabase): ProfileDao {
        return database.profileDao()
    }

    @Provides
    fun provideAppointmentDao(database: AppDatabase): AppointmentDao {
        return database.appointmentDao()
    }

    @Provides
    fun provideVisitHistoryDao(database: AppDatabase): VisitHistoryDao {
        return database.visitHistoryDao()
    }

    @Provides
    fun provideAnnouncementDao(database: AppDatabase): AnnouncementDao {
        return database.announcementDao()
    }
}
