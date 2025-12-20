package com.dokterdibya.patient.data.api

import com.dokterdibya.patient.data.model.*
import com.dokterdibya.patient.data.model.CompleteProfileRequest
import com.dokterdibya.patient.data.model.CompleteProfileResponse
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    companion object {
        const val BASE_URL = "https://dokterdibya.com/"
    }

    // ==================== Authentication ====================

    @POST("api/patients/google-auth-code")
    suspend fun googleAuth(@Body request: GoogleAuthRequest): Response<AuthResponse>

    @GET("api/patients/profile")
    suspend fun getPatientProfile(): Response<PatientProfileResponse>

    @POST("api/patients/complete-profile")
    suspend fun completeProfile(@Body request: CompleteProfileRequest): Response<CompleteProfileResponse>

    // ==================== Appointments ====================

    @GET("api/sunday-appointments/patient")
    suspend fun getPatientAppointments(): Response<AppointmentListResponse>

    @GET("api/sunday-appointments/sundays")
    suspend fun getAvailableSundays(): Response<SundaysResponse>

    @GET("api/sunday-appointments/available")
    suspend fun getAvailableSlots(
        @Query("date") date: String
    ): Response<SlotsForDateResponse>

    @POST("api/sunday-appointments/book")
    suspend fun bookAppointment(@Body request: BookingRequest): Response<BookingResponse>

    @PUT("api/sunday-appointments/{id}/cancel")
    suspend fun cancelAppointment(
        @Path("id") id: Int,
        @Body request: CancelRequest
    ): Response<BookingResponse>

    // ==================== Medical Records ====================

    @GET("api/patient-documents/my-documents")
    suspend fun getDocuments(
        @Query("type") type: String? = null
    ): Response<DocumentListResponse>

    // ==================== Fertility Calendar ====================

    @GET("api/fertility-calendar")
    suspend fun getFertilityCycles(): Response<FertilityCycleResponse>

    @GET("api/fertility-calendar/predictions")
    suspend fun getFertilityPredictions(
        @Query("months") months: Int = 3
    ): Response<FertilityPredictionResponse>

    @POST("api/fertility-calendar")
    suspend fun createFertilityCycle(@Body request: CreateCycleRequest): Response<FertilityCycleResponse>

    // ==================== Articles ====================

    @GET("api/articles")
    suspend fun getArticles(
        @Query("category") category: String? = null,
        @Query("limit") limit: Int = 10
    ): Response<ArticleListResponse>

    @GET("api/articles/{id}")
    suspend fun getArticleDetail(@Path("id") id: Int): Response<ArticleResponse>

    // ==================== Practice Schedules ====================

    @GET("api/practice-schedules")
    suspend fun getPracticeSchedules(
        @Query("location") location: String
    ): Response<PracticeScheduleResponse>

    // ==================== Visit History / Billings ====================

    @GET("api/billings/my-billings")
    suspend fun getMyBillings(): Response<BillingListResponse>

    @GET("api/billings/{id}/details")
    suspend fun getBillingDetails(@Path("id") id: Int): Response<BillingDetailResponse>

    // ==================== App Updates ====================

    @GET("api/app/version")
    suspend fun checkAppVersion(): Response<AppVersionResponse>

    // ==================== Announcements ====================

    @GET("api/announcements/active")
    suspend fun getActiveAnnouncements(
        @Query("patient_id") patientId: String? = null
    ): Response<AnnouncementsResponse>

    @POST("api/announcements/{id}/like")
    suspend fun toggleAnnouncementLike(
        @Path("id") id: Int,
        @Body request: LikeRequest
    ): Response<LikeResponse>

    // ==================== Medications ====================

    @GET("api/patients/medications")
    suspend fun getMedications(): Response<MedicationsResponse>

    // ==================== Pregnancy Data ====================

    @GET("api/patients/pregnancy-data")
    suspend fun getPregnancyData(): Response<PregnancyDataResponse>
}

// Practice Schedule models
data class PracticeSchedule(
    val id: Int,
    val location: String,
    val day_of_week: Int,
    val start_time: String,
    val end_time: String,
    val notes: String?,
    val is_active: Int
)

data class PracticeScheduleResponse(
    val schedules: List<PracticeSchedule>
)

// Additional response models
data class Article(
    val id: Int,
    val title: String,
    val slug: String?,
    val content: String?,
    val excerpt: String?,
    val category: String?,
    val imageUrl: String?,
    val author: String?,
    val publishedAt: String?,
    val createdAt: String?
)

data class ArticleListResponse(
    val success: Boolean,
    val articles: List<Article>
)

data class ArticleResponse(
    val success: Boolean,
    val article: Article?
)

// Billing models for visit history
data class Billing(
    val id: Int,
    val billing_number: String?,
    val billing_date: String?,
    val patient_id: Int,
    val patient_name: String?,
    val total_amount: Double,
    val paid_amount: Double?,
    val payment_status: String?,
    val subtotal: Double?,
    val discount_amount: Double?,
    val discount_percent: Double?,
    val tax_amount: Double?,
    val tax_percent: Double?,
    val notes: String?,
    val patient_record_id: Int?
)

data class BillingItem(
    val id: Int,
    val billing_id: Int,
    val item_type: String?,
    val item_name: String?,
    val description: String?,
    val quantity: Double,
    val unit_price: Double,
    val total_amount: Double
)

data class BillingDetail(
    val id: Int,
    val billing_number: String?,
    val billing_date: String?,
    val patient_id: Int,
    val patient_name: String?,
    val total_amount: Double,
    val paid_amount: Double?,
    val payment_status: String?,
    val subtotal: Double?,
    val discount_amount: Double?,
    val discount_percent: Double?,
    val tax_amount: Double?,
    val tax_percent: Double?,
    val notes: String?,
    val patient_record_id: Int?,
    val items: List<BillingItem>
)

data class BillingListResponse(
    val success: Boolean,
    val count: Int?,
    val data: List<Billing>
)

data class BillingDetailResponse(
    val success: Boolean,
    val data: BillingDetail?
)

// Announcement models
data class Announcement(
    val id: Int,
    val title: String,
    val message: String,
    val image_url: String? = null,
    val formatted_content: String? = null,
    val content_type: String? = null,
    val created_by_name: String? = null,
    val priority: String? = null,
    val created_at: String? = null,
    val like_count: Int = 0,
    val liked_by_me: Boolean = false
)

data class AnnouncementsResponse(
    val success: Boolean,
    val data: List<Announcement>
)

data class LikeRequest(
    val patient_id: String
)

data class LikeResponse(
    val success: Boolean,
    val liked: Boolean,
    val like_count: Int
)

// Medication models
data class Medication(
    val id: Int,
    val mr_id: String? = null,
    val visit_date: String? = null,
    val terapi: String? = null,
    val is_current: Int = 0
)

data class MedicationsResponse(
    val success: Boolean,
    val data: List<Medication>
)

// Pregnancy data models
data class PregnancyData(
    val is_pregnant: Boolean = false,
    val weeks: Int = 0,
    val days: Int = 0,
    val trimester: Int = 0,
    val hpht: String? = null,
    val hpl: String? = null,
    val progress: Double = 0.0,
    // Birth info (if delivered)
    val has_given_birth: Boolean = false,
    val birth_date: String? = null,
    val birth_time: String? = null,
    val baby_name: String? = null,
    val baby_weight: String? = null,
    val baby_length: String? = null,
    val baby_photo_url: String? = null,
    val doctor_message: String? = null
)

data class PregnancyDataResponse(
    val success: Boolean,
    val data: PregnancyData?
)

// Cancel request
data class CancelRequest(
    val reason: String
)
