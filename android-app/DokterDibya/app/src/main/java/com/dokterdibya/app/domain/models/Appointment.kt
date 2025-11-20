package com.dokterdibya.app.domain.models

data class Appointment(
    val id: Int,
    val patientId: String,
    val patientName: String,
    val patientPhone: String,
    val appointmentDate: String,
    val session: Int, // 1=morning, 2=afternoon, 3=evening
    val slotNumber: Int,
    val appointmentTime: String,
    val status: String,
    val notes: String? = null,
    val createdAt: String
)

data class AppointmentResponse(
    val success: Boolean,
    val message: String,
    val data: List<Appointment>?
)

data class SingleAppointmentResponse(
    val success: Boolean,
    val message: String,
    val data: Appointment?
)

data class BookAppointmentRequest(
    val appointmentDate: String,
    val session: Int,
    val slotNumber: Int,
    val notes: String? = null
)

data class AvailableSlots(
    val date: String,
    val session: Int,
    val slots: List<TimeSlot>
)

data class TimeSlot(
    val slotNumber: Int,
    val time: String,
    val available: Boolean
)

data class AvailableSlotsResponse(
    val success: Boolean,
    val data: List<AvailableSlots>?
)
