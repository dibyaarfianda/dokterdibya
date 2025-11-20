package com.dokterdibya.app.ui.patient.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.ui.common.components.AppButton
import com.dokterdibya.app.ui.common.components.AppTextField
import com.dokterdibya.app.ui.patient.dashboard.DashboardViewModel
import com.dokterdibya.app.utils.ValidationUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(
    navController: NavController,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val userProfile by viewModel.userProfile.collectAsState()

    var fullName by remember { mutableStateOf("") }
    var phoneNumber by remember { mutableStateOf("") }
    var whatsappNumber by remember { mutableStateOf("") }

    var fullNameError by remember { mutableStateOf<String?>(null) }
    var phoneError by remember { mutableStateOf<String?>(null) }

    // Initialize fields when profile loads
    LaunchedEffect(userProfile) {
        if (userProfile is Result.Success) {
            val profile = (userProfile as Result.Success).data
            fullName = profile.fullName
            phoneNumber = profile.phoneNumber ?: ""
            whatsappNumber = profile.whatsappNumber ?: ""
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit Profil") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Informasi Pribadi",
                style = MaterialTheme.typography.titleLarge
            )

            AppTextField(
                value = fullName,
                onValueChange = {
                    fullName = it
                    fullNameError = null
                },
                label = "Nama Lengkap",
                isError = fullNameError != null,
                errorMessage = fullNameError
            )

            AppTextField(
                value = phoneNumber,
                onValueChange = {
                    phoneNumber = it
                    phoneError = null
                },
                label = "Nomor Telepon",
                keyboardType = KeyboardType.Phone,
                isError = phoneError != null,
                errorMessage = phoneError
            )

            AppTextField(
                value = whatsappNumber,
                onValueChange = { whatsappNumber = it },
                label = "Nomor WhatsApp",
                placeholder = "Kosongkan jika sama dengan nomor telepon",
                keyboardType = KeyboardType.Phone
            )

            Spacer(modifier = Modifier.height(16.dp))

            AppButton(
                text = "Simpan Perubahan",
                onClick = {
                    val nameValidation = ValidationUtils.validateName(fullName)
                    val phoneValidation = if (phoneNumber.isNotBlank()) {
                        ValidationUtils.validatePhone(phoneNumber)
                    } else ValidationUtils.ValidationResult.Valid

                    fullNameError = nameValidation.errorMessage
                    phoneError = phoneValidation.errorMessage

                    if (nameValidation.isValid && phoneValidation.isValid) {
                        // TODO: Implement profile update API call
                        navController.popBackStack()
                    }
                }
            )
        }
    }
}
