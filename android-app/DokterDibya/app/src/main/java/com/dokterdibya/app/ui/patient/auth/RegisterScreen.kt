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
import com.dokterdibya.app.utils.DateUtils
import com.dokterdibya.app.utils.ValidationUtils

@Composable
fun RegisterScreen(
    navController: NavController,
    viewModel: AuthViewModel = hiltViewModel()
) {
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phoneNumber by remember { mutableStateOf("") }
    var birthDate by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    var fullNameError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    var phoneError by remember { mutableStateOf<String?>(null) }
    var birthDateError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }
    var confirmPasswordError by remember { mutableStateOf<String?>(null) }

    val registerState by viewModel.registerState.collectAsState()

    LaunchedEffect(registerState) {
        if (registerState is Result.Success) {
            navController.navigate(Screen.Dashboard.route) {
                popUpTo(Screen.Register.route) { inclusive = true }
            }
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(registerState) {
        if (registerState is Result.Error) {
            val error = (registerState as Result.Error)
            snackbarHostState.showSnackbar(
                message = error.message ?: "Pendaftaran gagal",
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
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Daftar Akun",
                style = MaterialTheme.typography.headlineLarge
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Buat akun baru untuk mengakses layanan kami",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))

            AppTextField(
                value = fullName,
                onValueChange = {
                    fullName = it
                    fullNameError = null
                },
                label = "Nama Lengkap",
                placeholder = "Nama lengkap Anda",
                isError = fullNameError != null,
                errorMessage = fullNameError,
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

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
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

            AppTextField(
                value = phoneNumber,
                onValueChange = {
                    phoneNumber = it
                    phoneError = null
                },
                label = "Nomor Telepon",
                placeholder = "08xxxxxxxxxx",
                keyboardType = KeyboardType.Phone,
                isError = phoneError != null,
                errorMessage = phoneError,
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

            AppTextField(
                value = birthDate,
                onValueChange = {
                    birthDate = it
                    birthDateError = null
                },
                label = "Tanggal Lahir",
                placeholder = "YYYY-MM-DD (contoh: 1990-01-15)",
                isError = birthDateError != null,
                errorMessage = birthDateError,
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

            AppPasswordTextField(
                value = password,
                onValueChange = {
                    password = it
                    passwordError = null
                },
                label = "Kata Sandi",
                isError = passwordError != null,
                errorMessage = passwordError,
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(16.dp))

            AppPasswordTextField(
                value = confirmPassword,
                onValueChange = {
                    confirmPassword = it
                    confirmPasswordError = null
                },
                label = "Konfirmasi Kata Sandi",
                isError = confirmPasswordError != null,
                errorMessage = confirmPasswordError,
                enabled = registerState !is Result.Loading
            )

            Spacer(modifier = Modifier.height(32.dp))

            AppButton(
                text = "Daftar",
                onClick = {
                    // Validate all fields
                    val nameValidation = ValidationUtils.validateName(fullName)
                    val emailValidation = ValidationUtils.validateEmail(email)
                    val phoneValidation = ValidationUtils.validatePhone(phoneNumber)
                    val birthDateValidation = ValidationUtils.validateRequired(birthDate, "Tanggal lahir")
                    val passwordValidation = ValidationUtils.validatePassword(password)
                    val confirmPasswordValidation = ValidationUtils.validateConfirmPassword(password, confirmPassword)

                    fullNameError = nameValidation.errorMessage
                    emailError = emailValidation.errorMessage
                    phoneError = phoneValidation.errorMessage
                    birthDateError = birthDateValidation.errorMessage
                    passwordError = passwordValidation.errorMessage
                    confirmPasswordError = confirmPasswordValidation.errorMessage

                    if (nameValidation.isValid && emailValidation.isValid &&
                        phoneValidation.isValid && birthDateValidation.isValid &&
                        passwordValidation.isValid && confirmPasswordValidation.isValid) {
                        viewModel.register(email, password, fullName, phoneNumber, birthDate)
                    }
                },
                loading = registerState is Result.Loading
            )

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Sudah punya akun?",
                    style = MaterialTheme.typography.bodyMedium
                )
                AppTextButton(
                    text = "Masuk di sini",
                    onClick = {
                        navController.popBackStack()
                    }
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
