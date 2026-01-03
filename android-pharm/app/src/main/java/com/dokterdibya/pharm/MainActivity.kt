package com.dokterdibya.pharm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.rememberNavController
import com.dokterdibya.pharm.ui.navigation.NavGraph
import com.dokterdibya.pharm.ui.navigation.Screen
import com.dokterdibya.pharm.ui.theme.DokterDibyaPharmTheme
import com.dokterdibya.pharm.viewmodel.AuthViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

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
