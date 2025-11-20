package com.dokterdibya.app.data.repository

import com.dokterdibya.app.data.local.PreferencesManager
import com.dokterdibya.app.data.remote.api.ApiService
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.domain.models.*
import com.dokterdibya.app.utils.Constants
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: ApiService,
    private val preferencesManager: PreferencesManager
) {

    fun login(email: String, password: String, isStaff: Boolean = false): Flow<Result<User>> = flow {
        emit(Result.Loading)
        try {
            val response = if (isStaff) {
                apiService.loginStaff(LoginRequest(email, password))
            } else {
                apiService.loginPatient(LoginRequest(email, password))
            }

            if (response.success && response.data != null) {
                // Save session
                preferencesManager.saveUserSession(
                    token = response.data.token,
                    userId = response.data.user.id,
                    userType = if (isStaff) Constants.USER_TYPE_STAFF else Constants.USER_TYPE_PATIENT,
                    email = response.data.user.email
                )
                emit(Result.Success(response.data.user))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Login error")
            emit(Result.Error(e, e.message ?: "Login failed"))
        }
    }

    fun register(
        email: String,
        password: String,
        fullName: String,
        phoneNumber: String,
        birthDate: String
    ): Flow<Result<User>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.registerPatient(
                RegisterRequest(email, password, fullName, phoneNumber, birthDate)
            )

            if (response.success && response.data != null) {
                // Save session
                preferencesManager.saveUserSession(
                    token = response.data.token,
                    userId = response.data.user.id,
                    userType = Constants.USER_TYPE_PATIENT,
                    email = response.data.user.email
                )
                emit(Result.Success(response.data.user))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Registration error")
            emit(Result.Error(e, e.message ?: "Registration failed"))
        }
    }

    fun googleSignIn(idToken: String): Flow<Result<User>> = flow {
        emit(Result.Loading)
        try {
            val response = apiService.googleAuth(GoogleAuthRequest(idToken))

            if (response.success && response.data != null) {
                preferencesManager.saveUserSession(
                    token = response.data.token,
                    userId = response.data.user.id,
                    userType = Constants.USER_TYPE_PATIENT,
                    email = response.data.user.email
                )
                emit(Result.Success(response.data.user))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Google sign-in error")
            emit(Result.Error(e, e.message ?: "Google sign-in failed"))
        }
    }

    fun getProfile(isStaff: Boolean = false): Flow<Result<User>> = flow {
        emit(Result.Loading)
        try {
            val response = if (isStaff) {
                apiService.getStaffProfile()
            } else {
                apiService.getProfile()
            }

            if (response.success && response.data != null) {
                emit(Result.Success(response.data.user))
            } else {
                emit(Result.Error(Exception(response.message)))
            }
        } catch (e: Exception) {
            Timber.e(e, "Get profile error")
            emit(Result.Error(e, e.message ?: "Failed to load profile"))
        }
    }

    suspend fun logout() {
        preferencesManager.clearAll()
    }

    val isLoggedIn: Flow<Boolean> = flow {
        preferencesManager.authToken.collect { token ->
            emit(!token.isNullOrEmpty())
        }
    }

    val userType: Flow<String?> = preferencesManager.userType
}
