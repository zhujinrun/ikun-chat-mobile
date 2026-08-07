package com.ikunshare.chat.mobile.utils;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 崩溃只落盘、不弹窗。
 * - last_crash_report.txt：最近一次
 * - crash_history.log：追加历史（便于多次复现）
 * 优先写到 externalFilesDir，方便 adb pull：
 *   adb pull /sdcard/Android/data/com.ikunshare.chat.mobile/files/last_crash_report.txt
 */
public final class CrashReporter {
  private static final String TAG = "IkunCrash";
  private static final String LAST_FILE = "last_crash_report.txt";
  private static final String HISTORY_FILE = "crash_history.log";
  private static final int MAX_LEN = 12000;
  private static final int HISTORY_MAX = 200000;

  private CrashReporter() {}

  public static void install(Context context) {
    final Context app = context.getApplicationContext();
    final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
      @Override
      public void uncaughtException(Thread thread, Throwable throwable) {
        try {
          write(app, "JAVA", thread != null ? thread.getName() : "?", throwable);
        } catch (Throwable t) {
          Log.e(TAG, "failed to write crash report", t);
        }
        if (previous != null) {
          previous.uncaughtException(thread, throwable);
        } else {
          System.exit(2);
        }
      }
    });
  }

  /** 日志目录：优先外部应用私有目录（可 adb pull，无需 root） */
  public static File getLogDir(Context context) {
    File ext = null;
    try {
      ext = context.getExternalFilesDir(null);
    } catch (Throwable ignored) {
    }
    if (ext != null) {
      //noinspection ResultOfMethodCallIgnored
      ext.mkdirs();
      return ext;
    }
    return context.getFilesDir();
  }

  public static String getLastReportPath(Context context) {
    return new File(getLogDir(context), LAST_FILE).getAbsolutePath();
  }

  public static String getHistoryPath(Context context) {
    return new File(getLogDir(context), HISTORY_FILE).getAbsolutePath();
  }

  public static void write(Context context, String kind, String where, Throwable throwable) {
    StringWriter sw = new StringWriter();
    if (throwable != null) {
      throwable.printStackTrace(new PrintWriter(sw));
    }
    writeRaw(context, kind, where, sw.toString());
  }

  public static void writeRaw(Context context, String kind, String where, String body) {
    try {
      String time = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
      String report =
        "time: " + time + "\n"
          + "kind: " + (kind != null ? kind : "") + "\n"
          + "where: " + (where != null ? where : "") + "\n\n"
          + (body != null ? body : "");
      if (report.length() > MAX_LEN) {
        report = report.substring(0, MAX_LEN) + "\n...[truncated]";
      }

      File dir = getLogDir(context);
      File last = new File(dir, LAST_FILE);
      File history = new File(dir, HISTORY_FILE);

      byte[] bytes = report.getBytes(StandardCharsets.UTF_8);
      try (FileOutputStream fos = new FileOutputStream(last, false)) {
        fos.write(bytes);
        fos.flush();
      }

      // 追加历史，简单限长：过大则截断重写末尾
      try {
        if (history.exists() && history.length() > HISTORY_MAX) {
          //noinspection ResultOfMethodCallIgnored
          history.delete();
        }
        try (FileOutputStream fos = new FileOutputStream(history, true)) {
          fos.write("\n========\n".getBytes(StandardCharsets.UTF_8));
          fos.write(bytes);
          fos.write('\n');
          fos.flush();
        }
      } catch (Throwable histErr) {
        Log.e(TAG, "history append failed", histErr);
      }

      Log.e(TAG, "crash report saved: " + last.getAbsolutePath());
      Log.e(TAG, "crash history: " + history.getAbsolutePath());
    } catch (Throwable t) {
      Log.e(TAG, "writeRaw failed", t);
    }
  }

  public static String read(Context context) {
    // 先 external，再 internal（兼容旧路径）
    String fromExt = readFile(new File(getLogDir(context), LAST_FILE));
    if (fromExt != null) return fromExt;
    return readFile(new File(context.getFilesDir(), LAST_FILE));
  }

  private static String readFile(File file) {
    if (file == null || !file.isFile() || file.length() == 0) return null;
    try (FileInputStream fis = new FileInputStream(file)) {
      byte[] buf = new byte[(int) Math.min(file.length(), MAX_LEN)];
      int n = fis.read(buf);
      if (n <= 0) return null;
      return new String(buf, 0, n, StandardCharsets.UTF_8);
    } catch (Throwable t) {
      Log.e(TAG, "read failed", t);
      return null;
    }
  }

  public static void clear(Context context) {
    try {
      File a = new File(getLogDir(context), LAST_FILE);
      File b = new File(context.getFilesDir(), LAST_FILE);
      if (a.exists()) {
        //noinspection ResultOfMethodCallIgnored
        a.delete();
      }
      if (b.exists()) {
        //noinspection ResultOfMethodCallIgnored
        b.delete();
      }
    } catch (Throwable t) {
      Log.e(TAG, "clear failed", t);
    }
  }
}
