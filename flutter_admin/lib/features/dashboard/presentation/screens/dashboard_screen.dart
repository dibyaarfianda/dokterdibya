import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/repositories/dashboard_repository.dart';
import '../providers/dashboard_provider.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(dashboardProvider.notifier).loadDashboard();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final dashboardState = ref.watch(dashboardProvider);
    final size = MediaQuery.of(context).size;
    final isTablet = size.width > 600;

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(dashboardProvider.notifier).refresh();
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.waving_hand,
                        color: AppColors.primary,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _getGreeting(),
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: AppColors.textSecondary,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            authState.user?['name'] ?? 'User',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Stats Grid
            if (dashboardState.isLoading && dashboardState.stats.totalPatients == 0)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else ...[
              GridView.count(
                crossAxisCount: isTablet ? 4 : 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: isTablet ? 1.5 : 1.3,
                children: [
                  _StatCard(
                    title: 'Total Pasien',
                    value: _formatNumber(dashboardState.stats.totalPatients),
                    icon: Icons.people,
                    color: AppColors.primary,
                  ),
                  _StatCard(
                    title: 'Kasus Gynae',
                    value: dashboardState.stats.gynaeCases.toString(),
                    icon: Icons.pregnant_woman,
                    color: AppColors.success,
                  ),
                  _StatCard(
                    title: 'Jadwal Minggu',
                    value: dashboardState.stats.nextSundayAppointments.toString(),
                    icon: Icons.calendar_today,
                    color: AppColors.info,
                  ),
                  _StatCard(
                    title: _formatSundayDate(dashboardState.stats.nextSundayDate),
                    value: 'Minggu',
                    icon: Icons.event,
                    color: AppColors.warning,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Chart Section
              Text(
                'Kunjungan 30 Hari Terakhir',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    height: 200,
                    child: dashboardState.chartData.isEmpty
                        ? const Center(child: Text('Tidak ada data kunjungan'))
                        : _buildLineChart(dashboardState.chartData),
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Quick Actions
            Text(
              'Aksi Cepat',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _QuickActionButton(
                  icon: Icons.person_add,
                  label: 'Pasien Baru',
                  onTap: () => context.push('/patients/add'),
                ),
                _QuickActionButton(
                  icon: Icons.medical_services,
                  label: 'Sunday Clinic',
                  onTap: () {
                    // Navigate to Sunday Clinic
                  },
                ),
                _QuickActionButton(
                  icon: Icons.search,
                  label: 'Cari Pasien',
                  onTap: () => context.push('/patients'),
                ),
                _QuickActionButton(
                  icon: Icons.calendar_today,
                  label: 'Jadwal',
                  onTap: () {
                    // Navigate to appointments
                  },
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Recent Activity
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Aktivitas Terbaru',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                TextButton(
                  onPressed: () {
                    // Navigate to activity logs
                  },
                  child: const Text('Lihat Semua'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Card(
              child: dashboardState.recentActivity.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('Belum ada aktivitas')),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: dashboardState.recentActivity.length > 5
                          ? 5
                          : dashboardState.recentActivity.length,
                      separatorBuilder: (context, index) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final activity = dashboardState.recentActivity[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                            child: Icon(
                              _getActivityIcon(activity['action'] ?? ''),
                              color: AppColors.primary,
                              size: 20,
                            ),
                          ),
                          title: Text(
                            activity['description'] ?? '-',
                            style: const TextStyle(fontSize: 14),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            _formatActivityTime(activity['created_at']),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                          trailing: const Icon(Icons.chevron_right, size: 20),
                          onTap: () {},
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLineChart(List<DailyVisit> data) {
    final spots = data.asMap().entries.map((entry) {
      return FlSpot(entry.key.toDouble(), entry.value.count.toDouble());
    }).toList();

    final maxY = data.map((d) => d.count).reduce((a, b) => a > b ? a : b);
    final adjustedMaxY = maxY < 5 ? 10.0 : (maxY * 1.2).ceilToDouble();

    return LineChart(
      LineChartData(
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: adjustedMaxY / 5,
          getDrawingHorizontalLine: (value) {
            return FlLine(
              color: Colors.grey[300]!,
              strokeWidth: 1,
            );
          },
        ),
        titlesData: FlTitlesData(
          show: true,
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 30,
              interval: (data.length / 5).ceilToDouble(),
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index < 0 || index >= data.length) return const Text('');
                final date = data[index].date;
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    DateFormat('d/M').format(date),
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 10,
                    ),
                  ),
                );
              },
            ),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 32,
              interval: adjustedMaxY / 5,
              getTitlesWidget: (value, meta) {
                return Text(
                  value.toInt().toString(),
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 10,
                  ),
                );
              },
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        minX: 0,
        maxX: (data.length - 1).toDouble(),
        minY: 0,
        maxY: adjustedMaxY,
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: AppColors.primary,
            barWidth: 3,
            isStrokeCapRound: true,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: AppColors.primary.withValues(alpha: 0.1),
            ),
          ),
        ],
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touchedSpots) {
              return touchedSpots.map((spot) {
                final index = spot.x.toInt();
                if (index >= 0 && index < data.length) {
                  final date = data[index].date;
                  return LineTooltipItem(
                    '${DateFormat('d MMM').format(date)}\n${spot.y.toInt()} kunjungan',
                    const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  );
                }
                return null;
              }).toList();
            },
          ),
        ),
      ),
    );
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }

  String _formatNumber(int number) {
    if (number >= 1000) {
      return '${(number / 1000).toStringAsFixed(1)}k';
    }
    return number.toString();
  }

  String _formatSundayDate(String? dateStr) {
    if (dateStr == null) return '-';
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('d MMM').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  IconData _getActivityIcon(String action) {
    switch (action.toLowerCase()) {
      case 'create':
      case 'add':
        return Icons.add_circle_outline;
      case 'update':
      case 'edit':
        return Icons.edit_outlined;
      case 'delete':
        return Icons.delete_outline;
      case 'login':
        return Icons.login;
      case 'logout':
        return Icons.logout;
      default:
        return Icons.info_outline;
    }
  }

  String _formatActivityTime(String? timestamp) {
    if (timestamp == null) return '-';
    try {
      final date = DateTime.parse(timestamp);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return 'Baru saja';
      if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
      if (diff.inHours < 24) return '${diff.inHours} jam lalu';
      if (diff.inDays < 7) return '${diff.inDays} hari lalu';

      return DateFormat('d MMM yyyy').format(date);
    } catch (e) {
      return '-';
    }
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                Text(
                  value,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: color,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: Theme.of(context).textTheme.bodySmall,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w500,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
