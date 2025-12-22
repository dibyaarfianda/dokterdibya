package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import javax.inject.Inject

data class ProfileUiState(
    val isLoading: Boolean = true,
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val birthDate: String = "",
    val photoUrl: String? = null,
    val isPregnant: Boolean = false,
    val pregnancyWeeks: Int = 0,
    val pregnancyDays: Int = 0,
    val dueDate: String = "",
    val isUploading: Boolean = false,
    val uploadError: String? = null
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    /**
     * Public function to refresh profile data
     * Called when navigating back to profile after completing intake
     */
    fun refresh() {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            repository.getProfile()
                .onSuccess { patient ->
                    var weeks = 0
                    var days = 0

                    if (patient.isPregnant && patient.pregnancyStartDate != null) {
                        try {
                            val startDate = LocalDate.parse(patient.pregnancyStartDate.take(10))
                            val today = LocalDate.now()
                            val daysPregnant = ChronoUnit.DAYS.between(startDate, today).toInt()
                            weeks = daysPregnant / 7
                            days = daysPregnant % 7
                        } catch (e: Exception) {
                            // Ignore parsing errors
                        }
                    }

                    // Convert relative photo URLs to full URLs
                    val rawPhotoUrl = patient.photoUrl ?: patient.profilePicture
                    val fullPhotoUrl = rawPhotoUrl?.let { url ->
                        if (url.startsWith("/api/")) {
                            "https://dokterdibya.com$url"
                        } else {
                            url
                        }
                    }

                    _uiState.value = ProfileUiState(
                        isLoading = false,
                        name = patient.name,
                        email = patient.email ?: "",
                        phone = patient.phone ?: "",
                        birthDate = formatDate(patient.birthDate),
                        photoUrl = fullPhotoUrl,
                        isPregnant = patient.isPregnant,
                        pregnancyWeeks = weeks,
                        pregnancyDays = days,
                        dueDate = formatDate(patient.expectedDueDate)
                    )
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
        }
    }

    fun uploadPhoto(imageBytes: ByteArray, fileName: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isUploading = true, uploadError = null)

            repository.uploadProfilePhoto(imageBytes, fileName)
                .onSuccess { photoUrl ->
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        photoUrl = "https://dokterdibya.com$photoUrl"
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isUploading = false,
                        uploadError = e.message
                    )
                }
        }
    }

    fun clearUploadError() {
        _uiState.value = _uiState.value.copy(uploadError = null)
    }

    /**
     * Update profile information
     * @param name Full name
     * @param phone Phone number
     * @param birthDate Birth date in dd/MM/yyyy format
     * @param onResult Callback with (success, errorMessage)
     */
    fun updateProfile(name: String, phone: String, birthDate: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                // Convert dd/MM/yyyy to yyyy-MM-dd for API
                val apiDateFormat = if (birthDate.contains("/")) {
                    try {
                        val inputFormat = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                        val outputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                        val date = inputFormat.parse(birthDate)
                        date?.let { outputFormat.format(it) } ?: birthDate
                    } catch (e: Exception) {
                        birthDate
                    }
                } else {
                    birthDate
                }

                repository.updateProfile(name, phone, apiDateFormat)
                    .onSuccess {
                        // Refresh profile to get updated data
                        loadProfile()
                        onResult(true, null)
                    }
                    .onFailure { e ->
                        onResult(false, e.message ?: "Gagal menyimpan profil")
                    }
            } catch (e: Exception) {
                onResult(false, e.message ?: "Terjadi kesalahan")
            }
        }
    }

    private fun formatDate(dateStr: String?): String {
        if (dateStr.isNullOrEmpty()) return ""
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
