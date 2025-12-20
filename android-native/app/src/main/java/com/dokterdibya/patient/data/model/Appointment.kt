package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class Appointment(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int? = null,
    @SerializedName("appointment_date")
    val appointmentDate: String,
    // API returns "time" field
    val time: String? = null,
    // Keep for backward compatibility
    @SerializedName("time_slot")
    val timeSlot: String? = null,
    val status: String,
    val notes: String? = null,
    val session: Int? = null,
    @SerializedName("slot_number")
    val slotNumber: Int? = null,
    @SerializedName("queue_number")
    val queueNumber: Int? = null,
    // Extra fields from API
    val sessionLabel: String? = null,
    val dateFormatted: String? = null,
    val isPast: Boolean? = null,
    val categoryLabel: String? = null,
    @SerializedName("chief_complaint")
    val chiefComplaint: String? = null,
    @SerializedName("consultation_category")
    val consultationCategory: String? = null,
    @SerializedName("created_at")
    val createdAt: String? = null
) {
    // Helper to get display time (from either field)
    fun getDisplayTime(): String = time ?: timeSlot ?: ""

    // Helper to get display date
    fun getDisplayDate(): String = dateFormatted ?: appointmentDate
}

data class AppointmentListResponse(
    val success: Boolean? = null,
    val appointments: List<Appointment>
)

// Response from /api/sunday-appointments/sundays
data class SundayDate(
    val date: String,
    val formatted: String,
    val dayOfWeek: Int
)

data class SundaysResponse(
    val sundays: List<SundayDate>
)

// Response from /api/sunday-appointments/available?date=
data class TimeSlot(
    val number: Int,
    val time: String,
    val available: Boolean
)

data class SessionSlots(
    val session: Int,
    val label: String,
    val slots: List<TimeSlot>
)

data class SlotsForDateResponse(
    val date: String,
    val dayOfWeek: String,
    val sessions: List<SessionSlots>
)

// Legacy models (kept for compatibility)
data class AvailableSlot(
    val date: String,
    @SerializedName("time_slot")
    val timeSlot: String,
    @SerializedName("slots_available")
    val slotsAvailable: Int
)

data class AvailableSlotsResponse(
    val success: Boolean,
    val slots: List<AvailableSlot>
)

data class BookingRequest(
    @SerializedName("appointment_date")
    val appointmentDate: String,
    val session: Int,
    @SerializedName("slot_number")
    val slotNumber: Int,
    @SerializedName("chief_complaint")
    val chiefComplaint: String,
    @SerializedName("consultation_category")
    val consultationCategory: String = "obstetri"
)

data class BookingResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val appointmentId: Int? = null,
    val status: String? = null,
    val details: BookingDetails? = null
)

data class BookingDetails(
    val date: String? = null,
    val session: String? = null,
    val time: String? = null,
    val slot: Int? = null
)
