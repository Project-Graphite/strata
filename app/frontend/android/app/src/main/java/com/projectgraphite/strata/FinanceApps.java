package com.projectgraphite.strata;

import android.content.Context;
import android.content.pm.PackageManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class FinanceApps {
    public static final class App {
        public final String packageName;
        public final String label;
        public final String group;

        App(String packageName, String label, String group) {
            this.packageName = packageName;
            this.label = label;
            this.group = group;
        }
    }

    private static final Map<String, App> KNOWN = byPackage(
        new App("com.cibeg.ddc1.digitalbanking.live", "CIB", "Banks"),
        new App("com.ofss.obdx.and.nbe.com.eg", "NBE", "Banks"),
        new App("com.BanqueMisr.MobileBanking", "Banque Misr", "Banks"),
        new App("eg.com.qnb.eazymobile", "QNB", "Banks"),
        new App("com.ADIBEgyptPhone", "ADIB", "Banks"),
        new App("com.htsu.hsbcpersonalbanking", "HSBC", "Banks"),
        new App("com.aaib", "AAIB", "Banks"),
        new App("com.bdc.eg.mobile", "Banque du Caire", "Banks"),
        new App("hr.asseco.android.intesa.isbd.mbanking.alex", "Alex Bank", "Banks"),
        new App("enbd.mobilebanking.egyptmobile", "Emirates NBD", "Banks"),
        new App("com.emeint.android.myservices", "Vodafone Cash", "Wallets"),
        new App("com.etisalat.flous", "Etisalat Cash", "Wallets"),
        new App("com.orange.mobinilandme", "Orange Cash", "Wallets"),
        new App("com.TE.WEWallet", "WE Pay", "Wallets"),
        new App("com.emeint.android.mwallet", "NBE PhoneCash", "Wallets"),
        new App("com.egyptianbanks.instapay", "InstaPay", "Wallets"),
        new App("io.telda.app", "Telda", "Wallets"),
        new App("com.nsave.app", "nSave", "Wallets"),
        new App("com.fawry.myfawry", "Fawry", "Apps"),
        new App("com.amansuperapp", "Aman", "Apps"),
        new App("com.paypal.android.p2pmobile", "PayPal", "Apps"),
        new App("com.payoneer.android", "Payoneer", "Apps"),
        new App("com.efgh.customer", "valU", "Apps"),
        new App("com.sympl", "Sympl", "Apps"),
        new App("com.project.imperialcreation.khaznaproject", "Khazna", "Apps")
    );

    private FinanceApps() {}

    private static Map<String, App> byPackage(App... apps) {
        Map<String, App> map = new LinkedHashMap<>();
        for (App app : apps) map.put(app.packageName, app);
        return map;
    }

    public static App find(String packageName) {
        return KNOWN.get(packageName);
    }

    public static List<App> installed(Context context) {
        PackageManager packages = context.getPackageManager();
        List<App> installed = new ArrayList<>();
        for (App app : KNOWN.values()) {
            try {
                packages.getApplicationInfo(app.packageName, 0);
                installed.add(app);
            } catch (PackageManager.NameNotFoundException notInstalled) {
                continue;
            }
        }
        return installed;
    }
}
