package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class FertilityCycle(
    val id: Int,
    @SerializedName("patient_id")
    val patientId: Int,
    @SerializedName("period_start_date")
    val cycleStartDate: String,
    @SerializedName("cycle_length")
    val cycleLength: Int = 28,
    @SerializedName("period_length")
    val periodLength: Int = 5,
    val fertility: FertilityInfo? = null
)

data class FertilityInfo(
    @SerializedName("ovulationDate")
    val ovulationDate: String?,
    @SerializedName("fertileStart")
    val fertileStart: String?,
    @SerializedName("fertileEnd")
    val fertileEnd: String?,
    @SerializedName("nextPeriod")
    val nextPeriod: String?
)

data class FertilityCycleResponse(
    val success: Boolean,
    val cycles: List<FertilityCycle>?,
    val currentFertility: FertilityInfo?,
    val averageCycleLength: Int?,
    val totalCycles: Int?
)

data class FertilityPrediction(
    val cycleNumber: Int?,
    val periodStart: String?,
    @SerializedName("ovulationDate")
    val ovulationDate: String?,
    @SerializedName("fertileStart")
    val fertileStart: String?,
    @SerializedName("fertileEnd")
    val fertileEnd: String?,
    // Legacy fields for backward compatibility
    @SerializedName("menstruation_dates")
    val menstruationDates: List<String>? = null,
    @SerializedName("fertile_dates")
    val fertileDates: List<String>? = null,
    @SerializedName("next_period_date")
    val nextPeriodDate: String? = null
)

data class FertilityPredictionResponse(
    val success: Boolean,
    val predictions: List<FertilityPrediction>?,
    val message: String?
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
