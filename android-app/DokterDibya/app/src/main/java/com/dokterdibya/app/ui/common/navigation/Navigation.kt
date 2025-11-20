package com.dokterdibya.app.ui.common.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dokterdibya.app.ui.patient.announcements.AnnouncementsScreen
import com.dokterdibya.app.ui.patient.appointments.AppointmentsScreen
import com.dokterdibya.app.ui.patient.appointments.BookingScreen
import com.dokterdibya.app.ui.patient.auth.ForgotPasswordScreen
import com.dokterdibya.app.ui.patient.auth.LoginScreen
import com.dokterdibya.app.ui.patient.auth.RegisterScreen
import com.dokterdibya.app.ui.patient.dashboard.DashboardScreen
import com.dokterdibya.app.ui.patient.profile.ChangePasswordScreen
import com.dokterdibya.app.ui.patient.profile.EditProfileScreen
import com.dokterdibya.app.ui.patient.profile.ProfileScreen

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Register : Screen("register")
    object ForgotPassword : Screen("forgot_password")
    object Dashboard : Screen("dashboard")
    object Appointments : Screen("appointments")
    object Booking : Screen("booking")
    object Announcements : Screen("announcements")
    object Profile : Screen("profile")
    object EditProfile : Screen("edit_profile")
    object ChangePassword : Screen("change_password")
}

@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Login.route) {
            LoginScreen(navController = navController)
        }

        composable(Screen.Register.route) {
            RegisterScreen(navController = navController)
        }

        composable(Screen.ForgotPassword.route) {
            ForgotPasswordScreen(navController = navController)
        }

        composable(Screen.Dashboard.route) {
            DashboardScreen(navController = navController)
        }

        composable(Screen.Appointments.route) {
            AppointmentsScreen(navController = navController)
        }

        composable(Screen.Booking.route) {
            BookingScreen(navController = navController)
        }

        composable(Screen.Announcements.route) {
            AnnouncementsScreen(navController = navController)
        }

        composable(Screen.Profile.route) {
            ProfileScreen(navController = navController)
        }

        composable(Screen.EditProfile.route) {
            EditProfileScreen(navController = navController)
        }

        composable(Screen.ChangePassword.route) {
            ChangePasswordScreen(navController = navController)
        }
    }
}
