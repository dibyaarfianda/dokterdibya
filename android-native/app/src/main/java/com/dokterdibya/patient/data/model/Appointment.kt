package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class Appointment(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("appointment_date")
    val appointmentDate: String,
    @SerializedName("time_slot")
    val timeSlot: String,
    val status: String,
    val notes: String?,
    @SerializedName("queue_number")
    val queueNumber: Int?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class AppointmentListResponse(
    val success: Boolean,
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
    @SerializedName("time_slot")
    val timeSlot: String,
    val notes: String?
)

data class BookingResponse(
    val success: Boolean,
    val appointment: Appointment?,
    val message: String?
)
