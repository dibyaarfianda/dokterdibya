package com.dokterdibya.pharm.data.repository

import com.dokterdibya.pharm.data.api.ApiService
import com.dokterdibya.pharm.data.model.*
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SalesRepository @Inject constructor(
    private val apiService: ApiService,
    private val tokenRepository: TokenRepository
) {
    // ==================== Auth ====================

    suspend fun login(email: String, password: String): Result<LoginResponse> {
        android.util.Log.d("SalesRepository", "=== LOGIN STARTED ===")
        return try {
            val response = apiService.login(LoginRequest(email, password))
            android.util.Log.d("SalesRepository", "Response: code=${response.code()}, success=${response.isSuccessful}")
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                val token = body.data?.token
                val user = body.data?.user
                android.util.Log.d("SalesRepository", "Body: success=${body.success}, hasToken=${token != null}")
                if (body.success && token != null) {
                    android.util.Log.d("SalesRepository", "Saving token: ${token.take(20)}...")
                    tokenRepository.saveToken(token)
                    user?.let {
                        tokenRepository.saveUserInfo(it.name, it.email, it.role)
                    }
                    // Verify token was saved
                    val savedToken = tokenRepository.getToken().first()
                    android.util.Log.d("SalesRepository", "Token verified: ${savedToken != null}")
                } else {
                    android.util.Log.e("SalesRepository", "NO TOKEN! success=${body.success}, msg=${body.message}")
                }
                Result.success(body)
            } else {
                android.util.Log.e("SalesRepository", "HTTP ERROR: ${response.code()} ${response.errorBody()?.string()}")
                Result.failure(Exception(response.message() ?: "Login failed"))
            }
        } catch (e: Exception) {
            android.util.Log.e("SalesRepository", "EXCEPTION: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun logout() {
        tokenRepository.clearAll()
    }

    // ==================== Obat ====================

    suspend fun getObatList(): Result<List<Obat>> {
        return try {
            val response = apiService.getObatList()
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.message ?: "Failed to get obat list"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                Result.failure(Exception("HTTP ${response.code()}: ${errorBody ?: response.message()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ==================== Sales ====================

    suspend fun getSales(
        status: String? = null,
        hospital: String? = null,
        limit: Int = 50,
        offset: Int = 0
    ): Result<List<ObatSale>> {
        return try {
            val response = apiService.getSales(status, hospital, limit, offset)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data)
            } else {
                Result.failure(Exception("Failed to get sales"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSaleDetail(id: Int): Result<ObatSale> {
        return try {
            val response = apiService.getSaleDetail(id)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.data)
            } else {
                Result.failure(Exception("Failed to get sale detail"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createSale(
        patientName: String,
        patientAge: String?,
        hospitalSource: String,
        items: List<SaleItemRequest>
    ): Result<ObatSale> {
        return try {
            val request = CreateSaleRequest(patientName, patientAge, hospitalSource, items)
            val response = apiService.createSale(request)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.data != null) {
                    Result.success(body.data)
                } else {
                    Result.failure(Exception(body.message ?: "Failed to create sale"))
                }
            } else {
                Result.failure(Exception("Failed to create sale"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateSale(id: Int, items: List<SaleItemRequest>): Result<Unit> {
        return try {
            val request = UpdateSaleRequest(items)
            val response = apiService.updateSale(id, request)
            if (response.isSuccessful && response.body()?.success == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to update sale"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun confirmSale(id: Int, paymentMethod: String): Result<Unit> {
        return try {
            val response = apiService.confirmSale(id, PaymentRequest(paymentMethod))
            if (response.isSuccessful && response.body()?.success == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.body()?.message ?: "Failed to confirm sale"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markPaid(id: Int): Result<Unit> {
        return try {
            val response = apiService.markPaid(id)
            if (response.isSuccessful && response.body()?.success == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to mark as paid"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getInvoiceBase64(id: Int): Result<InvoiceBase64Response> {
        return try {
            val response = apiService.getInvoiceBase64(id)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.base64 != null) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.message ?: "Failed to get invoice"))
                }
            } else {
                Result.failure(Exception("Failed to get invoice"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getEtiketBase64(id: Int): Result<InvoiceBase64Response> {
        return try {
            val response = apiService.getEtiketBase64(id)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.success && body.base64 != null) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.message ?: "Failed to get etiket"))
                }
            } else {
                Result.failure(Exception("Failed to get etiket"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteSale(id: Int): Result<Unit> {
        return try {
            val response = apiService.deleteSale(id)
            if (response.isSuccessful && response.body()?.success == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to delete sale"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
