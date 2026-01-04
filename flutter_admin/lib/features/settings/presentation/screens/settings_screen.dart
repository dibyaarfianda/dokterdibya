import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../auth/presentation/providers/auth_provider.dart' show authStateProvider;
import '../providers/settings_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    ref.read(profileProvider.notifier).loadProfile();
  }

  @override
  Widget build(BuildContext context) {
    final profileState = ref.watch(profileProvider);
    final preferences = ref.watch(preferencesProvider);
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengaturan'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => _loadData(),
        child: ListView(
          children: [
            // Profile Section
            _buildProfileSection(profileState),

            const Divider(),

            // App Settings
            _buildSettingsSection(
              title: 'Aplikasi',
              children: [
                SwitchListTile(
                  title: const Text('Mode Gelap'),
                  subtitle: const Text('Gunakan tema gelap'),
                  secondary: const Icon(Icons.dark_mode),
                  value: preferences.darkMode,
                  onChanged: (value) {
                    ref.read(preferencesProvider.notifier).setDarkMode(value);
                  },
                ),
                SwitchListTile(
                  title: const Text('Notifikasi'),
                  subtitle: const Text('Aktifkan notifikasi push'),
                  secondary: const Icon(Icons.notifications),
                  value: preferences.notificationsEnabled,
                  onChanged: (value) {
                    ref.read(preferencesProvider.notifier).setNotificationsEnabled(value);
                  },
                ),
                SwitchListTile(
                  title: const Text('Suara'),
                  subtitle: const Text('Aktifkan suara notifikasi'),
                  secondary: const Icon(Icons.volume_up),
                  value: preferences.soundEnabled,
                  onChanged: (value) {
                    ref.read(preferencesProvider.notifier).setSoundEnabled(value);
                  },
                ),
              ],
            ),

            const Divider(),

            // Account Settings
            _buildSettingsSection(
              title: 'Akun',
              children: [
                ListTile(
                  leading: const Icon(Icons.person),
                  title: const Text('Edit Profil'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _showEditProfileDialog(),
                ),
                ListTile(
                  leading: const Icon(Icons.lock),
                  title: const Text('Ubah Password'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _showChangePasswordDialog(),
                ),
              ],
            ),

            const Divider(),

            // Admin Settings (if admin/dokter)
            if (authState.user?.role == 'dokter' || authState.user?.role == 'admin') ...[
              _buildSettingsSection(
                title: 'Admin',
                children: [
                  ListTile(
                    leading: const Icon(Icons.history),
                    title: const Text('Log Aktivitas'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/settings/activity-logs'),
                  ),
                  ListTile(
                    leading: const Icon(Icons.visibility),
                    title: const Text('Visibilitas Menu'),
                    subtitle: const Text('Atur akses role'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/settings/role-visibility'),
                  ),
                ],
              ),
              const Divider(),
            ],

            // App Info
            _buildSettingsSection(
              title: 'Tentang',
              children: [
                ListTile(
                  leading: const Icon(Icons.info),
                  title: const Text('Versi Aplikasi'),
                  trailing: const Text('1.0.0'),
                ),
                ListTile(
                  leading: const Icon(Icons.description),
                  title: const Text('Kebijakan Privasi'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    // TODO: Open privacy policy
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.article),
                  title: const Text('Syarat & Ketentuan'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    // TODO: Open terms
                  },
                ),
              ],
            ),

            const Divider(),

            // Logout
            Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton.icon(
                onPressed: () => _showLogoutConfirmation(),
                icon: const Icon(Icons.logout),
                label: const Text('Keluar'),
                style: ElevatedButton.styleFrom(
                  foregroundColor: Colors.red,
                  backgroundColor: Colors.red.shade50,
                ),
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileSection(ProfileState state) {
    if (state.isLoading && state.profile == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    final profile = state.profile;
    if (profile == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Text('Gagal memuat profil'),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Text(
              profile.initials,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onPrimaryContainer,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  profile.email,
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    profile.roleDisplayName,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        ),
        ...children,
      ],
    );
  }

  void _showEditProfileDialog() {
    final profile = ref.read(profileProvider).profile;
    if (profile == null) return;

    final nameController = TextEditingController(text: profile.name);
    final phoneController = TextEditingController(text: profile.phone ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Profil'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Nama',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: phoneController,
              decoration: const InputDecoration(
                labelText: 'No. Telepon',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.phone,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          Consumer(
            builder: (context, ref, child) {
              final isSaving = ref.watch(profileProvider).isSaving;
              return ElevatedButton(
                onPressed: isSaving
                    ? null
                    : () async {
                        final success = await ref
                            .read(profileProvider.notifier)
                            .updateProfile({
                          'name': nameController.text.trim(),
                          'phone': phoneController.text.trim(),
                        });
                        if (success && mounted) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Profil berhasil diupdate')),
                          );
                        }
                      },
                child: isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Simpan'),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showChangePasswordDialog() {
    final currentController = TextEditingController();
    final newController = TextEditingController();
    final confirmController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ubah Password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: currentController,
              decoration: const InputDecoration(
                labelText: 'Password Saat Ini',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: newController,
              decoration: const InputDecoration(
                labelText: 'Password Baru',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: confirmController,
              decoration: const InputDecoration(
                labelText: 'Konfirmasi Password Baru',
                border: OutlineInputBorder(),
              ),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          Consumer(
            builder: (context, ref, child) {
              final isSaving = ref.watch(profileProvider).isSaving;
              return ElevatedButton(
                onPressed: isSaving
                    ? null
                    : () async {
                        if (newController.text != confirmController.text) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Password baru tidak sama'),
                              backgroundColor: Colors.red,
                            ),
                          );
                          return;
                        }

                        final success = await ref
                            .read(profileProvider.notifier)
                            .changePassword(
                              currentPassword: currentController.text,
                              newPassword: newController.text,
                            );

                        if (success && mounted) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Password berhasil diubah')),
                          );
                        } else {
                          final error = ref.read(profileProvider).error;
                          if (error != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(error),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                        }
                      },
                child: isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Ubah'),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showLogoutConfirmation() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Keluar'),
        content: const Text('Apakah Anda yakin ingin keluar dari aplikasi?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              ref.read(authStateProvider.notifier).logout();
              context.go('/login');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
  }
}
