package com.dokterdibya.patient.data.api

import com.dokterdibya.patient.data.repository.TokenRepository
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenRepository: TokenRepository
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth header for login/public endpoints
        val path = originalRequest.url.encodedPath
        if (path.contains("google-auth-code") ||
            path.contains("patient-login") ||
            path.contains("registration-codes")) {
            return chain.proceed(originalRequest)
        }

        // Use cached token (non-blocking) instead of runBlocking
        // This prevents ANR by avoiding blocking the OkHttp thread
        val token = tokenRepository.getCachedToken()

        return if (token != null) {
            val newRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
            chain.proceed(newRequest)
        } else {
            chain.proceed(originalRequest)
        }
    }
}
