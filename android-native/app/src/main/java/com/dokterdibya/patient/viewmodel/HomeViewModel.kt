package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.data.api.Article
import com.dokterdibya.patient.data.api.BabySize
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.data.model.Patient
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import javax.inject.Inject

// Birth info for congratulations card
data class BirthInfo(
    val babyName: String = "",
    val birthDate: String = "",
    val birthTime: String = "",
    val babyWeight: String = "",
    val babyLength: String = "",
    val babyPhotoUrl: String? = null,
    val doctorMessage: String? = null
)

data class HomeUiState(
    val isLoading: Boolean = false,
    val patientName: String? = null,
    val patient: Patient? = null,
    val isPregnant: Boolean = false,
    val pregnancyWeeks: Int = 0,
    val pregnancyDays: Int = 0,
    val pregnancyProgress: Float = 0f,
    val dueDate: String? = null,
    val trimester: Int = 0,
    val babySize: BabySize? = null,
    val pregnancyTip: String? = null,
    val usgCount: Int = 0,
    val error: String? = null,
    // New features
    val announcements: List<Announcement> = emptyList(),
    val hasGivenBirth: Boolean = false,
    val birthInfo: BirthInfo? = null,
    val medications: List<Medication> = emptyList(),
    val hasMedications: Boolean = false,
    // Notifications
    val unreadNotificationCount: Int = 0,
    // Articles for Ruang Membaca
    val articles: List<Article> = emptyList(),
    val totalArticleCount: Int = 0
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val patientRepository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var patientId: String? = null

    init {
        loadAllData()
    }

    /**
     * Load all home screen data in parallel for better performance
     */
    private fun loadAllData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // Launch all API calls in parallel
            val profileDeferred = async { patientRepository.getProfile() }
            val usgDeferred = async { patientRepository.getUsgDocuments() }
            val pregnancyDeferred = async { patientRepository.getPregnancyData() }
            val medicationsDeferred = async { patientRepository.getMedications() }
            val notificationsDeferred = async { patientRepository.getUnreadNotificationCount() }
            val articlesDeferred = async { patientRepository.getArticles() }

            // Process profile result first (needed for announcements)
            val profileResult = profileDeferred.await()
            profileResult.fold(
                onSuccess = { patient ->
                    patientId = patient.id
                    val pregnancyInfo = calculatePregnancyInfo(patient)
                    _uiState.value = _uiState.value.copy(
                        patient = patient,
                        patientName = patient.name,
                        isPregnant = patient.isPregnant,
                        pregnancyWeeks = pregnancyInfo.weeks,
                        pregnancyDays = pregnancyInfo.days,
                        pregnancyProgress = pregnancyInfo.progress,
                        dueDate = formatDate(patient.expectedDueDate)
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(error = error.message)
                }
            )

            // Load announcements after we have patient ID
            val announcementsDeferred = async { patientRepository.getActiveAnnouncements(patientId) }

            // Process other results
            usgDeferred.await().onSuccess { usgDocs ->
                _uiState.value = _uiState.value.copy(usgCount = usgDocs.size)
            }

            pregnancyDeferred.await().onSuccess { data ->
                if (data.has_given_birth) {
                    _uiState.value = _uiState.value.copy(
                        hasGivenBirth = true,
                        isPregnant = false,
                        birthInfo = BirthInfo(
                            babyName = data.baby_name ?: "",
                            birthDate = data.birth_date ?: "",
                            birthTime = data.birth_time ?: "",
                            babyWeight = data.baby_weight ?: "",
                            babyLength = data.baby_length ?: "",
                            babyPhotoUrl = data.baby_photo_url,
                            doctorMessage = data.doctor_message
                        )
                    )
                } else if (data.is_pregnant) {
                    _uiState.value = _uiState.value.copy(
                        isPregnant = true,
                        pregnancyWeeks = data.weeks,
                        pregnancyDays = data.days,
                        pregnancyProgress = data.progress.toFloat(),
                        dueDate = formatDate(data.hpl),
                        trimester = data.trimester,
                        babySize = data.baby_size,
                        pregnancyTip = data.tip
                    )
                }
            }

            medicationsDeferred.await().onSuccess { medications ->
                _uiState.value = _uiState.value.copy(
                    medications = medications,
                    hasMedications = medications.isNotEmpty()
                )
            }

            notificationsDeferred.await().onSuccess { count ->
                _uiState.value = _uiState.value.copy(unreadNotificationCount = count)
            }

            articlesDeferred.await().onSuccess { articles ->
                _uiState.value = _uiState.value.copy(
                    articles = articles.take(3),
                    totalArticleCount = articles.size
                )
            }

            announcementsDeferred.await().onSuccess { announcements ->
                _uiState.value = _uiState.value.copy(announcements = announcements)
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun toggleLike(announcementId: Int) {
        val pId = patientId ?: return
        viewModelScope.launch {
            patientRepository.toggleAnnouncementLike(announcementId, pId).fold(
                onSuccess = { (liked, likeCount) ->
                    // Update the announcement in the list
                    val updatedAnnouncements = _uiState.value.announcements.map { announcement ->
                        if (announcement.id == announcementId) {
                            announcement.copy(liked_by_me = liked, like_count = likeCount)
                        } else {
                            announcement
                        }
                    }
                    _uiState.value = _uiState.value.copy(announcements = updatedAnnouncements)
                },
                onFailure = { /* Ignore */ }
            )
        }
    }

    private fun calculatePregnancyInfo(patient: Patient): PregnancyInfo {
        if (!patient.isPregnant || patient.pregnancyStartDate == null) {
            return PregnancyInfo(0, 0, 0f)
        }

        return try {
            val startDate = LocalDate.parse(patient.pregnancyStartDate.take(10))
            val today = LocalDate.now()
            val daysPregnant = ChronoUnit.DAYS.between(startDate, today).toInt()

            val weeks = daysPregnant / 7
            val days = daysPregnant % 7
            val progress = (daysPregnant.toFloat() / 280f).coerceIn(0f, 1f) // 40 weeks = 280 days

            PregnancyInfo(weeks, days, progress)
        } catch (e: Exception) {
            PregnancyInfo(0, 0, 0f)
        }
    }

    fun logout() {
        viewModelScope.launch {
            patientRepository.logout()
        }
    }

    fun refresh() {
        loadAllData()
    }

    private data class PregnancyInfo(
        val weeks: Int,
        val days: Int,
        val progress: Float
    )

    private fun formatDate(dateStr: String?): String? {
        if (dateStr.isNullOrEmpty()) return null
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val outputFormat = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val date = inputFormat.parse(dateStr.take(10))
            date?.let { outputFormat.format(it) } ?: dateStr
        } catch (e: Exception) {
            dateStr
        }
    }
}
