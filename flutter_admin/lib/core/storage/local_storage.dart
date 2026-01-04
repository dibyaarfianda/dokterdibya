import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

class LocalStorage {
  static const String _boxName = 'app_storage';
  late Box _box;

  Future<void> init() async {
    await Hive.initFlutter();
    _box = await Hive.openBox(_boxName);
  }

  // String operations
  Future<void> setString(String key, String value) async {
    await _box.put(key, value);
  }

  String? getString(String key) {
    return _box.get(key);
  }

  // Bool operations
  Future<void> setBool(String key, bool value) async {
    await _box.put(key, value);
  }

  bool? getBool(String key) {
    return _box.get(key);
  }

  // Int operations
  Future<void> setInt(String key, int value) async {
    await _box.put(key, value);
  }

  int? getInt(String key) {
    return _box.get(key);
  }

  // Map operations
  Future<void> setMap(String key, Map<String, dynamic> value) async {
    await _box.put(key, jsonEncode(value));
  }

  Map<String, dynamic>? getMap(String key) {
    final data = _box.get(key);
    if (data != null && data is String) {
      try {
        return jsonDecode(data) as Map<String, dynamic>;
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  // List operations
  Future<void> setList(String key, List<dynamic> value) async {
    await _box.put(key, jsonEncode(value));
  }

  List<dynamic>? getList(String key) {
    final data = _box.get(key);
    if (data != null && data is String) {
      try {
        return jsonDecode(data) as List<dynamic>;
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  // Delete operations
  Future<void> delete(String key) async {
    await _box.delete(key);
  }

  Future<void> clear() async {
    await _box.clear();
  }

  // Check if key exists
  bool hasKey(String key) {
    return _box.containsKey(key);
  }
}

final localStorageProvider = Provider<LocalStorage>((ref) {
  return LocalStorage();
});
