package com.dokterdibya.app.ui.patient.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.dokterdibya.app.domain.Result
import com.dokterdibya.app.ui.common.components.AppButton
import com.dokterdibya.app.ui.common.components.AppPasswordTextField
import com.dokterdibya.app.ui.common.components.AppTextField
import com.dokterdibya.app.ui.common.components.AppTextButton
import com.dokterdibya.app.ui.common.navigation.Screen
import com.dokterdibya.app.utils.ValidationUtils

@Composable
fun LoginScreen(
    navController: NavController,
    viewModel: AuthViewModel = hiltViewModel()
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var emailError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }

    val loginState by viewModel.loginState.collectAsState()

    // Handle login success
    LaunchedEffect(loginState) {
        if (loginState is Result.Success) {
            navController.navigate(Screen.Dashboard.route) {
                popUpTo(Screen.Login.route) { inclusive = true }
            }
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }

    // Show error message
    LaunchedEffect(loginState) {
        if (loginState is Result.Error) {
            val error = (loginState as Result.Error)
            snackbarHostState.showSnackbar(
                message = error.message ?: "Login gagal",
                duration = SnackbarDuration.Short
            )
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo and title
            Text(
                text = "Dokter Dibya",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.primary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Klinik Obstetri & Ginekologi",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(48.dp))

            Text(
                text = "Masuk",
                style = MaterialTheme.typography.headlineLarge
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Masuk ke akun Anda",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Email field
            AppTextField(
                value = email,
                onValueChange = {
                    email = it
                    emailError = null
                },
                label = "Email",
                placeholder = "nama@email.com",
                keyboardType = KeyboardType.Email,
                isError = emailError != null,
                errorMessage = emailError,
                enabled = loginState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Password field
            AppPasswordTextField(
                value = password,
                onValueChange = {
                    password = it
                    passwordError = null
                },
                label = "Kata Sandi",
                isError = passwordError != null,
                errorMessage = passwordError,
                enabled = loginState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Forgot password
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                AppTextButton(
                    text = "Lupa Kata Sandi?",
                    onClick = { /* TODO: Navigate to forgot password */ }
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Login button
            AppButton(
                text = "Masuk",
                onClick = {
                    // Validate
                    val emailValidation = ValidationUtils.validateEmail(email)
                    val passwordValidation = ValidationUtils.validatePassword(password)

                    emailError = emailValidation.errorMessage
                    passwordError = passwordValidation.errorMessage

                    if (emailValidation.isValid && passwordValidation.isValid) {
                        viewModel.login(email, password)
                    }
                },
                loading = loginState is Result.Loading
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Register link
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Belum punya akun?",
                    style = MaterialTheme.typography.bodyMedium
                )
                AppTextButton(
                    text = "Daftar di sini",
                    onClick = {
                        navController.navigate(Screen.Register.route)
                    }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // VPS info
            Text(
                text = "Server: 72.60.78.188",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary
            )
        }
    }
}
