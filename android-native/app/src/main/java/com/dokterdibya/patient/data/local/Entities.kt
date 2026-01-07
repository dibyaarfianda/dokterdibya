package com.dokterdibya.patient.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.dokterdibya.patient.data.api.Article
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.data.api.PatientNotificationItem

/**
 * Room entities for local caching
 */

@Entity(tableName = "articles")
data class ArticleEntity(
    @PrimaryKey val id: Int,
    val title: String,
    val slug: String?,
    val content: String?,
    val excerpt: String?,
    val category: String?,
    val imageUrl: String?,
    val author: String?,
    val publishedAt: String?,
    val createdAt: String?,
    val cachedAt: Long = System.currentTimeMillis()
) {
    fun toArticle() = Article(
        id = id,
        title = title,
        slug = slug,
        content = content,
        excerpt = excerpt,
        category = category,
        imageUrl = imageUrl,
        author = author,
        publishedAt = publishedAt,
        createdAt = createdAt
    )

    companion object {
        fun fromArticle(article: Article) = ArticleEntity(
            id = article.id,
            title = article.title,
            slug = article.slug,
            content = article.content,
            excerpt = article.excerpt,
            category = article.category,
            imageUrl = article.imageUrl,
            author = article.author,
            publishedAt = article.publishedAt,
            createdAt = article.createdAt
        )
    }
}

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey val id: Int,
    val patientId: String,
    val type: String?,
    val title: String,
    val message: String,
    val icon: String?,
    val iconColor: String?,
    val isRead: Int,
    val createdAt: String?,
    val cachedAt: Long = System.currentTimeMillis()
) {
    fun toNotification() = PatientNotificationItem(
        id = id,
        patient_id = patientId,
        type = type,
        title = title,
        message = message,
        icon = icon,
        icon_color = iconColor,
        is_read = isRead,
        created_at = createdAt
    )

    companion object {
        fun fromNotification(notification: PatientNotificationItem) = NotificationEntity(
            id = notification.id,
            patientId = notification.patient_id,
            type = notification.type,
            title = notification.title,
            message = notification.message,
            icon = notification.icon,
            iconColor = notification.icon_color,
            isRead = notification.is_read,
            createdAt = notification.created_at
        )
    }
}

@Entity(tableName = "medications")
data class MedicationEntity(
    @PrimaryKey val id: Int,
    val mrId: String?,
    val visitDate: String?,
    val terapi: String?,
    val isCurrent: Int,
    val cachedAt: Long = System.currentTimeMillis()
) {
    fun toMedication() = Medication(
        id = id,
        mr_id = mrId,
        visit_date = visitDate,
        terapi = terapi,
        is_current = isCurrent
    )

    companion object {
        fun fromMedication(medication: Medication) = MedicationEntity(
            id = medication.id,
            mrId = medication.mr_id,
            visitDate = medication.visit_date,
            terapi = medication.terapi,
            isCurrent = medication.is_current
        )
    }
}

@Entity(tableName = "cache_metadata")
data class CacheMetadata(
    @PrimaryKey val key: String,
    val lastUpdated: Long = System.currentTimeMillis()
)
