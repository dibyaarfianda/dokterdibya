package com.dokterdibya.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.compose.rememberNavController
import com.dokterdibya.app.data.local.PreferencesManager
import com.dokterdibya.app.ui.common.navigation.AppNavigation
import com.dokterdibya.app.ui.common.navigation.Screen
import com.dokterdibya.app.ui.theme.DokterDibyaTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var preferencesManager: PreferencesManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        installSplashScreen()

        setContent {
            DokterDibyaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isLoggedIn by remember { mutableStateOf<Boolean?>(null) }
                    val scope = rememberCoroutineScope()

                    LaunchedEffect(Unit) {
                        scope.launch {
                            val token = preferencesManager.authToken.first()
                            isLoggedIn = !token.isNullOrEmpty()
                        }
                    }

                    when (isLoggedIn) {
                        null -> {
                            // Loading state
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        true -> {
                            // User is logged in, show dashboard
                            AppNavigation(
                                navController = rememberNavController(),
                                startDestination = Screen.Dashboard.route
                            )
                        }
                        false -> {
                            // User is not logged in, show login
                            AppNavigation(
                                navController = rememberNavController(),
                                startDestination = Screen.Login.route
                            )
                        }
                    }
                }
            }
        }
    }
}
