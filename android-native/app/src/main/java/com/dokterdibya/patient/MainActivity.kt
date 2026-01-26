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
import com.dokterdibya.patient.data.service.FCMTokenManager
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var fcmTokenManager: FCMTokenManager

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
        Log.d(TAG, "Google sign in result: resultCode=${result.resultCode}, data=${result.data != null}")
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            val account = task.getResult(ApiException::class.java)
            Log.d(TAG, "Google account: email=${account.email}, hasAuthCode=${account.serverAuthCode != null}")
            // Send auth code to backend
            account.serverAuthCode?.let { authCode ->
                Log.d(TAG, "Sending auth code to backend, length: ${authCode.length}")
                // Ensure viewmodel is not null before calling
                if (authViewModel != null) {
                    authViewModel?.handleGoogleAuthCode(authCode)
                } else {
                    Log.e(TAG, "AuthViewModel is null, cannot handle auth code")
                }
            } ?: run {
                Log.e(TAG, "No server auth code received")
                authViewModel?.setError("Gagal mendapatkan auth code. Coba lagi.")
            }
        } catch (e: ApiException) {
            Log.e(TAG, "Google sign in ApiException: ${e.statusCode}", e)
            val errorMsg = when (e.statusCode) {
                12501 -> "Sign in dibatalkan oleh pengguna"  // USER_CANCELED
                12500 -> "Sign in error"                      // SIGN_IN_CURRENTLY_IN_PROGRESS
                else -> "Google authentication failed: ${e.statusCode}"
            }
            Log.e(TAG, "Setting error: $errorMsg")
            authViewModel?.setError(errorMsg)
        } catch (e: Exception) {
            Log.e(TAG, "Google sign in exception", e)
            authViewModel?.setError("Terjadi kesalahan: ${e.message}")
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

                    // Handle FCM token based on login state
                    LaunchedEffect(isLoggedIn) {
                        if (isLoggedIn == true) {
                            // Fetch patient ID when logged in
                            viewModel.fetchPatientId()
                            // Defer FCM token registration to improve startup time
                            // Small delay ensures UI is fully rendered first
                            delay(1500)
                            fcmTokenManager.registerToken()
                        } else if (isLoggedIn == false) {
                            // Clear FCM token when logged out
                            fcmTokenManager.clearToken()
                        }
                    }

                    // Request notification permission when patient ID is available
                    LaunchedEffect(authState.patientId) {
                        authState.patientId?.let { patientId ->
                            currentPatientId = patientId
                            requestNotificationPermissionAndStart(patientId)
                        }
                    }

                    // Track if profile check is complete for returning users
                    var profileCheckComplete by remember { mutableStateOf(false) }
                    var needsProfileCompletion by remember { mutableStateOf(false) }

                    // For returning users (has token), check profile completion before navigating
                    LaunchedEffect(isLoggedIn) {
                        if (isLoggedIn == true && !profileCheckComplete) {
                            Log.d(TAG, "Checking profile completion for returning user...")
                            viewModel.checkProfileCompletion()
                        } else if (isLoggedIn == false) {
                            profileCheckComplete = true // No need to check, user not logged in
                        }
                    }

                    // Listen to profile completion state from ViewModel
                    LaunchedEffect(authState.isLoggedIn, authState.needsProfileCompletion) {
                        if (authState.isLoggedIn) {
                            needsProfileCompletion = authState.needsProfileCompletion
                            profileCheckComplete = true
                            Log.d(TAG, "Profile check complete: needsCompletion=$needsProfileCompletion")
                        }
                    }

                    // Calculate start destination based on login status AND profile completion
                    val startDestination by remember(isLoggedIn, profileCheckComplete, needsProfileCompletion) {
                        derivedStateOf {
                            when {
                                isLoggedIn == null -> null // Still loading
                                isLoggedIn == false -> Screen.Intro.route
                                isLoggedIn == true && !profileCheckComplete -> null // Wait for profile check
                                isLoggedIn == true && needsProfileCompletion -> Screen.CompleteProfile.route
                                isLoggedIn == true -> Screen.Home.route
                                else -> null
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
        Log.d(TAG, "Starting Google sign-in process")
        
        // Clear any previous error messages before attempting new sign-in
        authViewModel?.clearError()
        
        // Perform sign-out first to clear any cached sessions
        googleSignInClient.signOut().addOnCompleteListener { task ->
            Log.d(TAG, "SignOut task completed. Success: ${task.isSuccessful}")
            
            // Launch sign-in regardless of signOut result
            try {
                val signInIntent = googleSignInClient.signInIntent
                Log.d(TAG, "Launching Google sign-in intent")
                googleSignInLauncher.launch(signInIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Error launching sign-in intent", e)
                authViewModel?.setError("Error launching Google sign-in: ${e.message}")
            }
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
