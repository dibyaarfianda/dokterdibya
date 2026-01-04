import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../features/auth/presentation/screens/login_screen.dart';
import '../features/auth/presentation/providers/auth_provider.dart';
import '../features/dashboard/presentation/screens/dashboard_screen.dart';
import '../features/patients/presentation/screens/patient_list_screen.dart';
import '../features/patients/presentation/screens/patient_detail_screen.dart';
import '../features/patients/presentation/screens/patient_form_screen.dart';
import '../features/sunday_clinic/presentation/screens/queue_screen.dart';
import '../features/sunday_clinic/presentation/screens/medical_record_screen.dart';
import '../features/appointments/presentation/screens/appointment_list_screen.dart';
import '../features/inventory/presentation/screens/inventory_screen.dart';
import '../features/notifications/presentation/screens/notification_screen.dart';
import '../features/settings/presentation/screens/settings_screen.dart';
import '../features/settings/presentation/screens/activity_log_screen.dart';
import '../shared/widgets/main_scaffold.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = authState.isLoggedIn;
      final isLoginRoute = state.matchedLocation == '/login';

      if (!isLoggedIn && !isLoginRoute) {
        return '/login';
      }
      if (isLoggedIn && isLoginRoute) {
        return '/dashboard';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/patients',
            name: 'patients',
            builder: (context, state) => const PatientListScreen(),
            routes: [
              GoRoute(
                path: 'add',
                name: 'addPatient',
                builder: (context, state) => const PatientFormScreen(),
              ),
              GoRoute(
                path: ':id',
                name: 'patientDetail',
                builder: (context, state) {
                  final id = state.pathParameters['id']!;
                  return PatientDetailScreen(patientId: id);
                },
                routes: [
                  GoRoute(
                    path: 'edit',
                    name: 'editPatient',
                    builder: (context, state) {
                      final id = state.pathParameters['id']!;
                      return PatientFormScreen(patientId: id);
                    },
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/sunday-clinic',
            name: 'sundayClinic',
            builder: (context, state) => const QueueScreen(),
            routes: [
              GoRoute(
                path: 'record',
                name: 'medicalRecord',
                builder: (context, state) {
                  final extra = state.extra as Map<String, dynamic>?;
                  return MedicalRecordScreen(
                    patientId: extra?['patientId'] ?? '',
                    patientName: extra?['patientName'] ?? '',
                    category: extra?['category'] ?? 'Obstetri',
                    location: extra?['location'] ?? 'klinik_private',
                    recordId: extra?['recordId'],
                  );
                },
              ),
            ],
          ),
          GoRoute(
            path: '/appointments',
            name: 'appointments',
            builder: (context, state) => const AppointmentListScreen(),
          ),
          GoRoute(
            path: '/inventory',
            name: 'inventory',
            builder: (context, state) => const InventoryScreen(),
          ),
          GoRoute(
            path: '/notifications',
            name: 'notifications',
            builder: (context, state) => const NotificationScreen(),
          ),
          GoRoute(
            path: '/settings',
            name: 'settings',
            builder: (context, state) => const SettingsScreen(),
            routes: [
              GoRoute(
                path: 'activity-logs',
                name: 'activityLogs',
                builder: (context, state) => const ActivityLogScreen(),
              ),
              GoRoute(
                path: 'role-visibility',
                name: 'roleVisibility',
                builder: (context, state) => const Placeholder(), // TODO: implement
              ),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text('Page not found: ${state.error}'),
      ),
    ),
  );
});
