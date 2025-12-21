package com.dokterdibya.patient

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.rememberNavController
import com.dokterdibya.patient.data.service.NotificationService
import com.dokterdibya.patient.ui.navigation.NavGraph
import com.dokterdibya.patient.ui.navigation.Screen
import com.dokterdibya.patient.ui.theme.DokterDibyaTheme
import com.dokterdibya.patient.viewmodel.AuthViewModel
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private lateinit var googleSignInClient: GoogleSignInClient
    private var currentPatientId: String? = null

    companion object {
        private const val TAG = "MainActivity"
        // Use same client ID as web (Android client uses web client ID for server auth)
        private const val GOOGLE_CLIENT_ID = "738335602560-52as846lk2oo78fr38a86elu8888m7eh.apps.googleusercontent.com"
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Log.d(TAG, "Notification permission granted: $isGranted")
        if (isGranted) {
            // Start service if we have patient ID
            currentPatientId?.let { startNotificationService(it) }
        }
    }

    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            // Send auth code to backend
            account.serverAuthCode?.let { authCode ->
                authViewModel?.handleGoogleAuthCode(authCode)
            } ?: run {
                authViewModel?.setError("Gagal mendapatkan auth code")
            }
        } catch (e: ApiException) {
            Log.e(TAG, "Google sign in failed: ${e.statusCode}", e)
            authViewModel?.setError("Login Google gagal: ${e.statusCode}")
        }
    }

    private var authViewModel: AuthViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Configure Google Sign-In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestServerAuthCode(GOOGLE_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .build()

        googleSignInClient = GoogleSignIn.getClient(this, gso)

        setContent {
            DokterDibyaTheme(darkTheme = true) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val viewModel: AuthViewModel = hiltViewModel()
                    authViewModel = viewModel

                    val isLoggedIn by viewModel.isLoggedIn.collectAsState(initial = null)
                    val authState by viewModel.uiState.collectAsState()
                    val navController = rememberNavController()

                    // Handle notification service based on login state
                    LaunchedEffect(isLoggedIn) {
                        if (isLoggedIn == true) {
                            // Fetch patient ID when logged in
                            viewModel.fetchPatientId()
                        } else if (isLoggedIn == false) {
                            // Stop service when logged out
                            stopNotificationService()
                        }
                    }

                    // Start notification service when patient ID is available
                    LaunchedEffect(authState.patientId) {
                        authState.patientId?.let { patientId ->
                            currentPatientId = patientId
                            requestNotificationPermissionAndStart(patientId)
                        }
                    }

                    // Calculate start destination only ONCE when isLoggedIn is first determined
                    val startDestination by remember(isLoggedIn) {
                        derivedStateOf {
                            when (isLoggedIn) {
                                true -> Screen.Home.route
                                false -> Screen.Intro.route  // Always show intro when not logged in
                                null -> null
                            }
                        }
                    }

                    startDestination?.let { destination ->
                        NavGraph(
                            navController = navController,
                            startDestination = destination,
                            onGoogleSignIn = { signInWithGoogle() }
                        )
                    }
                }
            }
        }
    }

    private fun signInWithGoogle() {
        // Sign out first to allow account selection
        googleSignInClient.signOut().addOnCompleteListener {
            val signInIntent = googleSignInClient.signInIntent
            googleSignInLauncher.launch(signInIntent)
        }
    }

    private fun requestNotificationPermissionAndStart(patientId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    startNotificationService(patientId)
                }
                else -> {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        } else {
            // No permission needed for Android < 13
            startNotificationService(patientId)
        }
    }

    private fun startNotificationService(patientId: String) {
        // Foreground service disabled - Android requires visible notification for foreground services
        // To get background notifications without persistent notification, need FCM (Firebase Cloud Messaging)
        Log.d(TAG, "Notification service disabled - no persistent notification")
        // NotificationService.start(this, patientId)
    }

    private fun stopNotificationService() {
        Log.d(TAG, "Stopping notification service")
        NotificationService.stop(this)
        currentPatientId = null
    }

    override fun onDestroy() {
        super.onDestroy()
        // Don't stop service on destroy - let it run in background
    }
}
