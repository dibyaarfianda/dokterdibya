package com.dokterdibya.app.ui.patient.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.ui.common.components.AppButton
import com.dokterdibya.app.ui.common.components.AppPasswordTextField
import com.dokterdibya.app.ui.patient.auth.AuthViewModel
import com.dokterdibya.app.utils.ValidationUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
    navController: NavController,
    viewModel: AuthViewModel = hiltViewModel()
) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    var currentPasswordError by remember { mutableStateOf<String?>(null) }
    var newPasswordError by remember { mutableStateOf<String?>(null) }
    var confirmPasswordError by remember { mutableStateOf<String?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ubah Kata Sandi") },
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
                text = "Masukkan kata sandi lama dan baru Anda",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            AppPasswordTextField(
                value = currentPassword,
                onValueChange = {
                    currentPassword = it
                    currentPasswordError = null
                },
                label = "Kata Sandi Saat Ini",
                isError = currentPasswordError != null,
                errorMessage = currentPasswordError
            )

            AppPasswordTextField(
                value = newPassword,
                onValueChange = {
                    newPassword = it
                    newPasswordError = null
                },
                label = "Kata Sandi Baru",
                isError = newPasswordError != null,
                errorMessage = newPasswordError
            )

            AppPasswordTextField(
                value = confirmPassword,
                onValueChange = {
                    confirmPassword = it
                    confirmPasswordError = null
                },
                label = "Konfirmasi Kata Sandi Baru",
                isError = confirmPasswordError != null,
                errorMessage = confirmPasswordError
            )

            // Password requirements
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "Persyaratan Kata Sandi:",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Text(
                        text = "• Minimal 6 karakter",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Text(
                        text = "• Hindari kata sandi yang mudah ditebak",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            AppButton(
                text = "Ubah Kata Sandi",
                onClick = {
                    val currentPasswordValidation = ValidationUtils.validatePassword(currentPassword)
                    val newPasswordValidation = ValidationUtils.validatePassword(newPassword)
                    val confirmPasswordValidation = ValidationUtils.validateConfirmPassword(newPassword, confirmPassword)

                    currentPasswordError = currentPasswordValidation.errorMessage
                    newPasswordError = newPasswordValidation.errorMessage
                    confirmPasswordError = confirmPasswordValidation.errorMessage

                    if (currentPasswordValidation.isValid &&
                        newPasswordValidation.isValid &&
                        confirmPasswordValidation.isValid) {
                        // TODO: Implement change password API call
                        navController.popBackStack()
                    }
                }
            )
        }
    }
}
