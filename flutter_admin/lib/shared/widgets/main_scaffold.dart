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
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  // Main navigation items (shown in bottom nav on mobile)
  final List<_NavItem> _mainNavItems = [
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
      icon: Icons.menu,
      activeIcon: Icons.menu,
      label: 'Menu',
      route: '', // Opens drawer
    ),
  ];

  // All menu items organized by groups
  final List<_MenuGroup> _menuGroups = [
    _MenuGroup(
      title: 'Utama',
      items: [
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
          label: 'Klinik Minggu',
          route: '/sunday-clinic',
        ),
      ],
    ),
    _MenuGroup(
      title: 'Jadwal & Booking',
      items: [
        _NavItem(
          icon: Icons.calendar_today_outlined,
          activeIcon: Icons.calendar_today,
          label: 'Janji Temu',
          route: '/appointments',
        ),
        _NavItem(
          icon: Icons.schedule_outlined,
          activeIcon: Icons.schedule,
          label: 'Jadwal Praktek',
          route: '/schedule',
        ),
        _NavItem(
          icon: Icons.settings_outlined,
          activeIcon: Icons.settings,
          label: 'Pengaturan Booking',
          route: '/booking-settings',
        ),
      ],
    ),
    _MenuGroup(
      title: 'Inventaris & Penjualan',
      items: [
        _NavItem(
          icon: Icons.inventory_2_outlined,
          activeIcon: Icons.inventory_2,
          label: 'Obat & Alkes',
          route: '/inventory',
        ),
        _NavItem(
          icon: Icons.history_outlined,
          activeIcon: Icons.history,
          label: 'Log Aktivitas Obat',
          route: '/inventory/activity-log',
        ),
        _NavItem(
          icon: Icons.point_of_sale_outlined,
          activeIcon: Icons.point_of_sale,
          label: 'Penjualan Obat',
          route: '/drug-sales',
        ),
        _NavItem(
          icon: Icons.local_shipping_outlined,
          activeIcon: Icons.local_shipping,
          label: 'Supplier',
          route: '/suppliers',
        ),
        _NavItem(
          icon: Icons.miscellaneous_services_outlined,
          activeIcon: Icons.miscellaneous_services,
          label: 'Layanan/Tindakan',
          route: '/services',
        ),
      ],
    ),
    _MenuGroup(
      title: 'Rumah Sakit',
      items: [
        _NavItem(
          icon: Icons.local_hospital_outlined,
          activeIcon: Icons.local_hospital,
          label: 'RSIA Melinda',
          route: '/hospital/melinda',
        ),
        _NavItem(
          icon: Icons.local_hospital_outlined,
          activeIcon: Icons.local_hospital,
          label: 'RSUD Gambiran',
          route: '/hospital/gambiran',
        ),
        _NavItem(
          icon: Icons.local_hospital_outlined,
          activeIcon: Icons.local_hospital,
          label: 'RS Bhayangkara',
          route: '/hospital/bhayangkara',
        ),
      ],
    ),
    _MenuGroup(
      title: 'Komunikasi',
      items: [
        _NavItem(
          icon: Icons.campaign_outlined,
          activeIcon: Icons.campaign,
          label: 'Pengumuman',
          route: '/announcements',
        ),
        _NavItem(
          icon: Icons.chat_outlined,
          activeIcon: Icons.chat,
          label: 'Chat',
          route: '/chat',
        ),
        _NavItem(
          icon: Icons.article_outlined,
          activeIcon: Icons.article,
          label: 'Ruang Membaca',
          route: '/articles',
        ),
      ],
    ),
    _MenuGroup(
      title: 'Monitoring',
      items: [
        _NavItem(
          icon: Icons.supervisor_account_outlined,
          activeIcon: Icons.supervisor_account,
          label: 'Aktivitas Staff',
          route: '/staff-activity',
        ),
      ],
    ),
  ];

  int _getSelectedIndex(String currentLocation) {
    for (int i = 0; i < _mainNavItems.length - 1; i++) {
      if (currentLocation.startsWith(_mainNavItems[i].route)) {
        return i;
      }
    }
    return -1;
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final size = MediaQuery.of(context).size;
    final isTablet = size.width > 900;
    final currentLocation = GoRouterState.of(context).matchedLocation;
    final selectedIndex = _getSelectedIndex(currentLocation);

    if (isTablet) {
      return Scaffold(
        key: _scaffoldKey,
        body: Row(
          children: [
            // Sidebar for tablet
            _buildTabletSidebar(authState, currentLocation, size.width > 1200),
            const VerticalDivider(thickness: 1, width: 1),
            // Main content
            Expanded(
              child: Column(
                children: [
                  _buildAppBar(authState, currentLocation, isTablet: true),
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
      key: _scaffoldKey,
      appBar: _buildAppBar(authState, currentLocation, isTablet: false),
      drawer: _buildDrawer(authState, currentLocation),
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex >= 0 ? selectedIndex : 3,
        onDestinationSelected: (index) => _onMobileNavTap(index),
        destinations: _mainNavItems.map((item) {
          return NavigationDestination(
            icon: Icon(item.icon),
            selectedIcon: Icon(item.activeIcon),
            label: item.label,
          );
        }).toList(),
      ),
    );
  }

  Widget _buildTabletSidebar(AuthState authState, String currentLocation, bool extended) {
    return Container(
      width: extended ? 250 : 72,
      color: Colors.white,
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.medical_services, color: AppColors.primary, size: 24),
                ),
                if (extended) ...[
                  const SizedBox(width: 12),
                  const Text(
                    'dokterDIBYA',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Divider(height: 1),
          // Menu items
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: _menuGroups.map((group) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (extended)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                        child: Text(
                          group.title,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textSecondary,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ...group.items.map((item) {
                      final isSelected = currentLocation.startsWith(item.route);
                      return _buildSidebarItem(item, isSelected, extended);
                    }),
                  ],
                );
              }).toList(),
            ),
          ),
          // User info & logout
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: extended
                ? Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                        child: Text(
                          (authState.user?['name'] ?? 'U')[0].toUpperCase(),
                          style: const TextStyle(color: AppColors.primary),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              authState.user?['name'] ?? 'User',
                              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              authState.role?.displayName ?? '',
                              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.logout, size: 20),
                        onPressed: _handleLogout,
                        tooltip: 'Logout',
                      ),
                    ],
                  )
                : IconButton(
                    icon: const Icon(Icons.logout),
                    onPressed: _handleLogout,
                    tooltip: 'Logout',
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSidebarItem(_NavItem item, bool isSelected, bool extended) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.go(item.route),
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: extended ? 16 : 0,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary.withValues(alpha: 0.1) : null,
            border: isSelected
                ? const Border(left: BorderSide(color: AppColors.primary, width: 3))
                : null,
          ),
          child: extended
              ? Row(
                  children: [
                    Icon(
                      isSelected ? item.activeIcon : item.icon,
                      color: isSelected ? AppColors.primary : AppColors.textSecondary,
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      item.label,
                      style: TextStyle(
                        color: isSelected ? AppColors.primary : AppColors.textPrimary,
                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                        fontSize: 14,
                      ),
                    ),
                  ],
                )
              : Center(
                  child: Icon(
                    isSelected ? item.activeIcon : item.icon,
                    color: isSelected ? AppColors.primary : AppColors.textSecondary,
                    size: 24,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildDrawer(AuthState authState, String currentLocation) {
    return Drawer(
      child: Column(
        children: [
          // Drawer header
          Container(
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 16,
              left: 16,
              right: 16,
              bottom: 16,
            ),
            decoration: const BoxDecoration(
              color: AppColors.primary,
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: Colors.white.withValues(alpha: 0.2),
                  child: Text(
                    (authState.user?['name'] ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontSize: 20),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authState.user?['name'] ?? 'User',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        authState.role?.displayName ?? '',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Menu items
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: _menuGroups.map((group) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Text(
                        group.title,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                    ...group.items.map((item) {
                      final isSelected = currentLocation.startsWith(item.route);
                      return ListTile(
                        leading: Icon(
                          isSelected ? item.activeIcon : item.icon,
                          color: isSelected ? AppColors.primary : AppColors.textSecondary,
                        ),
                        title: Text(
                          item.label,
                          style: TextStyle(
                            color: isSelected ? AppColors.primary : AppColors.textPrimary,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                        selected: isSelected,
                        selectedTileColor: AppColors.primary.withValues(alpha: 0.1),
                        onTap: () {
                          Navigator.pop(context);
                          context.go(item.route);
                        },
                      );
                    }),
                  ],
                );
              }).toList(),
            ),
          ),
          // Logout button
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.logout, color: AppColors.danger),
            title: const Text('Logout', style: TextStyle(color: AppColors.danger)),
            onTap: () {
              Navigator.pop(context);
              _handleLogout();
            },
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(AuthState authState, String currentLocation, {required bool isTablet}) {
    String title = 'dokterDIBYA';
    for (final group in _menuGroups) {
      for (final item in group.items) {
        if (currentLocation.startsWith(item.route)) {
          title = item.label;
          break;
        }
      }
    }

    return AppBar(
      automaticallyImplyLeading: !isTablet,
      leading: isTablet
          ? null
          : IconButton(
              icon: const Icon(Icons.menu),
              onPressed: () => _scaffoldKey.currentState?.openDrawer(),
            ),
      title: Text(title),
      actions: [
        // Notifications
        IconButton(
          icon: const Badge(
            label: Text('3'),
            child: Icon(Icons.notifications_outlined),
          ),
          onPressed: () => context.push('/notifications'),
        ),
        if (!isTablet)
          // User avatar for mobile
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              child: Text(
                (authState.user?['name'] ?? 'U')[0].toUpperCase(),
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
            ),
          ),
        const SizedBox(width: 4),
      ],
    );
  }

  void _onMobileNavTap(int index) {
    if (index == 3) {
      // Open drawer for "Menu" item
      _scaffoldKey.currentState?.openDrawer();
    } else {
      context.go(_mainNavItems[index].route);
    }
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

class _MenuGroup {
  final String title;
  final List<_NavItem> items;

  _MenuGroup({required this.title, required this.items});
}
