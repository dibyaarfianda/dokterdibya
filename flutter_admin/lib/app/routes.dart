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
import '../features/inventory/presentation/screens/activity_log_screen.dart' as drug_log;
import '../features/announcements/presentation/screens/announcement_screen.dart';
import '../features/schedule/presentation/screens/schedule_screen.dart';
import '../features/articles/presentation/screens/article_screen.dart';
import '../features/services/presentation/screens/service_screen.dart';
import '../features/supplier/presentation/screens/supplier_screen.dart';
import '../features/drug_sales/presentation/screens/drug_sale_screen.dart';
import '../features/chat/presentation/screens/chat_screen.dart';
import '../features/hospital/presentation/screens/hospital_appointments_screen.dart';
import '../features/staff_activity/presentation/screens/staff_activity_screen.dart';
import '../features/booking_settings/presentation/screens/booking_settings_screen.dart';
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
                    mrId: extra?['mrId'],
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
            routes: [
              GoRoute(
                path: 'activity-log',
                name: 'drugActivityLog',
                builder: (context, state) => const drug_log.ActivityLogScreen(),
              ),
            ],
          ),
          GoRoute(
            path: '/notifications',
            name: 'notifications',
            builder: (context, state) => const NotificationScreen(),
          ),
          // New routes
          GoRoute(
            path: '/announcements',
            name: 'announcements',
            builder: (context, state) => const AnnouncementScreen(),
          ),
          GoRoute(
            path: '/schedule',
            name: 'schedule',
            builder: (context, state) => const ScheduleScreen(),
          ),
          GoRoute(
            path: '/articles',
            name: 'articles',
            builder: (context, state) => const ArticleScreen(),
          ),
          GoRoute(
            path: '/services',
            name: 'services',
            builder: (context, state) => const ServiceScreen(),
          ),
          GoRoute(
            path: '/suppliers',
            name: 'suppliers',
            builder: (context, state) => const SupplierScreen(),
          ),
          GoRoute(
            path: '/drug-sales',
            name: 'drugSales',
            builder: (context, state) => const DrugSaleScreen(),
          ),
          GoRoute(
            path: '/chat',
            name: 'chat',
            builder: (context, state) => const ChatScreen(),
          ),
          GoRoute(
            path: '/staff-activity',
            name: 'staffActivity',
            builder: (context, state) => const StaffActivityScreen(),
          ),
          GoRoute(
            path: '/booking-settings',
            name: 'bookingSettings',
            builder: (context, state) => const BookingSettingsScreen(),
          ),
          // Hospital appointment routes
          GoRoute(
            path: '/hospital/melinda',
            name: 'hospitalMelinda',
            builder: (context, state) => const HospitalAppointmentsScreen(
              location: 'rsia_melinda',
              title: 'RSIA Melinda',
              color: Colors.pink,
            ),
          ),
          GoRoute(
            path: '/hospital/gambiran',
            name: 'hospitalGambiran',
            builder: (context, state) => const HospitalAppointmentsScreen(
              location: 'rsud_gambiran',
              title: 'RSUD Gambiran',
              color: Colors.cyan,
            ),
          ),
          GoRoute(
            path: '/hospital/bhayangkara',
            name: 'hospitalBhayangkara',
            builder: (context, state) => const HospitalAppointmentsScreen(
              location: 'rs_bhayangkara',
              title: 'RS Bhayangkara',
              color: Colors.teal,
            ),
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
                builder: (context, state) => const Placeholder(),
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
