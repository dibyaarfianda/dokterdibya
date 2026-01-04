import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/roles.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';

class MainScaffold extends ConsumerStatefulWidget {
  final Widget child;

  const MainScaffold({super.key, required this.child});

  @override
  ConsumerState<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends ConsumerState<MainScaffold> {
  int _selectedIndex = 0;

  final List<_NavItem> _navItems = [
    _NavItem(
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      label: 'Dashboard',
      route: '/dashboard',
    ),
    _NavItem(
      icon: Icons.people_outlined,
      activeIcon: Icons.people,
      label: 'Pasien',
      route: '/patients',
    ),
    _NavItem(
      icon: Icons.medical_services_outlined,
      activeIcon: Icons.medical_services,
      label: 'Klinik',
      route: '/sunday-clinic',
    ),
    _NavItem(
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      label: 'Jadwal',
      route: '/appointments',
    ),
    _NavItem(
      icon: Icons.inventory_2_outlined,
      activeIcon: Icons.inventory_2,
      label: 'Obat',
      route: '/inventory',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final size = MediaQuery.of(context).size;
    final isTablet = size.width > 900;

    // Update selected index based on current route
    final currentLocation = GoRouterState.of(context).matchedLocation;
    final index = _navItems.indexWhere((item) => item.route == currentLocation);
    if (index != -1 && index != _selectedIndex) {
      _selectedIndex = index;
    }

    if (isTablet) {
      return Scaffold(
        body: Row(
          children: [
            // Sidebar for tablet
            NavigationRail(
              selectedIndex: _selectedIndex,
              extended: size.width > 1200,
              backgroundColor: Colors.white,
              onDestinationSelected: (index) => _onNavTap(index),
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Column(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.medical_services,
                        color: AppColors.primary,
                      ),
                    ),
                    if (size.width > 1200) ...[
                      const SizedBox(height: 8),
                      const Text(
                        'dokterDIBYA',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              trailing: Expanded(
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: IconButton(
                      icon: const Icon(Icons.logout),
                      onPressed: () => _handleLogout(),
                      tooltip: 'Logout',
                    ),
                  ),
                ),
              ),
              destinations: _navItems.map((item) {
                return NavigationRailDestination(
                  icon: Icon(item.icon),
                  selectedIcon: Icon(item.activeIcon),
                  label: Text(item.label),
                );
              }).toList(),
            ),
            const VerticalDivider(thickness: 1, width: 1),
            // Main content
            Expanded(
              child: Column(
                children: [
                  _buildAppBar(authState, isTablet: true),
                  Expanded(child: widget.child),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Mobile layout
    return Scaffold(
      appBar: _buildAppBar(authState, isTablet: false),
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _onNavTap,
        destinations: _navItems.map((item) {
          return NavigationDestination(
            icon: Icon(item.icon),
            selectedIcon: Icon(item.activeIcon),
            label: item.label,
          );
        }).toList(),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(AuthState authState, {required bool isTablet}) {
    return AppBar(
      automaticallyImplyLeading: false,
      title: Text(_navItems[_selectedIndex].label),
      actions: [
        // Notifications
        IconButton(
          icon: const Badge(
            label: Text('3'),
            child: Icon(Icons.notifications_outlined),
          ),
          onPressed: () => context.push('/notifications'),
        ),
        // User menu
        PopupMenuButton<String>(
          offset: const Offset(0, 50),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.white.withValues(alpha: 0.2),
                  child: Text(
                    (authState.user?['name'] ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
                if (!isTablet) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_drop_down),
                ],
              ],
            ),
          ),
          itemBuilder: (context) => [
            PopupMenuItem(
              enabled: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    authState.user?['name'] ?? 'User',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    authState.role?.displayName ?? '',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            const PopupMenuDivider(),
            PopupMenuItem(
              value: 'settings',
              child: const Row(
                children: [
                  Icon(Icons.settings_outlined, size: 20),
                  SizedBox(width: 8),
                  Text('Settings'),
                ],
              ),
            ),
            PopupMenuItem(
              value: 'logout',
              child: const Row(
                children: [
                  Icon(Icons.logout, size: 20, color: AppColors.danger),
                  SizedBox(width: 8),
                  Text('Logout', style: TextStyle(color: AppColors.danger)),
                ],
              ),
            ),
          ],
          onSelected: (value) {
            if (value == 'logout') {
              _handleLogout();
            } else if (value == 'settings') {
              context.push('/settings');
            }
          },
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  void _onNavTap(int index) {
    setState(() => _selectedIndex = index);
    context.go(_navItems[index].route);
  }

  void _handleLogout() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Apakah Anda yakin ingin keluar?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ref.read(authStateProvider.notifier).logout();
              context.go('/login');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
            ),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String route;

  _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.route,
  });
}
