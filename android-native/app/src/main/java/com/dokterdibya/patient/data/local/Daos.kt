package com.dokterdibya.patient.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Objects for Room database
 */

@Dao
interface ArticleDao {
    @Query("SELECT * FROM articles ORDER BY createdAt DESC")
    fun getAllArticles(): Flow<List<ArticleEntity>>

    @Query("SELECT * FROM articles ORDER BY createdAt DESC")
    suspend fun getAllArticlesOnce(): List<ArticleEntity>

    @Query("SELECT * FROM articles WHERE id = :id")
    suspend fun getArticleById(id: Int): ArticleEntity?

    @Query("SELECT * FROM articles WHERE category = :category ORDER BY createdAt DESC")
    fun getArticlesByCategory(category: String): Flow<List<ArticleEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(articles: List<ArticleEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(article: ArticleEntity)

    @Query("DELETE FROM articles")
    suspend fun deleteAll()

    @Query("DELETE FROM articles WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}

@Dao
interface NotificationDao {
    @Query("SELECT * FROM notifications ORDER BY createdAt DESC")
    fun getAllNotifications(): Flow<List<NotificationEntity>>

    @Query("SELECT * FROM notifications ORDER BY createdAt DESC")
    suspend fun getAllNotificationsOnce(): List<NotificationEntity>

    @Query("SELECT COUNT(*) FROM notifications WHERE isRead = 0")
    suspend fun getUnreadCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(notifications: List<NotificationEntity>)

    @Query("UPDATE notifications SET isRead = 1 WHERE id = :id")
    suspend fun markAsRead(id: Int)

    @Query("DELETE FROM notifications")
    suspend fun deleteAll()

    @Query("DELETE FROM notifications WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}

@Dao
interface MedicationDao {
    @Query("SELECT * FROM medications ORDER BY visitDate DESC")
    fun getAllMedications(): Flow<List<MedicationEntity>>

    @Query("SELECT * FROM medications ORDER BY visitDate DESC")
    suspend fun getAllMedicationsOnce(): List<MedicationEntity>

    @Query("SELECT * FROM medications WHERE isCurrent = 1 ORDER BY visitDate DESC")
    fun getCurrentMedications(): Flow<List<MedicationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(medications: List<MedicationEntity>)

    @Query("DELETE FROM medications")
    suspend fun deleteAll()

    @Query("DELETE FROM medications WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}

@Dao
interface CacheMetadataDao {
    @Query("SELECT * FROM cache_metadata WHERE `key` = :key")
    suspend fun get(key: String): CacheMetadata?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(metadata: CacheMetadata)

    @Query("DELETE FROM cache_metadata WHERE `key` = :key")
    suspend fun delete(key: String)
}

@Dao
interface ProfileDao {
    @Query("SELECT * FROM profiles LIMIT 1")
    suspend fun getProfile(): ProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(profile: ProfileEntity)

    @Query("DELETE FROM profiles")
    suspend fun deleteAll()
}

@Dao
interface AppointmentDao {
    @Query("SELECT * FROM appointments ORDER BY appointmentDate ASC")
    fun getAllAppointments(): Flow<List<AppointmentEntity>>

    @Query("SELECT * FROM appointments ORDER BY appointmentDate ASC")
    suspend fun getAllAppointmentsOnce(): List<AppointmentEntity>

    @Query("SELECT * FROM appointments WHERE status = 'confirmed' OR status = 'scheduled' ORDER BY appointmentDate ASC")
    suspend fun getUpcomingAppointments(): List<AppointmentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(appointments: List<AppointmentEntity>)

    @Query("DELETE FROM appointments")
    suspend fun deleteAll()

    @Query("DELETE FROM appointments WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}

@Dao
interface VisitHistoryDao {
    @Query("SELECT * FROM visit_history ORDER BY billingDate DESC")
    fun getAllVisitHistory(): Flow<List<VisitHistoryEntity>>

    @Query("SELECT * FROM visit_history ORDER BY billingDate DESC")
    suspend fun getAllVisitHistoryOnce(): List<VisitHistoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(visits: List<VisitHistoryEntity>)

    @Query("DELETE FROM visit_history")
    suspend fun deleteAll()

    @Query("DELETE FROM visit_history WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}

@Dao
interface AnnouncementDao {
    @Query("SELECT * FROM announcements ORDER BY createdAt DESC")
    fun getAllAnnouncements(): Flow<List<AnnouncementEntity>>

    @Query("SELECT * FROM announcements ORDER BY createdAt DESC")
    suspend fun getAllAnnouncementsOnce(): List<AnnouncementEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(announcements: List<AnnouncementEntity>)

    @Query("UPDATE announcements SET likedByMe = :liked, likeCount = :count WHERE id = :id")
    suspend fun updateLike(id: Int, liked: Boolean, count: Int)

    @Query("DELETE FROM announcements")
    suspend fun deleteAll()

    @Query("DELETE FROM announcements WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}
