package com.projectgraphite.strata;

import android.app.Activity;
import android.content.Context;
import org.json.JSONException;

public final class InboxBackfill {
    public static final boolean AVAILABLE = false;

    private InboxBackfill() {}

    public static boolean granted(Context context) {
        return false;
    }

    public static void requestAccess(Activity activity) {
        throw new UnsupportedOperationException("Reading the SMS inbox is only in the side-loaded app");
    }

    public static int[] run(Context context) throws JSONException {
        throw new UnsupportedOperationException("Reading the SMS inbox is only in the side-loaded app");
    }
}
