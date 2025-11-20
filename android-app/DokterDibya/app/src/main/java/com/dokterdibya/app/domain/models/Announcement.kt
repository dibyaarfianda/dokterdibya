package com.dokterdibya.app.domain.models

data class Announcement(
    val id: Int,
    val title: String,
    val message: String,
    val imageUrl: String? = null,
    val formattedContent: String? = null,
    val contentType: String = "plain",
    val priority: String = "normal",
    val status: String = "active",
    val createdBy: String,
    val createdByName: String,
    val createdAt: String
)

data class AnnouncementResponse(
    val success: Boolean,
    val message: String? = null,
    val data: List<Announcement>?
)
