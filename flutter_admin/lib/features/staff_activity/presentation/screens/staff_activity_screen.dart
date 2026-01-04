import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../providers/staff_activity_provider.dart';

class StaffActivityScreen extends ConsumerStatefulWidget {
  const StaffActivityScreen({super.key});

  @override
  ConsumerState<StaffActivityScreen> createState() => _StaffActivityScreenState();
}

class _StaffActivityScreenState extends ConsumerState<StaffActivityScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _dateFormat = DateFormat('dd/MM/yyyy HH:mm');
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    Future.microtask(() {
      ref.read(staffActivityProvider.notifier).loadAll();
    });

    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        final state = ref.read(staffActivityProvider);
        if (!state.isLoading) {
          ref.read(staffActivityProvider.notifier).loadLogs();
        }
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(staffActivityProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Aktivitas Staff'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(staffActivityProvider.notifier).loadAll(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.people), text: 'Online'),
            Tab(icon: Icon(Icons.analytics), text: 'Ringkasan'),
            Tab(icon: Icon(Icons.history), text: 'Log'),
          ],
        ),
      ),
      body: state.isLoading && state.logs.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildOnlineTab(state),
                _buildSummaryTab(state),
                _buildLogsTab(state),
              ],
            ),
    );
  }

  Widget _buildOnlineTab(StaffActivityState state) {
    if (state.onlineUsers.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.person_off, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Tidak ada staff online',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(staffActivityProvider.notifier).loadOnlineUsers(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.onlineUsers.length,
        itemBuilder: (context, index) {
          final user = state.onlineUsers[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: Stack(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                    child: Text(
                      user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                      style: const TextStyle(color: AppColors.primary),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: user.isOnline ? Colors.green : Colors.grey,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
              title: Text(user.name),
              subtitle: Text(
                user.isOnline
                    ? 'Online'
                    : 'Terakhir aktif: ${_dateFormat.format(user.lastSeen)}',
                style: TextStyle(
                  color: user.isOnline ? Colors.green : Colors.grey,
                ),
              ),
              trailing: user.role != null
                  ? Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        user.role!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.primary,
                        ),
                      ),
                    )
                  : null,
            ),
          );
        },
      ),
    );
  }

  Widget _buildSummaryTab(StaffActivityState state) {
    final summary = state.summary;

    if (summary == null) {
      return const Center(child: Text('Tidak ada data'));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Stats cards
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  icon: Icons.timeline,
                  label: 'Total Aktivitas',
                  value: summary.totalActivities.toString(),
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  icon: Icons.people,
                  label: 'Pengguna Aktif',
                  value: summary.uniqueUsers.toString(),
                  color: Colors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Most active users
          const Text(
            'Staff Paling Aktif',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          ...summary.mostActiveUsers.take(5).map((user) {
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                  child: Text(
                    user.userName.isNotEmpty ? user.userName[0].toUpperCase() : '?',
                    style: const TextStyle(color: AppColors.primary),
                  ),
                ),
                title: Text(user.userName),
                subtitle: Text(
                  'Terakhir aktif: ${_dateFormat.format(user.lastActivity)}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
                trailing: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${user.actionCount}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ),
              ),
            );
          }),

          const SizedBox(height: 24),

          // By action
          const Text(
            'Aktivitas per Jenis',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 12),
          ...summary.byAction.map((action) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(child: Text(action.action)),
                  Text(
                    action.count.toString(),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildLogsTab(StaffActivityState state) {
    return Column(
      children: [
        // Filter
        if (state.selectedAction != null)
          Container(
            padding: const EdgeInsets.all(8),
            color: AppColors.primary.withValues(alpha: 0.1),
            child: Row(
              children: [
                const Icon(Icons.filter_alt, size: 16, color: AppColors.primary),
                const SizedBox(width: 8),
                Chip(
                  label: Text(state.selectedAction!),
                  onDeleted: () {
                    ref.read(staffActivityProvider.notifier).setFilter(action: null);
                    ref.read(staffActivityProvider.notifier).loadLogs(reset: true);
                  },
                ),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    ref.read(staffActivityProvider.notifier).clearFilters();
                    ref.read(staffActivityProvider.notifier).loadLogs(reset: true);
                  },
                  child: const Text('Reset'),
                ),
              ],
            ),
          ),

        // Filter button
        Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              if (state.actions.isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () => _showActionFilter(state),
                  icon: const Icon(Icons.filter_list, size: 18),
                  label: const Text('Filter'),
                ),
              const Spacer(),
              Text(
                '${state.logs.length} aktivitas',
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
            ],
          ),
        ),

        // Logs list
        Expanded(
          child: state.logs.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.history, size: 64, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'Tidak ada log aktivitas',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () =>
                      ref.read(staffActivityProvider.notifier).loadLogs(reset: true),
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: state.logs.length + (state.isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == state.logs.length) {
                        return const Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(),
                          ),
                        );
                      }

                      final log = state.logs[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    radius: 16,
                                    backgroundColor:
                                        AppColors.primary.withValues(alpha: 0.1),
                                    child: Text(
                                      log.userName.isNotEmpty
                                          ? log.userName[0].toUpperCase()
                                          : '?',
                                      style: const TextStyle(
                                        color: AppColors.primary,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          log.userName,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        Text(
                                          _dateFormat.format(log.timestamp),
                                          style: TextStyle(
                                            color: Colors.grey[600],
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: _getActionColor(log.action)
                                          .withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      log.action,
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: _getActionColor(log.action),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              if (log.details != null &&
                                  log.details!.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  log.details!,
                                  style: TextStyle(
                                    color: Colors.grey[700],
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  Color _getActionColor(String action) {
    if (action.contains('CREATE') || action.contains('ADD')) {
      return Colors.green;
    }
    if (action.contains('UPDATE') || action.contains('EDIT')) {
      return Colors.blue;
    }
    if (action.contains('DELETE') || action.contains('REMOVE')) {
      return Colors.red;
    }
    return AppColors.primary;
  }

  void _showActionFilter(StaffActivityState state) {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Filter berdasarkan Aksi',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  ListTile(
                    title: const Text('Semua'),
                    selected: state.selectedAction == null,
                    onTap: () {
                      ref.read(staffActivityProvider.notifier).setFilter(action: null);
                      ref.read(staffActivityProvider.notifier).loadLogs(reset: true);
                      Navigator.pop(context);
                    },
                  ),
                  ...state.actions.map((action) {
                    return ListTile(
                      title: Text(action),
                      selected: state.selectedAction == action,
                      onTap: () {
                        ref.read(staffActivityProvider.notifier).setFilter(action: action);
                        ref.read(staffActivityProvider.notifier).loadLogs(reset: true);
                        Navigator.pop(context);
                      },
                    );
                  }),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
