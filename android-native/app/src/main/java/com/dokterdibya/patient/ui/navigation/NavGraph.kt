package com.dokterdibya.patient.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.dokterdibya.patient.ui.screens.booking.BookingScreen
import com.dokterdibya.patient.ui.screens.documents.DocumentsScreen
import com.dokterdibya.patient.ui.screens.fertility.FertilityCalendarScreen
import com.dokterdibya.patient.ui.screens.home.HomeScreen
import com.dokterdibya.patient.ui.screens.login.LoginScreen
import com.dokterdibya.patient.ui.screens.usg.UsgGalleryScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Home : Screen("home")
    object Schedule : Screen("schedule")
    object Health : Screen("health")
    object Records : Screen("records")
    object Profile : Screen("profile")
    object FertilityCalendar : Screen("fertility_calendar")
    object UsgGallery : Screen("usg_gallery")
    object LabResults : Screen("lab_results")
    object Documents : Screen("documents")
    object VisitHistory : Screen("visit_history")
    object Booking : Screen("booking")
}

@Composable
fun NavGraph(
    navController: NavHostController,
    startDestination: String,
    onGoogleSignIn: () -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Login.route) {
            LoginScreen(
                onGoogleSignIn = onGoogleSignIn,
                onLoginSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToFertility = {
                    navController.navigate(Screen.FertilityCalendar.route)
                },
                onNavigateToBooking = {
                    navController.navigate(Screen.Booking.route)
                },
                onNavigateToUsg = {
                    navController.navigate(Screen.UsgGallery.route)
                },
                onNavigateToDocuments = {
                    navController.navigate(Screen.Documents.route)
                },
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.FertilityCalendar.route) {
            FertilityCalendarScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Booking.route) {
            BookingScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.UsgGallery.route) {
            UsgGalleryScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Documents.route) {
            DocumentsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
