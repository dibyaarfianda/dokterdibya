// Basic widget test for dokterDIBYA Staff app

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:flutter_admin/main.dart';

void main() {
  testWidgets('App should load login screen', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(
      const ProviderScope(
        child: DokterDibyaStaffApp(),
      ),
    );

    // Wait for the app to settle
    await tester.pumpAndSettle();

    // Verify that login screen elements are present
    expect(find.text('dokterDIBYA Staff'), findsAny);
  });
}
