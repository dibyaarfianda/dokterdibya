package com.dokterdibya.patient.data.repository

import com.dokterdibya.patient.data.api.ApiService
import com.dokterdibya.patient.data.model.AuthResponse
import com.dokterdibya.patient.data.model.BookingRequest
import com.dokterdibya.patient.data.model.CreateCycleRequest
import com.dokterdibya.patient.data.model.GoogleAuthRequest
import com.dokterdibya.patient.data.model.Patient
import com.dokterdibya.patient.data.model.Appointment
import com.dokterdibya.patient.data.model.SundayDate
import com.dokterdibya.patient.data.model.SlotsForDateResponse
import com.dokterdibya.patient.data.model.FertilityCycle
import com.dokterdibya.patient.data.model.FertilityPrediction
import com.dokterdibya.patient.data.model.PatientDocument
import com.dokterdibya.patient.data.model.FertilityInfo
import com.dokterdibya.patient.data.model.FertilityCycleResponse
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.data.api.PregnancyData
import com.dokterdibya.patient.data.api.LikeRequest
import com.dokterdibya.patient.data.api.CancelRequest
import com.dokterdibya.patient.data.model.CompleteProfileRequest
import com.dokterdibya.patient.data.model.CompleteProfileFullRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PatientRepository @Inject constructor(
    private val apiService: ApiService,
    private val tokenRepository: TokenRepository
) {
    // ==================== Authentication ====================

    suspend fun googleLogin(authCode: String): Result<AuthResponse> {
        return try {
            val response = apiService.googleAuth(GoogleAuthRequest(code = authCode))
            if (response.isSuccessful && response.body() != null) {
                val authResponse = response.body()!!
                if (authResponse.success && authResponse.token != null) {
                    tokenRepository.saveToken(authResponse.token)
                    // Use patientData helper to get user from either 'user' or 'patient' field
                    authResponse.patientData?.let { patient ->
                        tokenRepository.saveUserInfo(patient.name, patient.email ?: "")
                    }
                }
                Result.success(authResponse)
            } else {
                Result.failure(Exception(response.message() ?: "Login failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getProfile(): Result<Patient> {
        return try {
            val response = apiService.getPatientProfile()
            // Response uses 'user' field, not 'patient'
            if (response.isSuccessful && response.body()?.user != null) {
                Result.success(response.body()!!.user!!)
            } else {
                Result.failure(Exception("Failed to get profile"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun completeProfile(fullname: String, phone: String, birthDate: String, registrationCode: String? = null): Result<Patient> {
        return try {
            val response = apiService.completeProfile(
                CompleteProfileRequest(fullname, phone, birthDate, registrationCode)
            )
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.user != null) {
                    // Update stored user info
                    tokenRepository.saveUserInfo(body.user.name, body.user.email ?: "")
                    Result.success(body.user)
                } else {
                    Result.failure(Exception(body.message ?: "Gagal menyimpan profil"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val errorMsg = try {
                    org.json.JSONObject(errorBody ?: "").optString("message", "Gagal menyimpan profil")
                } catch (e: Exception) {
                    "Gagal menyimpan profil"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun completeProfileFull(
        fullname: String,
        phone: String,
        birthDate: String,
        age: Int?,
        nik: String?,
        emergencyContact: String?,
        address: String?,
        maritalStatus: String?,
        husbandName: String?,
        husbandAge: Int?,
        husbandJob: String?,
        occupation: String?,
        education: String?,
        insurance: String?,
        registrationCode: String
    ): Result<Patient> {
        return try {
            val response = apiService.completeProfileFull(
                CompleteProfileFullRequest(
                    fullname = fullname,
                    phone = phone,
                    birthDate = birthDate,
                    age = age,
                    nik = nik,
                    emergencyContact = emergencyContact,
                    address = address,
                    maritalStatus = maritalStatus,
                    husbandName = husbandName,
                    husbandAge = husbandAge,
                    husbandJob = husbandJob,
                    occupation = occupation,
                    education = education,
                    insurance = insurance,
                    registrationCode = registrationCode
                )
            )
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.user != null) {
                    tokenRepository.saveUserInfo(body.user.name, body.user.email ?: "")
                    Result.success(body.user)
                } else {
                    Result.failure(Exception(body.message ?: "Gagal menyimpan profil"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val errorMsg = try {
                    org.json.JSONObject(errorBody ?: "").optString("message", "Gagal menyimpan profil")
                } catch (e: Exception) {
                    "Gagal menyimpan profil"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        tokenRepository.clearAll()
    }

    // ==================== Appointments ====================

    suspend fun getAppointments(): Result<List<Appointment>> {
        return try {
            val response = apiService.getPatientAppointments()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.appointments)
            } else {
                Result.failure(Exception("Failed to get appointments"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getAvailableSundays(): Result<List<SundayDate>> {
        return try {
            val response = apiService.getAvailableSundays()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.sundays)
            } else {
                Result.failure(Exception("Failed to get available dates"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSlotsForDate(date: String): Result<SlotsForDateResponse> {
        return try {
            val response = apiService.getAvailableSlots(date)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to get available slots"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun bookAppointment(
        date: String,
        session: Int,
        slotNumber: Int,
        chiefComplaint: String,
        category: String = "obstetri"
    ): Result<String> {
        return try {
            val response = apiService.bookAppointment(
                BookingRequest(
                    appointmentDate = date,
                    session = session,
                    slotNumber = slotNumber,
                    chiefComplaint = chiefComplaint,
                    consultationCategory = category
                )
            )
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.message ?: "Booking berhasil")
            } else {
                val errorBody = response.errorBody()?.string()
                val errorMsg = try {
                    org.json.JSONObject(errorBody ?: "").optString("message", "Booking gagal")
                } catch (e: Exception) {
                    "Booking gagal"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun cancelAppointment(appointmentId: Int, reason: String): Result<String> {
        return try {
            val response = apiService.cancelAppointment(appointmentId, CancelRequest(reason))
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.message ?: "Janji temu berhasil dibatalkan")
            } else {
                val errorBody = response.errorBody()?.string()
                val errorMsg = try {
                    org.json.JSONObject(errorBody ?: "").optString("message", "Gagal membatalkan")
                } catch (e: Exception) {
                    "Gagal membatalkan"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Medical Records ====================

    suspend fun getDocuments(type: String? = null): Result<List<PatientDocument>> {
        return try {
            val response = apiService.getDocuments(type)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.documents)
            } else {
                Result.failure(Exception("Failed to get documents"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Get USG documents (filter by usg types)
    suspend fun getUsgDocuments(): Result<List<PatientDocument>> {
        return try {
            val response = apiService.getDocuments(null)
            if (response.isSuccessful && response.body() != null) {
                val usgDocs = response.body()!!.documents.filter {
                    it.documentType in listOf("usg_2d", "usg_4d", "patient_usg")
                }
                Result.success(usgDocs)
            } else {
                Result.failure(Exception("Failed to get USG documents"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Fertility Calendar ====================

    suspend fun getFertilityCyclesData(): Result<FertilityCycleResponse> {
        return try {
            val response = apiService.getFertilityCycles()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Failed to get fertility cycles"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getFertilityCycles(): Result<List<FertilityCycle>> {
        return try {
            val response = apiService.getFertilityCycles()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.cycles ?: emptyList())
            } else {
                Result.failure(Exception("Failed to get fertility cycles"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getFertilityPrediction(month: Int, year: Int): Result<FertilityPrediction> {
        return try {
            val response = apiService.getFertilityPredictions(3)
            if (response.isSuccessful && response.body() != null) {
                val predictions = response.body()!!.predictions
                if (!predictions.isNullOrEmpty()) {
                    Result.success(predictions.first())
                } else {
                    Result.failure(Exception("No predictions available"))
                }
            } else {
                Result.failure(Exception("Failed to get fertility prediction"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createFertilityCycle(startDate: String, cycleLength: Int, periodLength: Int): Result<FertilityCycle> {
        return try {
            val response = apiService.createFertilityCycle(
                CreateCycleRequest(startDate, cycleLength, periodLength)
            )
            if (response.isSuccessful && response.body() != null) {
                val cycles = response.body()!!.cycles
                if (!cycles.isNullOrEmpty()) {
                    Result.success(cycles.first())
                } else {
                    Result.failure(Exception("Failed to create fertility cycle"))
                }
            } else {
                Result.failure(Exception("Failed to create fertility cycle"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Articles ====================

    suspend fun getArticles(category: String? = null, limit: Int = 20): Result<List<com.dokterdibya.patient.data.api.Article>> {
        return try {
            val response = apiService.getArticles(category, limit)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data ?: emptyList())
            } else {
                Result.failure(Exception("Failed to get articles"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getArticleDetail(id: Int): Result<com.dokterdibya.patient.data.api.Article> {
        return try {
            val response = apiService.getArticleDetail(id)
            if (response.isSuccessful && response.body()?.article != null) {
                Result.success(response.body()!!.article!!)
            } else {
                Result.failure(Exception("Artikel tidak ditemukan"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Practice Schedules ====================

    suspend fun getPracticeSchedules(location: String): Result<List<com.dokterdibya.patient.data.api.PracticeSchedule>> {
        return try {
            val response = apiService.getPracticeSchedules(location)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.schedules)
            } else {
                Result.failure(Exception("Failed to get practice schedules"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Visit History / Billings ====================

    suspend fun getVisitHistory(): Result<List<com.dokterdibya.patient.data.api.Billing>> {
        return try {
            val response = apiService.getMyBillings()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data)
            } else {
                Result.failure(Exception("Failed to get visit history"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getVisitDetails(billingId: Int): Result<com.dokterdibya.patient.data.api.BillingDetail> {
        return try {
            val response = apiService.getBillingDetails(billingId)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception("Failed to get visit details"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Announcements ====================

    suspend fun getActiveAnnouncements(patientId: String? = null): Result<List<Announcement>> {
        return try {
            val response = apiService.getActiveAnnouncements(patientId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data)
            } else {
                Result.failure(Exception("Failed to get announcements"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun toggleAnnouncementLike(announcementId: Int, patientId: String): Result<Pair<Boolean, Int>> {
        return try {
            val response = apiService.toggleAnnouncementLike(announcementId, LikeRequest(patientId))
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                Result.success(Pair(body.liked, body.like_count))
            } else {
                Result.failure(Exception("Failed to toggle like"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Medications ====================

    suspend fun getMedications(): Result<List<Medication>> {
        return try {
            val response = apiService.getMedications()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data)
            } else {
                Result.failure(Exception("Failed to get medications"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Pregnancy Data ====================

    suspend fun getPregnancyData(): Result<PregnancyData> {
        return try {
            val response = apiService.getPregnancyData()
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!)
            } else {
                Result.failure(Exception("Failed to get pregnancy data"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Lab Results ====================

    suspend fun getLabDocuments(): Result<List<PatientDocument>> {
        return try {
            val response = apiService.getDocuments(null)
            if (response.isSuccessful && response.body() != null) {
                val labDocs = response.body()!!.documents.filter {
                    it.documentType in listOf("lab_result", "patient_lab")
                }
                Result.success(labDocs)
            } else {
                Result.failure(Exception("Failed to get lab documents"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
