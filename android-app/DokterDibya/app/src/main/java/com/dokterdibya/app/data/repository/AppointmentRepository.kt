package com.dokterdibya.app.data.repository

import com.dokterdibya.app.data.remote.api.ApiService
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Appointment
import com.dokterdibya.app.domain.models.AvailableSlots
import com.dokterdibya.app.domain.models.BookAppointmentRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppointmentRepository @Inject constructor(
    private val apiService: ApiService
) {

    fun getMyAppointments(): Flow<Result<List<Appointment>>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.getMyAppointments()
            if (response.success && response.data != null) {
                emit(Result.Success(response.data))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Get appointments error")
            emit(Result.Error(e, e.message ?: "Failed to load appointments"))
        }
    }

    fun getAvailableSlots(date: String): Flow<Result<List<AvailableSlots>>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.getAvailableSlots(date)
            if (response.success && response.data != null) {
                emit(Result.Success(response.data))
            } else {
                emit(Result.Error(Exception("Failed to load slots")))
            }
        } catch (e: Exception) {
            Timber.e(e, "Get available slots error")
            emit(Result.Error(e, e.message ?: "Failed to load available slots"))
        }
    }

    fun bookAppointment(
        date: String,
        session: Int,
        slotNumber: Int,
        notes: String? = null
    ): Flow<Result<Appointment>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.bookAppointment(
                BookAppointmentRequest(date, session, slotNumber, notes)
            )
            if (response.success && response.data != null) {
                emit(Result.Success(response.data))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Book appointment error")
            emit(Result.Error(e, e.message ?: "Failed to book appointment"))
        }
    }

    fun cancelAppointment(id: Int): Flow<Result<Appointment>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.cancelAppointment(id)
            if (response.success && response.data != null) {
                emit(Result.Success(response.data))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Cancel appointment error")
            emit(Result.Error(e, e.message ?: "Failed to cancel appointment"))
        }
    }
}
