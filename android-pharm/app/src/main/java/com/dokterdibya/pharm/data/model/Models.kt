package com.dokterdibya.pharm.data.model

import com.google.gson.annotations.SerializedName

// ==================== Common ====================

data class ApiResponse(
    val success: Boolean,
    val message: String? = null
)

// ==================== Auth ====================

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val success: Boolean,
    val message: String? = null,
    val token: String? = null,
    val user: User? = null
)

data class User(
    val id: Int,
    val name: String,
    val email: String,
    val role: String
)

// ==================== Obat ====================

data class Obat(
    val id: Int,
    val code: String,
    val name: String,
    val price: Double,
    val stock: Int,
    val category: String? = null
)

data class ObatListResponse(
    val success: Boolean,
    val data: List<Obat>
)

// ==================== Sales ====================

data class SaleItem(
    @SerializedName("obat_id")
    val obatId: Int,
    @SerializedName("obat_code")
    val obatCode: String? = null,
    @SerializedName("obat_name")
    val obatName: String? = null,
    val quantity: Int,
    val price: Double? = null,
    val total: Double? = null
)

data class ObatSale(
    val id: Int,
    @SerializedName("sale_number")
    val saleNumber: String,
    @SerializedName("patient_name")
    val patientName: String,
    @SerializedName("patient_age")
    val patientAge: String?,
    @SerializedName("hospital_source")
    val hospitalSource: String,
    @SerializedName("hospital_name")
    val hospitalName: String?,
    val items: List<SaleItem>?,
    val subtotal: Double,
    val total: Double,
    val status: String,
    @SerializedName("payment_method")
    val paymentMethod: String?,
    @SerializedName("invoice_url")
    val invoiceUrl: String?,
    @SerializedName("created_at")
    val createdAt: String,
    @SerializedName("created_by")
    val createdBy: String?
)

data class SalesListResponse(
    val success: Boolean,
    val data: List<ObatSale>
)

data class SaleDetailResponse(
    val success: Boolean,
    val data: ObatSale
)

data class SaleResponse(
    val success: Boolean,
    val message: String?,
    val data: ObatSale? = null
)

data class CreateSaleRequest(
    @SerializedName("patient_name")
    val patientName: String,
    @SerializedName("patient_age")
    val patientAge: String?,
    @SerializedName("hospital_source")
    val hospitalSource: String,
    val items: List<SaleItemRequest>
)

data class SaleItemRequest(
    @SerializedName("obat_id")
    val obatId: Int,
    val quantity: Int
)

data class UpdateSaleRequest(
    val items: List<SaleItemRequest>
)

data class PaymentRequest(
    @SerializedName("payment_method")
    val paymentMethod: String // cash, bpjs, insurance
)

data class InvoiceBase64Response(
    val success: Boolean,
    val filename: String?,
    val base64: String?,
    val mimeType: String?,
    val message: String? = null
)
