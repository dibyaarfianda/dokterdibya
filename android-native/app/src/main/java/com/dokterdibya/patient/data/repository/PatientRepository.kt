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
import com.dokterdibya.patient.data.model.LabResult
import com.dokterdibya.patient.data.model.UsgResult
import com.dokterdibya.patient.data.model.VisitHistory
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

    suspend fun bookAppointment(date: String, timeSlot: String, notes: String?): Result<Appointment> {
        return try {
            val response = apiService.bookAppointment(
                BookingRequest(date, timeSlot, notes)
            )
            if (response.isSuccessful && response.body()?.appointment != null) {
                Result.success(response.body()!!.appointment!!)
            } else {
                Result.failure(Exception(response.body()?.message ?: "Booking failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Medical Records ====================

    suspend fun getUsgResults(): Result<List<UsgResult>> {
        return try {
            val response = apiService.getUsgResults()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.results)
            } else {
                Result.failure(Exception("Failed to get USG results"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getLabResults(): Result<List<LabResult>> {
        return try {
            val response = apiService.getLabResults()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.results)
            } else {
                Result.failure(Exception("Failed to get lab results"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

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

    suspend fun getVisitHistory(): Result<List<VisitHistory>> {
        return try {
            val response = apiService.getVisitHistory()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.visits)
            } else {
                Result.failure(Exception("Failed to get visit history"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Fertility Calendar ====================

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
            val response = apiService.getFertilityPrediction(month, year)
            if (response.isSuccessful && response.body()?.prediction != null) {
                Result.success(response.body()!!.prediction!!)
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
            if (response.isSuccessful && response.body()?.cycle != null) {
                Result.success(response.body()!!.cycle!!)
            } else {
                Result.failure(Exception("Failed to create fertility cycle"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
