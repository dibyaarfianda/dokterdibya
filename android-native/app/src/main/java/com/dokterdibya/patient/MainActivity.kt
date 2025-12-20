package com.dokterdibya.patient

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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.rememberNavController
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

    companion object {
        private const val TAG = "MainActivity"
        // Use same client ID as web (Android client uses web client ID for server auth)
        private const val GOOGLE_CLIENT_ID = "738335602560-52as846lk2oo78fr38a86elu8888m7eh.apps.googleusercontent.com"
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
                    val navController = rememberNavController()

                    // Track if intro was shown this session
                    var introShown by remember { mutableStateOf(false) }

                    // Determine start destination based on login state
                    val startDestination = when {
                        isLoggedIn == true -> Screen.Home.route
                        isLoggedIn == false && !introShown -> {
                            introShown = true
                            Screen.Intro.route
                        }
                        else -> Screen.Login.route
                    }

                    if (isLoggedIn != null) {
                        NavGraph(
                            navController = navController,
                            startDestination = startDestination,
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
}
