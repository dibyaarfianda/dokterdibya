package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import com.dokterdibya.patient.data.repository.TokenRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val needsProfileCompletion: Boolean = false,
    val patientId: String? = null,
    val error: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val tokenRepository: TokenRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    val isLoggedIn = tokenRepository.isLoggedIn()

    fun handleEmailLogin(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.emailLogin(email, password).fold(
                onSuccess = { response ->
                    if (response.success) {
                        val patient = response.patientData
                        val needsCompletion = patient?.birthDate.isNullOrBlank()

                        android.util.Log.d("AuthViewModel", "Email login success - birthDate: ${patient?.birthDate}, needsCompletion: $needsCompletion")

                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            needsProfileCompletion = needsCompletion,
                            patientId = patient?.id
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = response.message ?: "Login gagal"
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Email atau password salah"
                    )
                }
            )
        }
    }

    fun handleGoogleAuthCode(authCode: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.googleLogin(authCode).fold(
                onSuccess = { response ->
                    if (response.success) {
                        // Check if profile is complete (birthDate is the indicator)
                        val patient = response.patientData
                        val needsCompletion = patient?.birthDate.isNullOrBlank()

                        android.util.Log.d("AuthViewModel", "Login success - birthDate: ${patient?.birthDate}, needsCompletion: $needsCompletion")

                        // Registration code is now handled in CompleteProfileScreen (like website)
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            needsProfileCompletion = needsCompletion,
                            patientId = patient?.id
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = response.message ?: "Login gagal"
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Terjadi kesalahan"
                    )
                }
            )
        }
    }

    fun setLoading(loading: Boolean) {
        _uiState.value = _uiState.value.copy(isLoading = loading)
    }

    fun setError(error: String?) {
        _uiState.value = _uiState.value.copy(error = error)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    // Check profile completion for returning users
    fun checkProfileCompletion() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    val needsCompletion = patient.birthDate.isNullOrBlank()

                    android.util.Log.d("AuthViewModel", "checkProfileCompletion - birthDate: ${patient.birthDate}, needsCompletion: $needsCompletion")

                    // Registration code is now handled in CompleteProfileScreen (like website)
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = needsCompletion,
                        patientId = patient.id
                    )
                },
                onFailure = { error ->
                    // If profile fetch fails (404 = patient not found), they need to complete profile
                    android.util.Log.d("AuthViewModel", "checkProfileCompletion failed: ${error.message}, setting needsCompletion=true")
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = true  // Profile doesn't exist, needs completion
                    )
                }
            )
        }
    }

    // Fetch patient ID for notification service
    fun fetchPatientId() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    _uiState.value = _uiState.value.copy(patientId = patient.id)
                },
                onFailure = { /* Ignore */ }
            )
        }
    }
}
