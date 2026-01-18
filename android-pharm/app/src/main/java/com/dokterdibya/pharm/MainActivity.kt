package com.dokterdibya.pharm

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.rememberNavController
import com.dokterdibya.pharm.data.repository.AuthState
import com.dokterdibya.pharm.ui.navigation.NavGraph
import com.dokterdibya.pharm.ui.navigation.Screen
import com.dokterdibya.pharm.ui.theme.DokterDibyaPharmTheme
import com.dokterdibya.pharm.viewmodel.AuthViewModel
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var authState: AuthState

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            DokterDibyaPharmTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val viewModel: AuthViewModel = hiltViewModel()
                    val isLoggedIn by viewModel.isLoggedIn.collectAsState(initial = null)
                    val navController = rememberNavController()
                    val context = LocalContext.current

                    // Listen for token expiration events
                    LaunchedEffect(Unit) {
                        authState.tokenExpired.collect { message ->
                            android.util.Log.d("MainActivity", "Token expired event received: $message")
                            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                            // Navigate to login and clear backstack
                            navController.navigate(Screen.Login.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }

                    // Calculate start destination based on login status
                    val startDestination by remember(isLoggedIn) {
                        derivedStateOf {
                            when (isLoggedIn) {
                                null -> null // Still loading
                                false -> Screen.Intro.route
                                true -> Screen.SalesList.route
                            }
                        }
                    }

                    startDestination?.let { destination ->
                        NavGraph(
                            navController = navController,
                            startDestination = destination
                        )
                    }
                }
            }
        }
    }
}
