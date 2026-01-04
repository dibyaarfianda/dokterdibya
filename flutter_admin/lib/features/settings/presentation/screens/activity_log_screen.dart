import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/settings_model.dart';
import '../providers/settings_provider.dart';

class ActivityLogScreen extends ConsumerStatefulWidget {
  const ActivityLogScreen({super.key});

  @override
  ConsumerState<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends ConsumerState<ActivityLogScreen> {
  @override
  void initState() {
    super.initState();
    ref.read(activityLogProvider.notifier).loadLogs(refresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(activityLogProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Log Aktivitas'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(),
          ),
        ],
      ),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(ActivityLogState state) {
    if (state.isLoading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(state.error!, style: TextStyle(color: Colors.red.shade700)),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => ref.read(activityLogProvider.notifier).refresh(),
              child: const Text('Coba Lagi'),
            ),
          ],
        ),
      );
    }

    if (state.items.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('Belum ada log aktivitas', style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(activityLogProvider.notifier).refresh(),
      child: ListView.builder(
        itemCount: state.items.length + (state.hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.items.length) {
            if (state.isLoading) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            WidgetsBinding.instance.addPostFrameCallback((_) {
              ref.read(activityLogProvider.notifier).loadLogs();
            });
            return const SizedBox.shrink();
          }

          final log = state.items[index];
          return _ActivityLogTile(log: log);
        },
      ),
    );
  }

  void _showFilterDialog() {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Filter Log',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 20),
            const Text('Fitur filter akan datang segera...'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Tutup'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityLogTile extends StatelessWidget {
  final ActivityLog log;

  const _ActivityLogTile({required this.log});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: _getActionColor(log.action).withValues(alpha: 0.1),
        child: Icon(
          _getActionIcon(log.action),
          size: 20,
          color: _getActionColor(log.action),
        ),
      ),
      title: Text(log.actionDisplayName),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (log.description != null)
            Text(
              log.description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              if (log.userName != null) ...[
                Icon(Icons.person, size: 12, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(
                  log.userName!,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(width: 12),
              ],
              Icon(Icons.access_time, size: 12, color: Colors.grey.shade600),
              const SizedBox(width: 4),
              Text(
                log.timeAgo,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            ],
          ),
        ],
      ),
      isThreeLine: log.description != null,
    );
  }

  Color _getActionColor(String action) {
    if (action.contains('create') || action.contains('add')) {
      return Colors.green;
    } else if (action.contains('update') || action.contains('edit')) {
      return Colors.blue;
    } else if (action.contains('delete') || action.contains('remove')) {
      return Colors.red;
    } else if (action == 'login') {
      return Colors.teal;
    } else if (action == 'logout') {
      return Colors.orange;
    }
    return Colors.grey;
  }

  IconData _getActionIcon(String action) {
    if (action.contains('patient')) return Icons.person;
    if (action.contains('medical_record')) return Icons.medical_services;
    if (action.contains('billing')) return Icons.receipt;
    if (action.contains('appointment')) return Icons.calendar_today;
    if (action == 'login') return Icons.login;
    if (action == 'logout') return Icons.logout;
    return Icons.history;
  }
}
