package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class Patient(
    val id: String?,
    @SerializedName("full_name")
    val fullName: String?,
    val fullname: String?,  // Backend sends both
    val email: String?,
    val phone: String?,
    @SerializedName("birth_date")
    val birthDate: String?,
    @SerializedName("photo_url")
    val photoUrl: String?,
    @SerializedName("profile_picture")
    val profilePicture: String?,
    @SerializedName("is_pregnant")
    val isPregnant: Boolean = false,
    @SerializedName("pregnancy_start_date")
    val pregnancyStartDate: String?,
    @SerializedName("expected_due_date")
    val expectedDueDate: String?,
    @SerializedName("email_verified")
    val emailVerified: Int = 0,
    @SerializedName("profile_completed")
    val profileCompleted: Int = 0,
    @SerializedName("created_at")
    val createdAt: String?
) {
    // Helper to get name from either field
    val name: String
        get() = fullName ?: fullname ?: "Pasien"

    // Check if profile is complete (has birth_date)
    val isProfileComplete: Boolean
        get() = !birthDate.isNullOrBlank() || profileCompleted == 1
}

// Response for GET /api/patients/profile
data class PatientProfileResponse(
    val user: Patient?
)

// Legacy response (for older endpoints)
data class PatientResponse(
    val success: Boolean,
    val patient: Patient?
)

data class GoogleAuthRequest(
    val code: String,
    @SerializedName("redirect_uri")
    val redirectUri: String = ""  // Empty for Android app
)

data class AuthResponse(
    val success: Boolean,
    val token: String?,
    val user: Patient?,       // Backend returns 'user' not 'patient'
    val patient: Patient?,    // Keep for backward compatibility
    val message: String?
) {
    // Helper to get patient from either field
    val patientData: Patient?
        get() = user ?: patient
}

data class PregnancyInfo(
    val weeks: Int,
    val days: Int,
    val trimester: Int,
    val progress: Float, // 0.0 to 1.0
    val dueDate: String
)

// Request for completing profile (basic)
data class CompleteProfileRequest(
    val fullname: String,
    val phone: String,
    @SerializedName("birth_date")
    val birthDate: String,
    @SerializedName("registration_code")
    val registrationCode: String? = null
)

// Request for completing profile with full intake data
data class CompleteProfileFullRequest(
    @SerializedName("patient_name")
    val fullname: String,
    @SerializedName("patient_phone")
    val phone: String,
    @SerializedName("patient_dob")
    val birthDate: String,
    @SerializedName("patient_age")
    val age: Int? = null,
    val nik: String? = null,
    @SerializedName("patient_emergency_contact")
    val emergencyContact: String? = null,
    @SerializedName("patient_address")
    val address: String? = null,
    @SerializedName("patient_marital_status")
    val maritalStatus: String? = null,
    @SerializedName("patient_husband_name")
    val husbandName: String? = null,
    @SerializedName("husband_age")
    val husbandAge: Int? = null,
    @SerializedName("husband_job")
    val husbandJob: String? = null,
    @SerializedName("patient_occupation")
    val occupation: String? = null,
    @SerializedName("patient_education")
    val education: String? = null,
    @SerializedName("patient_insurance")
    val insurance: String? = null,
    @SerializedName("registration_code")
    val registrationCode: String
)

// Response for complete profile
data class CompleteProfileResponse(
    val success: Boolean,
    val message: String?,
    val user: Patient?
)
