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
        val path = originalRequest.url.encodedPath

        android.util.Log.d("AuthInterceptor", "Intercepting: $path")

        // Skip auth header for login endpoint
        if (path.contains("auth/login")) {
            android.util.Log.d("AuthInterceptor", "Skipping auth for login endpoint")
            return chain.proceed(originalRequest)
        }

        // Wait for token with timeout (up to 5 seconds for first request after login)
        val token = runBlocking {
            var attempts = 0
            var result: String? = null
            while (attempts < 50 && result == null) {
                result = tokenRepository.getToken().first()
                if (result == null) {
                    if (attempts == 0) {
                        android.util.Log.d("AuthInterceptor", "Token not found, waiting...")
                    }
                    kotlinx.coroutines.delay(100)
                    attempts++
                }
            }
            if (result != null && attempts > 0) {
                android.util.Log.d("AuthInterceptor", "Token found after ${attempts * 100}ms wait")
            }
            result
        }

        return if (token != null) {
            android.util.Log.d("AuthInterceptor", "Adding token to request: ${token.take(20)}...")
            val newRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cache-Control", "no-cache")
                .build()
            chain.proceed(newRequest)
        } else {
            android.util.Log.e("AuthInterceptor", "Token is null after 5s! Path: $path")
            chain.proceed(originalRequest)
        }
    }
}
