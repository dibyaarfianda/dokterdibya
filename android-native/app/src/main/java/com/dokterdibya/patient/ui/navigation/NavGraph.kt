package com.dokterdibya.patient.ui.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.dokterdibya.patient.ui.screens.articles.ArticlesScreen
import com.dokterdibya.patient.ui.screens.articles.ArticleDetailScreen
import com.dokterdibya.patient.ui.screens.booking.BookingScreen
import com.dokterdibya.patient.ui.screens.documents.DocumentsScreen
import com.dokterdibya.patient.ui.screens.documents.DocumentViewerScreen
import com.dokterdibya.patient.ui.screens.fertility.FertilityCalendarScreen
import com.dokterdibya.patient.ui.screens.history.VisitHistoryScreen
import com.dokterdibya.patient.ui.screens.home.HomeScreen
import com.dokterdibya.patient.ui.screens.login.LoginScreen
import com.dokterdibya.patient.ui.screens.profile.ProfileScreen
import com.dokterdibya.patient.ui.screens.schedule.ScheduleScreen
import com.dokterdibya.patient.ui.screens.usg.UsgGalleryScreen
import com.dokterdibya.patient.ui.screens.medications.MedicationsScreen
import com.dokterdibya.patient.ui.screens.intro.IntroScreen
import com.dokterdibya.patient.ui.screens.completeprofile.CompleteProfileScreen

sealed class Screen(val route: String) {
    object Intro : Screen("intro")
    object Login : Screen("login")
    object CompleteProfile : Screen("complete_profile")
    object Home : Screen("home")
    object Schedule : Screen("schedule")
    object Health : Screen("health")
    object Records : Screen("records")
    object Profile : Screen("profile")
    object Articles : Screen("articles")
    object ArticleDetail : Screen("article_detail/{articleId}") {
        fun createRoute(articleId: Int) = "article_detail/$articleId"
    }
    object FertilityCalendar : Screen("fertility_calendar")
    object UsgGallery : Screen("usg_gallery")
    object LabResults : Screen("lab_results")
    object Documents : Screen("documents")
    object DocumentViewer : Screen("document_viewer/{documentId}") {
        fun createRoute(documentId: Int) = "document_viewer/$documentId"
    }
    object VisitHistory : Screen("visit_history")
    object Booking : Screen("booking")
    object Medications : Screen("medications")
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
        composable(Screen.Intro.route) {
            IntroScreen(
                onIntroFinished = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Intro.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Login.route) {
            LoginScreen(
                onGoogleSignIn = onGoogleSignIn,
                onLoginSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
                onNeedCompleteProfile = {
                    navController.navigate(Screen.CompleteProfile.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.CompleteProfile.route) {
            CompleteProfileScreen(
                onComplete = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.CompleteProfile.route) { inclusive = true }
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
                onNavigateToProfile = {
                    navController.navigate(Screen.Profile.route)
                },
                onNavigateToArticles = {
                    navController.navigate(Screen.Articles.route)
                },
                onNavigateToSchedule = {
                    navController.navigate(Screen.Schedule.route)
                },
                onNavigateToVisitHistory = {
                    navController.navigate(Screen.VisitHistory.route)
                },
                onNavigateToMedications = {
                    navController.navigate(Screen.Medications.route)
                },
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                }
            )
        }

        composable(
            Screen.FertilityCalendar.route,
            enterTransition = { fadeIn(animationSpec = tween(150)) },
            exitTransition = { fadeOut(animationSpec = tween(150)) },
            popEnterTransition = { fadeIn(animationSpec = tween(150)) },
            popExitTransition = { fadeOut(animationSpec = tween(150)) }
        ) {
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
                onBack = { navController.popBackStack() },
                onNavigateToViewer = { documentId ->
                    navController.navigate(Screen.DocumentViewer.createRoute(documentId))
                }
            )
        }

        composable(
            route = Screen.DocumentViewer.route,
            arguments = listOf(navArgument("documentId") { type = NavType.IntType })
        ) {
            DocumentViewerScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Profile.route) {
            ProfileScreen(
                onBack = { navController.popBackStack() },
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Articles.route) {
            ArticlesScreen(
                onBack = { navController.popBackStack() },
                onNavigateToArticle = { articleId ->
                    navController.navigate(Screen.ArticleDetail.createRoute(articleId))
                }
            )
        }

        composable(
            route = Screen.ArticleDetail.route,
            arguments = listOf(navArgument("articleId") { type = NavType.IntType })
        ) {
            ArticleDetailScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Schedule.route) {
            ScheduleScreen(
                onBack = { navController.popBackStack() },
                onNavigateToBooking = {
                    navController.navigate(Screen.Booking.route)
                }
            )
        }

        composable(Screen.VisitHistory.route) {
            VisitHistoryScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Medications.route) {
            MedicationsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
