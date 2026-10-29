package com.projectgraphite.strata;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

public class CaptureUploadWorker extends Worker {
    private static final String WORK_NAME = "strata-capture-upload";

    public CaptureUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        return CaptureForwarder.flushOutbox(getApplicationContext()).retry ? Result.retry() : Result.success();
    }

    public static void schedule(Context context) {
        if (CaptureForwarder.getOutboxCounts(context)[0] == 0) return;
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CaptureUploadWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
    }
}
