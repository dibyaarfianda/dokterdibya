package com.dokterdibya.app.ui.patient.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.app.data.repository.AuthRepository
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _loginState = MutableStateFlow<Result<User>?>(null)
    val loginState: StateFlow<Result<User>?> = _loginState.asStateFlow()

    private val _registerState = MutableStateFlow<Result<User>?>(null)
    val registerState: StateFlow<Result<User>?> = _registerState.asStateFlow()

    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    init {
        checkLoginStatus()
    }

    private fun checkLoginStatus() {
        viewModelScope.launch {
            authRepository.isLoggedIn.collect { loggedIn ->
                _isLoggedIn.value = loggedIn
            }
        }
    }

    fun login(email: String, password: String, isStaff: Boolean = false) {
        viewModelScope.launch {
            _loginState.value = Result.Loading
            authRepository.login(email, password, isStaff).collect { result ->
                _loginState.value = result
                if (result is Result.Success) {
                    Timber.d("Login successful: ${result.data.email}")
                }
            }
        }
    }

    fun register(
        email: String,
        password: String,
        fullName: String,
        phoneNumber: String,
        birthDate: String
    ) {
        viewModelScope.launch {
            _registerState.value = Result.Loading
            authRepository.register(email, password, fullName, phoneNumber, birthDate).collect { result ->
                _registerState.value = result
                if (result is Result.Success) {
                    Timber.d("Registration successful: ${result.data.email}")
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _loginState.value = null
            _registerState.value = null
        }
    }

    fun clearLoginState() {
        _loginState.value = null
    }

    fun clearRegisterState() {
        _registerState.value = null
    }
}
