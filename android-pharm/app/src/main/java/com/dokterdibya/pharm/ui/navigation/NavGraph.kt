package com.dokterdibya.pharm.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.dokterdibya.pharm.ui.screens.intro.IntroScreen
import com.dokterdibya.pharm.ui.screens.login.LoginScreen
import com.dokterdibya.pharm.ui.screens.sales.NewSaleScreen
import com.dokterdibya.pharm.ui.screens.sales.SaleDetailScreen
import com.dokterdibya.pharm.ui.screens.sales.SalesListScreen

sealed class Screen(val route: String) {
    object Intro : Screen("intro")
    object Login : Screen("login")
    object SalesList : Screen("sales_list")
    object NewSale : Screen("new_sale")
    object SaleDetail : Screen("sale_detail/{saleId}") {
        fun createRoute(saleId: Int) = "sale_detail/$saleId"
    }
}

@Composable
fun NavGraph(
    navController: NavHostController,
    startDestination: String
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
                onLoginSuccess = {
                    navController.navigate(Screen.SalesList.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.SalesList.route) {
            SalesListScreen(
                onNewSale = {
                    navController.navigate(Screen.NewSale.route)
                },
                onSaleClick = { saleId ->
                    navController.navigate(Screen.SaleDetail.createRoute(saleId))
                },
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.NewSale.route) {
            NewSaleScreen(
                onBack = { navController.popBackStack() },
                onSaleCreated = { saleId ->
                    navController.navigate(Screen.SaleDetail.createRoute(saleId)) {
                        popUpTo(Screen.SalesList.route)
                    }
                }
            )
        }

        composable(
            route = Screen.SaleDetail.route,
            arguments = listOf(navArgument("saleId") { type = NavType.IntType })
        ) { backStackEntry ->
            val saleId = backStackEntry.arguments?.getInt("saleId") ?: 0
            SaleDetailScreen(
                saleId = saleId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
