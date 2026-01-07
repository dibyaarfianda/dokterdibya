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
