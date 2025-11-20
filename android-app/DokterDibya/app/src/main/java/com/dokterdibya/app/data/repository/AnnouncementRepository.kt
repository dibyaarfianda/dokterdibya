package com.dokterdibya.app.data.repository

import com.dokterdibya.app.data.remote.api.ApiService
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.Announcement
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AnnouncementRepository @Inject constructor(
    private val apiService: ApiService
) {

    fun getActiveAnnouncements(): Flow<Result<List<Announcement>>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.getActiveAnnouncements()
            if (response.success && response.data != null) {
                emit(Result.Success(response.data))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Get announcements error")
            emit(Result.Error(e, e.message ?: "Failed to load announcements"))
        }
    }
}
