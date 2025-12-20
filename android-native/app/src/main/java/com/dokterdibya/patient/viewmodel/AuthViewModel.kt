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

    fun handleGoogleAuthCode(authCode: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.googleLogin(authCode).fold(
                onSuccess = { response ->
                    if (response.success) {
                        // Check if profile is complete
                        val patient = response.patientData
                        val needsCompletion = patient?.birthDate.isNullOrBlank()

                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            needsProfileCompletion = needsCompletion
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
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = needsCompletion
                    )
                },
                onFailure = {
                    // If profile fetch fails, just go to home
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = false
                    )
                }
            )
        }
    }
}
