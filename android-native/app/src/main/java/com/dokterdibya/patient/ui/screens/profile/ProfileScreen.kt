package com.dokterdibya.patient.ui.screens.profile

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.components.ThemedBackground
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Edit profile dialog state
    var showEditDialog by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf("") }
    var editPhone by remember { mutableStateOf("") }
    var editBirthDate by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    // Initialize edit fields when dialog opens
    LaunchedEffect(showEditDialog) {
        if (showEditDialog) {
            editName = uiState.name
            editPhone = uiState.phone
            editBirthDate = uiState.birthDate
        }
    }

    // Refresh profile when screen is displayed
    LaunchedEffect(Unit) {
        viewModel.refresh()
    }

    // Photo picker launcher
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            // Read image bytes and upload
            context.contentResolver.openInputStream(it)?.use { inputStream ->
                val bytes = inputStream.readBytes()
                val fileName = "profile_${System.currentTimeMillis()}.jpg"
                viewModel.uploadPhoto(bytes, fileName)
            }
        }
    }

    // Show error snackbar
    LaunchedEffect(uiState.uploadError) {
        uiState.uploadError?.let {
            // Error will be shown in UI
        }
    }

    // Calculate age from birth date
    val calculatedAge = remember(editBirthDate) {
        try {
            val parts = editBirthDate.split("/")
            if (parts.size == 3) {
                val day = parts[0].toIntOrNull() ?: return@remember null
                val month = parts[1].toIntOrNull() ?: return@remember null
                val year = parts[2].toIntOrNull() ?: return@remember null
                val birthDate = java.time.LocalDate.of(year, month, day)
                val today = java.time.LocalDate.now()
                java.time.Period.between(birthDate, today).years
            } else null
        } catch (e: Exception) { null }
    }

    // Edit Profile Dialog (website-matching dark glassmorphism style)
    if (showEditDialog) {
        androidx.compose.ui.window.Dialog(
            onDismissRequest = { if (!isSaving) showEditDialog = false }
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CardDark),
                border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(24.dp)
                ) {
                    // Header with close button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Edit,
                                contentDescription = null,
                                tint = WebAccent,
                                modifier = Modifier.size(22.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                "Edit Profil",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = WebAccent
                            )
                        }
                        IconButton(
                            onClick = { if (!isSaving) showEditDialog = false },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Tutup",
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Photo section
                    Text(
                        "Foto Profil",
                        fontSize = 14.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    // Avatar
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clip(CircleShape)
                                .background(WebAccent.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (uiState.photoUrl != null) {
                                AsyncImage(
                                    model = uiState.photoUrl,
                                    contentDescription = "Foto Profil",
                                    modifier = Modifier
                                        .size(100.dp)
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Text(
                                    text = editName.take(1).uppercase().ifEmpty { "?" },
                                    fontSize = 42.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = WebAccent
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Pilih Foto button
                        OutlinedButton(
                            onClick = { photoPickerLauncher.launch("image/*") },
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = WebAccent
                            ),
                            border = androidx.compose.foundation.BorderStroke(1.dp, WebAccent),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(
                                Icons.Default.CameraAlt,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Pilih Foto", fontSize = 13.sp)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            "Klik foto atau tombol untuk upload (Maks. 2MB, format: JPEG, PNG, WebP)",
                            fontSize = 11.sp,
                            color = TextSecondaryDark,
                            modifier = Modifier.padding(horizontal = 16.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Nama Lengkap field
                    Text(
                        "Nama Lengkap *",
                        fontSize = 14.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("Masukkan nama lengkap", color = TextSecondaryDark.copy(alpha = 0.5f)) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = WebAccent,
                            unfocusedBorderColor = WebCardBorder,
                            focusedTextColor = TextPrimaryDark,
                            unfocusedTextColor = TextPrimaryDark,
                            cursorColor = WebAccent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Email field (disabled)
                    Text(
                        "Email (tidak dapat diubah)",
                        fontSize = 14.sp,
                        color = TextSecondaryDark,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = uiState.email,
                        onValueChange = {},
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledBorderColor = WebCardBorder.copy(alpha = 0.5f),
                            disabledTextColor = TextSecondaryDark,
                            disabledContainerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Nomor WhatsApp field
                    Text(
                        "Nomor WhatsApp *",
                        fontSize = 14.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editPhone,
                        onValueChange = { editPhone = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("628xxxxxxxxxx", color = TextSecondaryDark.copy(alpha = 0.5f)) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = WebAccent,
                            unfocusedBorderColor = WebCardBorder,
                            focusedTextColor = TextPrimaryDark,
                            unfocusedTextColor = TextPrimaryDark,
                            cursorColor = WebAccent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Tanggal Lahir field
                    Text(
                        "Tanggal Lahir",
                        fontSize = 14.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editBirthDate,
                        onValueChange = { editBirthDate = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("dd/MM/yyyy", color = TextSecondaryDark.copy(alpha = 0.5f)) },
                        trailingIcon = {
                            Icon(
                                Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(20.dp)
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = WebAccent,
                            unfocusedBorderColor = WebCardBorder,
                            focusedTextColor = TextPrimaryDark,
                            unfocusedTextColor = TextPrimaryDark,
                            cursorColor = WebAccent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Umur field (auto-calculated, read-only)
                    Text(
                        "Umur",
                        fontSize = 14.sp,
                        color = TextSecondaryDark,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = calculatedAge?.toString() ?: "",
                        onValueChange = {},
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        enabled = false,
                        placeholder = { Text("Otomatis dari tanggal lahir", color = TextSecondaryDark.copy(alpha = 0.5f)) },
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledBorderColor = WebCardBorder.copy(alpha = 0.5f),
                            disabledTextColor = TextSecondaryDark,
                            disabledContainerColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    // Error message
                    if (saveError != null) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            saveError!!,
                            color = Danger,
                            fontSize = 12.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Batal button
                        OutlinedButton(
                            onClick = { if (!isSaving) showEditDialog = false },
                            enabled = !isSaving,
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = TextSecondaryDark
                            ),
                            border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Batal", fontSize = 14.sp)
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        // Simpan Perubahan button
                        Button(
                            onClick = {
                                isSaving = true
                                saveError = null
                                viewModel.updateProfile(editName, editPhone, editBirthDate) { success, error ->
                                    isSaving = false
                                    if (success) {
                                        showEditDialog = false
                                    } else {
                                        saveError = error ?: "Gagal menyimpan profil"
                                    }
                                }
                            },
                            enabled = !isSaving,
                            colors = ButtonDefaults.buttonColors(containerColor = WebAccent),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            if (isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Icon(
                                Icons.Default.Save,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Simpan Perubahan", fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }

    ThemedBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            "Profil Saya",
                            fontWeight = FontWeight.SemiBold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                        }
                    },
                    actions = {
                        IconButton(onClick = { showEditDialog = true }) {
                            Icon(
                                Icons.Default.Edit,
                                contentDescription = "Edit Profil",
                                tint = Accent
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = TextPrimaryDark,
                        navigationIconContentColor = TextPrimaryDark
                    )
                )
            },
            containerColor = Color.Transparent
        ) { paddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Accent)
                }
            } else {
                // Profile header
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = WebCardBg),
                    border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Avatar with photo upload
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clickable { photoPickerLauncher.launch("image/*") },
                            contentAlignment = Alignment.Center
                        ) {
                            if (uiState.photoUrl != null) {
                                AsyncImage(
                                    model = uiState.photoUrl,
                                    contentDescription = "Foto Profil",
                                    modifier = Modifier
                                        .size(100.dp)
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Box(
                                    modifier = Modifier
                                        .size(100.dp)
                                        .clip(CircleShape)
                                        .background(Accent.copy(alpha = 0.2f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = uiState.name.take(1).uppercase(),
                                        fontSize = 36.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Accent
                                    )
                                }
                            }
                            // Camera icon overlay
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(Accent),
                                contentAlignment = Alignment.Center
                            ) {
                                if (uiState.isUploading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = TextPrimaryDark,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Icon(
                                        Icons.Default.CameraAlt,
                                        contentDescription = "Ganti Foto",
                                        tint = TextPrimaryDark,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }

                        // Upload error message
                        if (uiState.uploadError != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = uiState.uploadError!!,
                                fontSize = 12.sp,
                                color = Danger
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = uiState.name,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimaryDark
                        )

                        if (uiState.email.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = uiState.email,
                                fontSize = 14.sp,
                                color = TextSecondaryDark
                            )
                        }

                        if (uiState.isPregnant) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(Purple.copy(alpha = 0.2f))
                                    .padding(horizontal = 16.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = "Hamil ${uiState.pregnancyWeeks} Minggu",
                                    fontSize = 13.sp,
                                    color = Purple,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Info cards
                Text(
                    "Informasi Pribadi",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )

                Spacer(modifier = Modifier.height(12.dp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = CardDark)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        ProfileInfoRow(
                            icon = Icons.Default.Phone,
                            label = "Telepon",
                            value = uiState.phone.ifEmpty { "-" }
                        )
                        Divider(
                            modifier = Modifier.padding(vertical = 12.dp),
                            color = BgDark
                        )
                        ProfileInfoRow(
                            icon = Icons.Default.Cake,
                            label = "Tanggal Lahir",
                            value = uiState.birthDate.ifEmpty { "-" }
                        )
                    }
                }

                if (uiState.isPregnant && uiState.dueDate.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        "Informasi Kehamilan",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimaryDark
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Purple.copy(alpha = 0.1f))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            ProfileInfoRow(
                                icon = Icons.Default.ChildCare,
                                label = "Usia Kehamilan",
                                value = "${uiState.pregnancyWeeks} Minggu ${uiState.pregnancyDays} Hari",
                                iconColor = Purple
                            )
                            Divider(
                                modifier = Modifier.padding(vertical = 12.dp),
                                color = BgDark.copy(alpha = 0.3f)
                            )
                            ProfileInfoRow(
                                icon = Icons.Default.Event,
                                label = "HPL (Perkiraan Lahir)",
                                value = uiState.dueDate,
                                iconColor = Purple
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                // Logout button
                Button(
                    onClick = {
                        viewModel.logout()
                        onLogout()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Danger),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Keluar")
                }

                Spacer(modifier = Modifier.height(32.dp))
            }
        }
        }
    }
}

@Composable
fun ProfileInfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    iconColor: androidx.compose.ui.graphics.Color = Accent
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = iconColor,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                label,
                fontSize = 12.sp,
                color = TextSecondaryDark
            )
            Text(
                value,
                fontSize = 14.sp,
                color = TextPrimaryDark,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
