package com.dokterdibya.pharm.data.api

import com.dokterdibya.pharm.data.repository.TokenRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
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

        // Skip auth header for login endpoint
        if (originalRequest.url.encodedPath.contains("auth/login")) {
            return chain.proceed(originalRequest)
        }

        // Wait for token with timeout (up to 3 seconds)
        val token = runBlocking {
            var attempts = 0
            var result: String? = null
            while (attempts < 30 && result == null) {
                result = tokenRepository.getToken().first()
                if (result == null) {
                    kotlinx.coroutines.delay(100)
                    attempts++
                }
            }
            result
        }

        return if (token != null) {
            val newRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cache-Control", "no-cache")
                .build()
            chain.proceed(newRequest)
        } else {
            // Log for debugging
            android.util.Log.e("AuthInterceptor", "Token is null after waiting!")
            chain.proceed(originalRequest)
        }
    }
}
