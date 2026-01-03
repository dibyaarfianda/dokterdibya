package com.dokterdibya.pharm.data.api

import com.dokterdibya.pharm.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    companion object {
        const val BASE_URL = "https://dokterdibya.com/staff/"
    }

    // ==================== Auth ====================

    @POST("api/auth/login")
    suspend fun login(@Body credentials: LoginRequest): Response<LoginResponse>

    // ==================== Obat (Medications) ====================

    @GET("api/obat")
    suspend fun getObatList(): Response<ObatListResponse>

    // ==================== Obat Sales ====================

    @GET("api/obat-sales")
    suspend fun getSales(
        @Query("status") status: String? = null,
        @Query("hospital") hospital: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0
    ): Response<SalesListResponse>

    @GET("api/obat-sales/{id}")
    suspend fun getSaleDetail(@Path("id") id: Int): Response<SaleDetailResponse>

    @POST("api/obat-sales")
    suspend fun createSale(@Body sale: CreateSaleRequest): Response<SaleResponse>

    @PUT("api/obat-sales/{id}")
    suspend fun updateSale(
        @Path("id") id: Int,
        @Body sale: UpdateSaleRequest
    ): Response<SaleResponse>

    @POST("api/obat-sales/{id}/confirm")
    suspend fun confirmSale(
        @Path("id") id: Int,
        @Body payment: PaymentRequest
    ): Response<SaleResponse>

    @POST("api/obat-sales/{id}/mark-paid")
    suspend fun markPaid(@Path("id") id: Int): Response<SaleResponse>

    @POST("api/obat-sales/{id}/invoice-base64")
    suspend fun getInvoiceBase64(@Path("id") id: Int): Response<InvoiceBase64Response>

    @DELETE("api/obat-sales/{id}")
    suspend fun deleteSale(@Path("id") id: Int): Response<ApiResponse>
}
