package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class UsgResult(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("exam_date")
    val examDate: String,
    @SerializedName("gestational_age")
    val gestationalAge: String?,
    @SerializedName("image_url")
    val imageUrl: String,
    @SerializedName("thumbnail_url")
    val thumbnailUrl: String?,
    val notes: String?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class UsgListResponse(
    val success: Boolean,
    val results: List<UsgResult>
)

data class LabResult(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("test_date")
    val testDate: String,
    @SerializedName("test_name")
    val testName: String,
    @SerializedName("result_value")
    val resultValue: String?,
    @SerializedName("normal_range")
    val normalRange: String?,
    val unit: String?,
    val status: String?,
    @SerializedName("file_url")
    val fileUrl: String?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class LabListResponse(
    val success: Boolean,
    val results: List<LabResult>
)

data class PatientDocument(
    val id: Int,
    @SerializedName("document_type")
    val documentType: String, // invoice, etiket, resume_medis, usg_2d, usg_4d, lab_result
    val title: String?,
    val description: String?,
    @SerializedName("file_url")
    val documentUrl: String?,
    @SerializedName("file_name")
    val filename: String?,
    @SerializedName("file_type")
    val fileType: String?,
    @SerializedName("file_size")
    val fileSize: Long?,
    @SerializedName("published_at")
    val publishedAt: String?,
    @SerializedName("mr_id")
    val mrId: String?,
    @SerializedName("created_at")
    val createdAt: String?,
    @SerializedName("location_name")
    val locationName: String?,
    @SerializedName("visit_date")
    val visitDate: String?,
    @SerializedName("is_read")
    val isRead: Int = 1  // 0 = unread (new), 1 = read
)

data class DocumentListResponse(
    val success: Boolean,
    val documents: List<PatientDocument>
)

data class DocumentContentResponse(
    val success: Boolean,
    val document: DocumentContent?
)

data class DocumentContent(
    val id: Int,
    val title: String?,
    val description: String?,
    @SerializedName("documentType")
    val documentType: String?,
    val content: String?,
    @SerializedName("fileUrl")
    val fileUrl: String?,
    @SerializedName("fileName")
    val fileName: String?
)

data class VisitHistory(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("visit_date")
    val visitDate: String,
    @SerializedName("visit_type")
    val visitType: String?,
    val complaint: String?,
    val diagnosis: String?,
    val treatment: String?,
    val notes: String?,
    @SerializedName("doctor_name")
    val doctorName: String?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class VisitListResponse(
    val success: Boolean,
    val visits: List<VisitHistory>
)
