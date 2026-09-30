package com.dokterdibya.assistantdaf.monitor;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private TextView status;
    private MonitorClient client;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        client = new MonitorClient(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(36, 48, 36, 36);
        TextView title = new TextView(this);
        title.setText("Asisten DAF · Ponsel pendamping");
        title.setTextSize(23);
        layout.addView(title);
        TextView explanation = new TextView(this);
        explanation.setText("Perangkat ini membaca pemberitahuan WhatsApp Business. Hanya isi chat yang Dokter pilih di PWA dapat dikirim untuk dibuat usulan. Pesan yang tidak muncul sebagai pemberitahuan mungkin terlewat.");
        explanation.setTextSize(16);
        layout.addView(explanation);
        status = new TextView(this);
        status.setText(client.isPaired() ? "Sudah dipasangkan. Periksa izin pemberitahuan dan pilihan chat di PWA." : "Belum dipasangkan.");
        status.setTextSize(17);
        layout.addView(status);
        EditText code = new EditText(this);
        code.setHint("Kode dari tab Pemantauan di Asisten DAF");
        code.setSingleLine(true);
        layout.addView(code, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        Button pair = new Button(this);
        pair.setText("Pasangkan ponsel");
        layout.addView(pair);
        pair.setOnClickListener(view -> {
            String value = code.getText().toString().trim();
            if (!value.matches("[A-Za-z0-9_-]{12}")) { status.setText("Kode harus 12 karakter."); return; }
            pair.setEnabled(false); status.setText("Menghubungkan…");
            worker.execute(() -> {
                String result;
                try { client.pair(value); result = "Ponsel terpasang. Aktifkan akses pemberitahuan di bawah, lalu pilih chat di PWA."; }
                catch (Exception error) { result = "Pemasangan gagal. Periksa kode, internet, dan status server."; }
                String visible = result;
                runOnUiThread(() -> { status.setText(visible); pair.setEnabled(true); code.setText(""); });
            });
        });
        Button settings = new Button(this);
        settings.setText("Buka izin akses pemberitahuan");
        layout.addView(settings);
        settings.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        Button check = new Button(this);
        check.setText("Periksa koneksi sekarang");
        layout.addView(check);
        check.setOnClickListener(view -> worker.execute(() -> {
            String result;
            try { client.flush(); result = "Koneksi berhasil. Lihat chat yang ditemukan di tab Pemantauan PWA."; }
            catch (Exception error) { result = "Koneksi belum tersedia. Periksa internet dan pemasangan."; }
            String visible = result;
            runOnUiThread(() -> status.setText(visible));
        }));
        setContentView(layout);
    }

    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
