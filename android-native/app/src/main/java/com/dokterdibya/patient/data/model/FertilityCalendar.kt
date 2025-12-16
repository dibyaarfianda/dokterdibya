package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class FertilityCycle(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("cycle_start_date")
    val cycleStartDate: String,
    @SerializedName("cycle_length")
    val cycleLength: Int = 28,
    @SerializedName("period_length")
    val periodLength: Int = 5,
    @SerializedName("ovulation_date")
    val ovulationDate: String?,
    @SerializedName("fertile_window_start")
    val fertileWindowStart: String?,
    @SerializedName("fertile_window_end")
    val fertileWindowEnd: String?,
    @SerializedName("next_period_date")
    val nextPeriodDate: String?,
    @SerializedName("created_at")
    val createdAt: String?
)

data class FertilityCycleResponse(
    val success: Boolean,
    val cycle: FertilityCycle?,
    val cycles: List<FertilityCycle>?
)

data class FertilityPrediction(
    @SerializedName("menstruation_dates")
    val menstruationDates: List<String>,
    @SerializedName("fertile_dates")
    val fertileDates: List<String>,
    @SerializedName("ovulation_date")
    val ovulationDate: String?,
    @SerializedName("next_period_date")
    val nextPeriodDate: String?
)

data class FertilityPredictionResponse(
    val success: Boolean,
    val prediction: FertilityPrediction?
)

data class CreateCycleRequest(
    @SerializedName("cycle_start_date")
    val cycleStartDate: String,
    @SerializedName("cycle_length")
    val cycleLength: Int = 28,
    @SerializedName("period_length")
    val periodLength: Int = 5
)

// Calendar day types for UI
enum class CalendarDayType {
    NORMAL,
    MENSTRUATION,
    FERTILE,
    OVULATION
}

data class CalendarDay(
    val date: String,
    val dayOfMonth: Int,
    val type: CalendarDayType,
    val isCurrentMonth: Boolean = true
)
