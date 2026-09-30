package com.dokterdibya.assistantdaf.monitor;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MonitorJob extends JobService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override public boolean onStartJob(JobParameters params) {
        worker.execute(() -> {
            try { new MonitorClient(this).flush(); }
            catch (Exception ignored) { /* Retry at the next scheduled interval. */ }
            finally { jobFinished(params, false); }
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
