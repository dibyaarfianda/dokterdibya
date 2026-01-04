import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../data/models/announcement_model.dart';
import '../providers/announcement_provider.dart';

class AnnouncementScreen extends ConsumerStatefulWidget {
  const AnnouncementScreen({super.key});

  @override
  ConsumerState<AnnouncementScreen> createState() => _AnnouncementScreenState();
}

class _AnnouncementScreenState extends ConsumerState<AnnouncementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    Future.microtask(() {
      ref.read(announcementProvider.notifier).loadAnnouncements();
      ref.read(announcementProvider.notifier).loadStaffAnnouncements();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(announcementProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pengumuman'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Untuk Pasien'),
            Tab(text: 'Staff'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildPatientAnnouncements(state),
          _buildStaffAnnouncements(state),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildPatientAnnouncements(AnnouncementState state) {
    if (state.isLoading && state.announcements.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.announcements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.campaign_outlined, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Belum ada pengumuman',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(announcementProvider.notifier).loadAnnouncements(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.announcements.length,
        itemBuilder: (context, index) {
          final announcement = state.announcements[index];
          return _AnnouncementCard(
            announcement: announcement,
            onEdit: () => _showEditDialog(announcement),
            onDelete: () => _confirmDelete(announcement.id),
          );
        },
      ),
    );
  }

  Widget _buildStaffAnnouncements(AnnouncementState state) {
    if (state.isLoading && state.staffAnnouncements.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.staffAnnouncements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.announcement_outlined, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Belum ada pengumuman staff',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(announcementProvider.notifier).loadStaffAnnouncements(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.staffAnnouncements.length,
        itemBuilder: (context, index) {
          final announcement = state.staffAnnouncements[index];
          return _StaffAnnouncementCard(
            announcement: announcement,
            onTap: () {
              ref.read(announcementProvider.notifier)
                  .markStaffAnnouncementRead(announcement.id);
              _showStaffAnnouncementDetail(announcement);
            },
          );
        },
      ),
    );
  }

  void _showCreateDialog() {
    final titleController = TextEditingController();
    final contentController = TextEditingController();
    bool isStaff = _tabController.index == 1;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isStaff ? 'Pengumuman Staff Baru' : 'Pengumuman Baru'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Judul',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contentController,
                decoration: const InputDecoration(
                  labelText: 'Isi Pengumuman',
                  border: OutlineInputBorder(),
                ),
                maxLines: 5,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty || contentController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Judul dan isi harus diisi')),
                );
                return;
              }

              final data = {
                'title': titleController.text,
                'content': contentController.text,
              };

              bool success;
              if (isStaff) {
                success = await ref
                    .read(announcementProvider.notifier)
                    .createStaffAnnouncement(data);
              } else {
                success = await ref
                    .read(announcementProvider.notifier)
                    .createAnnouncement(data);
              }

              if (success && mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Pengumuman berhasil dibuat')),
                );
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(Announcement announcement) {
    final titleController = TextEditingController(text: announcement.title);
    final contentController = TextEditingController(text: announcement.content);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Pengumuman'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Judul',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contentController,
                decoration: const InputDecoration(
                  labelText: 'Isi Pengumuman',
                  border: OutlineInputBorder(),
                ),
                maxLines: 5,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              final data = {
                'title': titleController.text,
                'content': contentController.text,
              };

              final success = await ref
                  .read(announcementProvider.notifier)
                  .updateAnnouncement(announcement.id, data);

              if (success && mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Pengumuman berhasil diperbarui')),
                );
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(int id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus Pengumuman'),
        content: const Text('Apakah Anda yakin ingin menghapus pengumuman ini?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () async {
              final success = await ref
                  .read(announcementProvider.notifier)
                  .deleteAnnouncement(id);

              if (mounted) {
                Navigator.pop(context);
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Pengumuman berhasil dihapus')),
                  );
                }
              }
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
  }

  void _showStaffAnnouncementDetail(StaffAnnouncement announcement) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(announcement.title),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                DateFormat('d MMM yyyy HH:mm', 'id_ID').format(announcement.createdAt),
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
              if (announcement.createdByName != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Oleh: ${announcement.createdByName}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
              const Divider(height: 24),
              Text(announcement.content),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tutup'),
          ),
        ],
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  final Announcement announcement;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _AnnouncementCard({
    required this.announcement,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    announcement.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: announcement.isActive
                        ? Colors.green.withValues(alpha: 0.1)
                        : Colors.grey.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    announcement.isActive ? 'Aktif' : 'Nonaktif',
                    style: TextStyle(
                      fontSize: 11,
                      color: announcement.isActive ? Colors.green : Colors.grey,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              announcement.content,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.grey[700]),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.favorite, size: 16, color: Colors.red[300]),
                const SizedBox(width: 4),
                Text(
                  '${announcement.likes}',
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
                const Spacer(),
                Text(
                  DateFormat('d MMM yyyy', 'id_ID').format(announcement.createdAt),
                  style: TextStyle(color: Colors.grey[500], fontSize: 12),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.edit, size: 20),
                  onPressed: onEdit,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.delete, size: 20, color: Colors.red),
                  onPressed: onDelete,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StaffAnnouncementCard extends StatelessWidget {
  final StaffAnnouncement announcement;
  final VoidCallback onTap;

  const _StaffAnnouncementCard({
    required this.announcement,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final priorityColor = announcement.priority == 'high'
        ? Colors.red
        : announcement.priority == 'medium'
            ? Colors.orange
            : AppColors.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: announcement.isRead ? null : Colors.blue.withValues(alpha: 0.05),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 48,
                decoration: BoxDecoration(
                  color: priorityColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (!announcement.isRead)
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: const BoxDecoration(
                              color: Colors.blue,
                              shape: BoxShape.circle,
                            ),
                          ),
                        Expanded(
                          child: Text(
                            announcement.title,
                            style: TextStyle(
                              fontWeight: announcement.isRead
                                  ? FontWeight.normal
                                  : FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      announcement.content,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      DateFormat('d MMM yyyy HH:mm', 'id_ID')
                          .format(announcement.createdAt),
                      style: TextStyle(
                        color: Colors.grey[500],
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
