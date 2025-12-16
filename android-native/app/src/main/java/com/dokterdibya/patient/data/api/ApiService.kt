package com.dokterdibya.patient.data.api

import com.dokterdibya.patient.data.model.*
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

    @DELETE("api/sunday-appointments/{id}")
    suspend fun cancelAppointment(@Path("id") id: Int): Response<BookingResponse>

    // ==================== Medical Records ====================

    @GET("api/patient/usg-results")
    suspend fun getUsgResults(): Response<UsgListResponse>

    @GET("api/patient/lab-results")
    suspend fun getLabResults(): Response<LabListResponse>

    @GET("api/patient/documents")
    suspend fun getDocuments(
        @Query("type") type: String? = null
    ): Response<DocumentListResponse>

    @GET("api/patient/visits")
    suspend fun getVisitHistory(): Response<VisitListResponse>

    // ==================== Fertility Calendar ====================

    @GET("api/fertility-calendar/cycles")
    suspend fun getFertilityCycles(): Response<FertilityCycleResponse>

    @GET("api/fertility-calendar/prediction")
    suspend fun getFertilityPrediction(
        @Query("month") month: Int,
        @Query("year") year: Int
    ): Response<FertilityPredictionResponse>

    @POST("api/fertility-calendar/cycle")
    suspend fun createFertilityCycle(@Body request: CreateCycleRequest): Response<FertilityCycleResponse>

    // ==================== Articles ====================

    @GET("api/articles")
    suspend fun getArticles(
        @Query("category") category: String? = null,
        @Query("limit") limit: Int = 10
    ): Response<ArticleListResponse>

    @GET("api/articles/{id}")
    suspend fun getArticleDetail(@Path("id") id: Int): Response<ArticleResponse>

    // ==================== App Updates ====================

    @GET("api/app/version")
    suspend fun checkAppVersion(): Response<AppVersionResponse>
}

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
