import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/notification_model.dart';
import '../../data/repositories/notification_repository.dart';

// Notification List State
class NotificationListState {
  final List<AppNotification> items;
  final bool isLoading;
  final String? error;
  final bool hasMore;
  final int currentPage;

  NotificationListState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.hasMore = true,
    this.currentPage = 1,
  });

  NotificationListState copyWith({
    List<AppNotification>? items,
    bool? isLoading,
    String? error,
    bool? hasMore,
    int? currentPage,
  }) {
    return NotificationListState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      hasMore: hasMore ?? this.hasMore,
      currentPage: currentPage ?? this.currentPage,
    );
  }

  int get unreadCount => items.where((n) => !n.isRead).length;
}

class NotificationListNotifier extends StateNotifier<NotificationListState> {
  final NotificationRepository _repository;

  NotificationListNotifier(this._repository) : super(NotificationListState());

  Future<void> loadNotifications({bool refresh = false}) async {
    if (state.isLoading) return;

    final page = refresh ? 1 : state.currentPage;
    state = state.copyWith(isLoading: true, error: null);

    try {
      final items = await _repository.getNotifications(page: page);

      if (refresh) {
        state = state.copyWith(
          items: items,
          isLoading: false,
          currentPage: 1,
          hasMore: items.length >= 20,
        );
      } else {
        state = state.copyWith(
          items: [...state.items, ...items],
          isLoading: false,
          currentPage: page + 1,
          hasMore: items.length >= 20,
        );
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() => loadNotifications(refresh: true);

  Future<void> loadMore() {
    if (state.hasMore && !state.isLoading) {
      return loadNotifications();
    }
    return Future.value();
  }

  Future<void> markAsRead(int id) async {
    try {
      await _repository.markAsRead(id);
      state = state.copyWith(
        items: state.items.map((n) {
          if (n.id == id) {
            return AppNotification(
              id: n.id,
              type: n.type,
              title: n.title,
              message: n.message,
              link: n.link,
              data: n.data,
              isRead: true,
              createdAt: n.createdAt,
            );
          }
          return n;
        }).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> markAllAsRead() async {
    try {
      await _repository.markAllAsRead();
      state = state.copyWith(
        items: state.items.map((n) {
          return AppNotification(
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            link: n.link,
            data: n.data,
            isRead: true,
            createdAt: n.createdAt,
          );
        }).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final notificationListProvider =
    StateNotifierProvider<NotificationListNotifier, NotificationListState>((ref) {
  final repository = ref.watch(notificationRepositoryProvider);
  return NotificationListNotifier(repository);
});

// Announcement List State
class AnnouncementListState {
  final List<StaffAnnouncement> items;
  final bool isLoading;
  final String? error;

  AnnouncementListState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  AnnouncementListState copyWith({
    List<StaffAnnouncement>? items,
    bool? isLoading,
    String? error,
  }) {
    return AnnouncementListState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }

  int get unreadCount => items.where((a) => !a.isRead).length;
}

class AnnouncementListNotifier extends StateNotifier<AnnouncementListState> {
  final NotificationRepository _repository;

  AnnouncementListNotifier(this._repository) : super(AnnouncementListState());

  Future<void> loadAnnouncements() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final items = await _repository.getAnnouncements();
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> markAsRead(int id) async {
    try {
      await _repository.markAnnouncementAsRead(id);
      state = state.copyWith(
        items: state.items.map((a) {
          if (a.id == id) {
            return StaffAnnouncement(
              id: a.id,
              title: a.title,
              content: a.content,
              type: a.type,
              priority: a.priority,
              createdBy: a.createdBy,
              createdByName: a.createdByName,
              isRead: true,
              createdAt: a.createdAt,
              expiresAt: a.expiresAt,
            );
          }
          return a;
        }).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

final announcementListProvider =
    StateNotifierProvider<AnnouncementListNotifier, AnnouncementListState>((ref) {
  final repository = ref.watch(notificationRepositoryProvider);
  return AnnouncementListNotifier(repository);
});

// Unread Count Provider
final unreadCountProvider = FutureProvider<NotificationCount>((ref) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getUnreadCount();
});

// Online Users Provider
final onlineUsersProvider = FutureProvider<List<OnlineUser>>((ref) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getOnlineUsers();
});
