package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

/**
 * Request model for patient intake form submission
 * Matches the web patient-intake.html payload format
 */
data class PatientIntakeRequest(
    // Personal Info (Required)
    @SerializedName("full_name") val fullName: String,
    @SerializedName("dob") val dob: String,
    @SerializedName("phone") val phone: String,

    // Personal Info (Optional)
    @SerializedName("age") val age: Int? = null,
    @SerializedName("height") val height: String? = null,
    @SerializedName("height_unknown") val heightUnknown: Boolean = false,
    @SerializedName("nik") val nik: String? = null,
    @SerializedName("address") val address: String? = null,
    @SerializedName("emergency_contact") val emergencyContact: String? = null,

    // Marital & Family Info
    @SerializedName("marital_status") val maritalStatus: String? = null,
    @SerializedName("husband_name") val husbandName: String? = null,
    @SerializedName("husband_age") val husbandAge: String? = null,
    @SerializedName("husband_job") val husbandJob: String? = null,

    // Children Info
    @SerializedName("has_children") val hasChildren: String? = null, // "ya" or "tidak"
    @SerializedName("living_children_count") val livingChildrenCount: String? = null,
    @SerializedName("youngest_child_age") val youngestChildAge: String? = null,

    // Obstetric History
    @SerializedName("total_pregnancies") val totalPregnancies: String? = null,
    @SerializedName("normal_delivery_count") val normalDeliveryCount: String? = null,
    @SerializedName("cesarean_delivery_count") val cesareanDeliveryCount: String? = null,
    @SerializedName("miscarriage_count") val miscarriageCount: String? = null,
    @SerializedName("had_ectopic") val hadEctopic: String? = null, // "ya" or "tidak"

    // Social Info
    @SerializedName("occupation") val occupation: String? = null,
    @SerializedName("education") val education: String? = null,
    @SerializedName("payment_method") val paymentMethod: List<String>? = null, // ["self", "bpjs", "insurance"]
    @SerializedName("insurance_name") val insuranceName: String? = null,

    // Blood Info
    @SerializedName("blood_type") val bloodType: String? = null,
    @SerializedName("rhesus") val rhesus: String? = null,

    // Allergies
    @SerializedName("allergy_drugs") val allergyDrugs: String? = null,
    @SerializedName("allergy_food") val allergyFood: String? = null,
    @SerializedName("allergy_env") val allergyEnv: String? = null,

    // Current Medications (up to 3)
    @SerializedName("med_name_1") val medName1: String? = null,
    @SerializedName("med_dose_1") val medDose1: String? = null,
    @SerializedName("med_freq_1") val medFreq1: String? = null,
    @SerializedName("med_name_2") val medName2: String? = null,
    @SerializedName("med_dose_2") val medDose2: String? = null,
    @SerializedName("med_freq_2") val medFreq2: String? = null,
    @SerializedName("med_name_3") val medName3: String? = null,
    @SerializedName("med_dose_3") val medDose3: String? = null,
    @SerializedName("med_freq_3") val medFreq3: String? = null,

    // Medical History
    @SerializedName("past_conditions") val pastConditions: List<String>? = null,
    @SerializedName("past_conditions_detail") val pastConditionsDetail: String? = null,

    // Family History
    @SerializedName("family_history") val familyHistory: List<String>? = null,
    @SerializedName("family_history_detail") val familyHistoryDetail: String? = null,

    // Consent & Signature (Required)
    @SerializedName("consent") val consent: Boolean = false,
    @SerializedName("final_ack") val finalAck: Boolean = false,
    @SerializedName("patient_signature") val patientSignature: String,

    // Metadata (Required)
    @SerializedName("metadata") val metadata: IntakeMetadata
)

/**
 * Metadata for intake submission
 */
data class IntakeMetadata(
    @SerializedName("submittedAt") val submittedAt: String,
    @SerializedName("userAgent") val userAgent: String = "dokterDIBYA Android App",
    @SerializedName("deviceTimestamp") val deviceTimestamp: String,
    @SerializedName("stage") val stage: String = "production"
)

/**
 * Response from patient intake submission
 */
data class PatientIntakeResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("submissionId") val submissionId: String? = null,
    @SerializedName("quickId") val quickId: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("autoVerified") val autoVerified: Boolean? = null,
    @SerializedName("intakeCategory") val intakeCategory: String? = null,
    @SerializedName("integration") val integration: IntegrationInfo? = null,
    @SerializedName("message") val message: String? = null,
    // Error fields for 409 duplicate
    @SerializedName("code") val code: String? = null,
    @SerializedName("existingSubmissionId") val existingSubmissionId: String? = null,
    @SerializedName("shouldUpdate") val shouldUpdate: Boolean? = null
)

data class IntegrationInfo(
    @SerializedName("integrated") val integrated: Boolean? = null,
    @SerializedName("patientId") val patientId: String? = null
)

/**
 * Response for getting existing intake
 */
data class MyIntakeResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: ExistingIntake? = null,
    @SerializedName("message") val message: String? = null
)

data class ExistingIntake(
    @SerializedName("submissionId") val submissionId: String,
    @SerializedName("quickId") val quickId: String,
    @SerializedName("status") val status: String,
    @SerializedName("payload") val payload: IntakePayload? = null
)

/**
 * Payload from existing intake (for pre-filling form)
 */
data class IntakePayload(
    @SerializedName("full_name") val fullName: String? = null,
    @SerializedName("dob") val dob: String? = null,
    @SerializedName("phone") val phone: String? = null,
    @SerializedName("age") val age: Int? = null,
    @SerializedName("height") val height: String? = null,
    @SerializedName("height_unknown") val heightUnknown: Boolean? = null,
    @SerializedName("nik") val nik: String? = null,
    @SerializedName("address") val address: String? = null,
    @SerializedName("emergency_contact") val emergencyContact: String? = null,
    @SerializedName("marital_status") val maritalStatus: String? = null,
    @SerializedName("husband_name") val husbandName: String? = null,
    @SerializedName("husband_age") val husbandAge: String? = null,
    @SerializedName("husband_job") val husbandJob: String? = null,
    @SerializedName("has_children") val hasChildren: String? = null,
    @SerializedName("living_children_count") val livingChildrenCount: String? = null,
    @SerializedName("youngest_child_age") val youngestChildAge: String? = null,
    @SerializedName("total_pregnancies") val totalPregnancies: String? = null,
    @SerializedName("normal_delivery_count") val normalDeliveryCount: String? = null,
    @SerializedName("cesarean_delivery_count") val cesareanDeliveryCount: String? = null,
    @SerializedName("miscarriage_count") val miscarriageCount: String? = null,
    @SerializedName("had_ectopic") val hadEctopic: String? = null,
    @SerializedName("occupation") val occupation: String? = null,
    @SerializedName("education") val education: String? = null,
    @SerializedName("payment_method") val paymentMethod: List<String>? = null,
    @SerializedName("insurance_name") val insuranceName: String? = null,
    @SerializedName("blood_type") val bloodType: String? = null,
    @SerializedName("rhesus") val rhesus: String? = null,
    @SerializedName("allergy_drugs") val allergyDrugs: String? = null,
    @SerializedName("allergy_food") val allergyFood: String? = null,
    @SerializedName("allergy_env") val allergyEnv: String? = null,
    @SerializedName("med_name_1") val medName1: String? = null,
    @SerializedName("med_dose_1") val medDose1: String? = null,
    @SerializedName("med_freq_1") val medFreq1: String? = null,
    @SerializedName("med_name_2") val medName2: String? = null,
    @SerializedName("med_dose_2") val medDose2: String? = null,
    @SerializedName("med_freq_2") val medFreq2: String? = null,
    @SerializedName("med_name_3") val medName3: String? = null,
    @SerializedName("med_dose_3") val medDose3: String? = null,
    @SerializedName("med_freq_3") val medFreq3: String? = null,
    @SerializedName("past_conditions") val pastConditions: List<String>? = null,
    @SerializedName("past_conditions_detail") val pastConditionsDetail: String? = null,
    @SerializedName("family_history") val familyHistory: List<String>? = null,
    @SerializedName("family_history_detail") val familyHistoryDetail: String? = null
)
