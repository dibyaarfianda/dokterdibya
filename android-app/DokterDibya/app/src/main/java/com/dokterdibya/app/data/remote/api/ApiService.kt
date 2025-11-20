package com.dokterdibya.app.data.remote.api

import com.dokterdibya.app.domain.models.*
import retrofit2.http.*

interface ApiService {

    // Authentication - Patient
    @POST("patients/login")
    suspend fun loginPatient(@Body request: LoginRequest): AuthResponse

    @POST("patients/register")
    suspend fun registerPatient(@Body request: RegisterRequest): AuthResponse

    @POST("patients/auth/google")
    suspend fun googleAuth(@Body request: GoogleAuthRequest): AuthResponse

    @GET("patients/profile")
    suspend fun getProfile(): AuthResponse

    @PUT("patients/profile")
    suspend fun updateProfile(@Body profile: Map<String, Any>): AuthResponse

    // Authentication - Staff
    @POST("auth/login")
    suspend fun loginStaff(@Body request: LoginRequest): AuthResponse

    @GET("auth/me")
    suspend fun getStaffProfile(): AuthResponse

    // Appointments
    @GET("sunday-appointments/my-appointments")
    suspend fun getMyAppointments(): AppointmentResponse

    @GET("sunday-appointments/available")
    suspend fun getAvailableSlots(
        @Query("date") date: String
    ): AvailableSlotsResponse

    @GET("sunday-appointments/sundays")
    suspend fun getUpcomingSundays(): Map<String, List<String>>

    @POST("sunday-appointments/book")
    suspend fun bookAppointment(@Body request: BookAppointmentRequest): SingleAppointmentResponse

    @PATCH("sunday-appointments/{id}/cancel")
    suspend fun cancelAppointment(@Path("id") id: Int): SingleAppointmentResponse

    // Announcements
    @GET("announcements/active")
    suspend fun getActiveAnnouncements(): AnnouncementResponse
}
