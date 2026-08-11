package com.ikunshare.chat.mobile.utils;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Rect;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.app.LocaleManagerCompat;
import androidx.core.content.FileProvider;
import androidx.core.os.LocaleListCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class UtilsModule extends ReactContextBaseJavaModule {
  private static final int PICK_FILES_REQUEST = 8301;
  private static final int MAX_EXTRACTED_TEXT_CHARS = 120000;

  private final ReactApplicationContext reactContext;
  private Promise pickFilesPromise;
  private long pickFilesMaxBytes = 0;

  private int listenerCount = 0;

  UtilsEvent utilsEvent;

  private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
      if (requestCode != PICK_FILES_REQUEST) return;
      handlePickFilesResult(resultCode, data);
    }
  };

  UtilsModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    utilsEvent = new UtilsEvent(reactContext);
    reactContext.addActivityEventListener(activityEventListener);
    registerScreenBroadcastReceiver();
  }

  @Override
  public void invalidate() {
    reactContext.removeActivityEventListener(activityEventListener);
    super.invalidate();
  }

  @Override
  public String getName() {
    return "UtilsModule";
  }

  /** 读取上次原生/JS 落盘的崩溃报告（无则 null） */
  @ReactMethod
  public void getLastCrashReport(Promise promise) {
    try {
      String report = CrashReporter.read(reactContext);
      promise.resolve(report);
    } catch (Exception e) {
      promise.reject("CRASH_READ", e);
    }
  }

  @ReactMethod
  public void getCrashLogPath(Promise promise) {
    try {
      promise.resolve(CrashReporter.getLastReportPath(reactContext));
    } catch (Exception e) {
      promise.reject("CRASH_PATH", e);
    }
  }

  @ReactMethod
  public void clearLastCrashReport(Promise promise) {
    try {
      CrashReporter.clear(reactContext);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("CRASH_CLEAR", e);
    }
  }

  /** 异步写入（一般业务用） */
  @ReactMethod
  public void writeCrashReport(String kind, String where, String body, Promise promise) {
    try {
      CrashReporter.writeRaw(reactContext, kind != null ? kind : "JS", where, body);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("CRASH_WRITE", e);
    }
  }

  /**
   * 同步写入：JS fatal 时 bridge 可能马上断，Promise 来不及回调。
   * 必须用 blocking sync 才能尽量落盘成功。
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean writeCrashReportSync(String kind, String where, String body) {
    try {
      CrashReporter.writeRaw(reactContext, kind != null ? kind : "JS", where, body);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  @ReactMethod
  public void addListener(String eventName) {
    if (listenerCount == 0) {
      // Set up any upstream listeners or background tasks as necessary
    }

    listenerCount += 1;
  }

  @ReactMethod
  public void removeListeners(Integer count) {
    listenerCount -= count;
    if (listenerCount == 0) {
      // Remove upstream listeners, stop unnecessary background tasks
    }
  }

  private void registerScreenBroadcastReceiver() {
    final IntentFilter theFilter = new IntentFilter();
    /** System Defined Broadcast */
    theFilter.addAction(Intent.ACTION_SCREEN_ON);
    theFilter.addAction(Intent.ACTION_SCREEN_OFF);

    BroadcastReceiver screenOnOffReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        String strAction = intent.getAction();

        WritableMap params = Arguments.createMap();

        switch (Objects.requireNonNull(strAction)) {
          case Intent.ACTION_SCREEN_OFF:

            params.putString("state", "OFF");
            utilsEvent.sendEvent(utilsEvent.SCREEN_STATE, params);
            break;
          case Intent.ACTION_SCREEN_ON:
            params.putString("state", "ON");
            utilsEvent.sendEvent(utilsEvent.SCREEN_STATE, params);
            break;
        }
      }
    };

    reactContext.registerReceiver(screenOnOffReceiver, theFilter);
  }

  @ReactMethod
  public void exitApp() {
    // https://github.com/wumke/react-native-exit-app/blob/master/android/src/main/java/com/github/wumke/RNExitApp/RNExitAppModule.java
    // android.os.Process.killProcess(android.os.Process.myPid());

    // https://stackoverflow.com/questions/6330200/how-to-quit-android-application-programmatically
    Activity currentActivity = reactContext.getCurrentActivity();
    Log.d("Utils", "Exit app...");
    if (currentActivity == null) {
      Log.d("Utils", "killProcess");
      android.os.Process.killProcess(android.os.Process.myPid());
    } else {
      currentActivity.finishAndRemoveTask();
      System.exit(0);
    }
  }

  @ReactMethod
  public void getSupportedAbis(Promise promise) {
    // https://github.com/react-native-device-info/react-native-device-info/blob/ff8f672cb08fa39a887567d6e23e2f08778e8340/android/src/main/java/com/learnium/RNDeviceInfo/RNDeviceModule.java#L877
    WritableArray array = new WritableNativeArray();
    for (String abi : Build.SUPPORTED_ABIS) {
      array.pushString(abi);
    }
    promise.resolve(array);
  }

  @ReactMethod
  public void installApk(String filePath, String fileProviderAuthority, Promise promise) {
    // https://github.com/mikehardy/react-native-update-apk/blob/master/android/src/main/java/net/mikehardy/rnupdateapk/RNUpdateAPK.java
    File file = new File(filePath);
    if (!file.exists()) {
      Log.e("Utils", "installApk: file doe snot exist '" + filePath + "'");
      // FIXME this should take a promise and fail it
      promise.reject("Utils", "installApk: file doe snot exist '" + filePath + "'");
      return;
    }

    if (Build.VERSION.SDK_INT >= 24) {
      // API24 and up has a package installer that can handle FileProvider content:// URIs
      Uri contentUri;
      try {
        contentUri = FileProvider.getUriForFile(getReactApplicationContext(), fileProviderAuthority, file);
      } catch (Exception e) {
        // FIXME should be a Promise.reject really
        Log.e("Utils", "installApk exception with authority name '" + fileProviderAuthority + "'", e);
        promise.reject("Utils", "installApk exception with authority name '" + fileProviderAuthority + "'");
        return;
        // throw e;
      }
      Intent installApp = new Intent(Intent.ACTION_INSTALL_PACKAGE);
      installApp.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      installApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      installApp.setData(contentUri);
      installApp.putExtra(Intent.EXTRA_INSTALLER_PACKAGE_NAME, reactContext.getApplicationInfo().packageName);
      reactContext.startActivity(installApp);
      promise.resolve(null);
    } else {
      // Old APIs do not handle content:// URIs, so use an old file:// style
      String cmd = "chmod 777 " + file;
      try {
        Runtime.getRuntime().exec(cmd);
      } catch (Exception e) {
        // e.printStackTrace();
        Log.e("Utils", "installApk exception : " + e.getMessage(), e);
        promise.reject("Utils", e.getMessage());
      }
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      intent.setDataAndType(Uri.parse("file://" + file), "application/vnd.android.package-archive");
      reactContext.startActivity(intent);
      promise.resolve(null);
    }
  }

  @ReactMethod
  public void screenkeepAwake() {
    // https://github.com/corbt/react-native-keep-awake/blob/master/android/src/main/java/com/corbt/keepawake/KCKeepAwake.java
    final Activity activity = getCurrentActivity();

    if (activity != null) {
      activity.runOnUiThread(() -> {
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      });
    }
  }

  @ReactMethod
  public void screenUnkeepAwake() {
    // https://github.com/corbt/react-native-keep-awake/blob/master/android/src/main/java/com/corbt/keepawake/KCKeepAwake.java
    final Activity activity = getCurrentActivity();

    if (activity != null) {
      activity.runOnUiThread(() -> {
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      });
    }
  }

  /**
   * 将图片（file:// 或 content:// 或 data: 地址）写入系统剪贴板，便于粘贴到其他应用。
   * Android 10+ 走 MediaStore（无需权限，不落可见文件目录之外）；
   * Android 9- 走 FileProvider + prepareToLeaveContext。
   */
  @ReactMethod
  public void copyImageToClipboard(String uriStr, Promise promise) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "图片地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取图片失败");
          return;
        }
        String mime = detectImageMime(bytes);
        String ext = mime.contains("png") ? ".png" : mime.contains("webp") ? ".webp" : ".jpg";

        Uri clipUri = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          clipUri = insertToMediaStore(bytes, mime, ext);
        }
        ClipData clip = null;
        if (clipUri == null) {
          clipUri = writeToCacheFile(bytes, mime, ext);
          if (clipUri != null) {
            clip = ClipData.newUri(reactContext.getContentResolver(), "image", clipUri);
            // 让剪贴板粘贴方在离开本应用时也能读取临时授权（反射调用，低版本 SDK 无则跳过）
            grantClipReadPermission(clip);
          }
        } else {
          clip = ClipData.newUri(reactContext.getContentResolver(), "image", clipUri);
        }

        if (clip == null) {
          promise.reject("WRITE_FAILED", "写入剪贴板失败");
          return;
        }
        ClipboardManager clipboard =
          (ClipboardManager) reactContext.getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(clip);
        promise.resolve(true);
      } catch (Exception e) {
        Log.e("Utils", "copyImageToClipboard error", e);
        promise.reject("COPY_IMAGE", e.getMessage() != null ? e.getMessage() : "复制失败");
      }
    }).start();
  }

  /**
   * 把图片（file:// / content:// / data:）拷贝到应用内部 cache/attachments 目录，返回绝对路径。
   * 消息只保存该 file:// 路径与元数据，不再把 base64 一并写入 AsyncStorage。
   */
  @ReactMethod
  public void cacheImageTo(String uriStr, Promise promise) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "图片地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取图片失败");
          return;
        }
        String mime = detectImageMime(bytes);
        String ext = mime.contains("png") ? ".png" : mime.contains("webp") ? ".webp" : ".jpg";
        File dir = new File(reactContext.getCacheDir(), "attachments");
        if (!dir.exists() && !dir.mkdirs()) {
          promise.reject("MKDIR_FAILED", "无法创建缓存目录");
          return;
        }
        File file = new File(
          dir,
          "image_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 100000) + ext
        );
        FileOutputStream fos = new FileOutputStream(file);
        fos.write(bytes);
        fos.flush();
        fos.close();
        promise.resolve(file.getAbsolutePath());
      } catch (Exception e) {
        Log.e("Utils", "cacheImageTo error", e);
        promise.reject("CACHE_IMAGE", e.getMessage() != null ? e.getMessage() : "缓存失败");
      }
    }).start();
  }

  /** 打开系统文件选择器，选择任意可打开文件并复制到应用内部 cache/attachments 目录。 */
  @ReactMethod
  public void pickFiles(ReadableArray mimeTypes, double maxBytes, Promise promise) {
    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      promise.reject("NO_ACTIVITY", "当前无法打开文件选择器");
      return;
    }
    if (pickFilesPromise != null) {
      promise.reject("PICKER_BUSY", "文件选择器正在打开");
      return;
    }
    try {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("*/*");
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
      if (mimeTypes != null && mimeTypes.size() > 0) {
        String[] types = new String[mimeTypes.size()];
        for (int i = 0; i < mimeTypes.size(); i++) {
          types[i] = mimeTypes.getString(i);
        }
        intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
      }
      pickFilesPromise = promise;
      pickFilesMaxBytes = Math.max(1, (long) maxBytes);
      currentActivity.startActivityForResult(
        Intent.createChooser(intent, "选择文件"),
        PICK_FILES_REQUEST
      );
    } catch (Exception e) {
      pickFilesPromise = null;
      promise.reject("PICK_FILES", e.getMessage() != null ? e.getMessage() : "打开文件选择器失败");
    }
  }

  private void handlePickFilesResult(int resultCode, Intent data) {
    Promise promise = pickFilesPromise;
    long maxBytes = pickFilesMaxBytes;
    pickFilesPromise = null;
    pickFilesMaxBytes = 0;
    if (promise == null) return;

    if (resultCode != Activity.RESULT_OK || data == null) {
      WritableMap result = Arguments.createMap();
      result.putBoolean("didCancel", true);
      result.putArray("files", Arguments.createArray());
      result.putArray("skipped", Arguments.createArray());
      promise.resolve(result);
      return;
    }

    new Thread(() -> {
      WritableArray files = Arguments.createArray();
      WritableArray skipped = Arguments.createArray();
      try {
        ClipData clipData = data.getClipData();
        if (clipData != null) {
          for (int i = 0; i < clipData.getItemCount(); i++) {
            cachePickedFile(clipData.getItemAt(i).getUri(), maxBytes, files, skipped);
          }
        } else if (data.getData() != null) {
          cachePickedFile(data.getData(), maxBytes, files, skipped);
        }
        WritableMap result = Arguments.createMap();
        result.putBoolean("didCancel", false);
        result.putArray("files", files);
        result.putArray("skipped", skipped);
        promise.resolve(result);
      } catch (Exception e) {
        Log.e("Utils", "pickFiles result error", e);
        promise.reject("PICK_FILES", e.getMessage() != null ? e.getMessage() : "读取文件失败");
      }
    }).start();
  }

  private void cachePickedFile(
    Uri uri,
    long maxBytes,
    WritableArray files,
    WritableArray skipped
  ) {
    if (uri == null) {
      skipped.pushMap(buildSkippedFile("文件", 0, "unreadable"));
      return;
    }
    String name = queryDisplayName(uri);
    long declaredSize = queryFileSize(uri);
    String mime = reactContext.getContentResolver().getType(uri);
    if (mime == null || mime.isEmpty()) mime = guessMimeFromName(name);

    if (declaredSize > maxBytes) {
      skipped.pushMap(buildSkippedFile(name, declaredSize, "tooLarge"));
      return;
    }

    File outFile = null;
    try {
      File dir = new File(reactContext.getCacheDir(), "attachments");
      if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建缓存目录");
      String safeName = sanitizeFileName(name);
      outFile = new File(
        dir,
        "file_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 100000) + "_" + safeName
      );
      InputStream input = reactContext.getContentResolver().openInputStream(uri);
      if (input == null) throw new Exception("无法读取文件");
      FileOutputStream output = new FileOutputStream(outFile);
      byte[] chunk = new byte[8192];
      long total = 0;
      int read;
      while ((read = input.read(chunk)) != -1) {
        total += read;
        if (total > maxBytes) {
          input.close();
          output.close();
          if (outFile.exists()) outFile.delete();
          skipped.pushMap(buildSkippedFile(name, total, "tooLarge"));
          return;
        }
        output.write(chunk, 0, read);
      }
      input.close();
      output.flush();
      output.close();

      WritableMap file = Arguments.createMap();
      file.putString("uri", "file://" + outFile.getAbsolutePath());
      file.putString("name", safeName);
      file.putString("mimeType", mime);
      file.putDouble("size", total);
      files.pushMap(file);
    } catch (Exception e) {
      if (outFile != null && outFile.exists()) outFile.delete();
      skipped.pushMap(buildSkippedFile(name, Math.max(0, declaredSize), "unreadable"));
    }
  }

  @ReactMethod
  public void readTextFile(String uriStr, double maxBytes, Promise promise) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "文件地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr), Math.max(1, (long) maxBytes));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取文件失败");
          return;
        }
        String text = new String(bytes, StandardCharsets.UTF_8);
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        promise.resolve(text);
      } catch (Exception e) {
        Log.e("Utils", "readTextFile error", e);
        promise.reject("READ_FILE", e.getMessage() != null ? e.getMessage() : "读取文件失败");
      }
    }).start();
  }

  @ReactMethod
  public void readFileDataUrl(String uriStr, String mimeType, double maxBytes, Promise promise) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "文件地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr), Math.max(1, (long) maxBytes));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取文件失败");
          return;
        }
        String safeMime =
          mimeType != null && !mimeType.trim().isEmpty()
            ? mimeType.trim()
            : "application/octet-stream";
        String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
        promise.resolve("data:" + safeMime + ";base64," + base64);
      } catch (Exception e) {
        Log.e("Utils", "readFileDataUrl error", e);
        promise.reject("READ_FILE", e.getMessage() != null ? e.getMessage() : "读取文件失败");
      }
    }).start();
  }

  @ReactMethod
  public void extractFileText(
    String uriStr,
    String mimeType,
    String name,
    double maxBytes,
    Promise promise
  ) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "文件地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr), Math.max(1, (long) maxBytes));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取文件失败");
          return;
        }
        String text = extractReadableText(bytes, mimeType, name);
        if (text == null || text.trim().isEmpty()) {
          promise.reject("EXTRACT_EMPTY", "未提取到可读内容");
          return;
        }
        promise.resolve(limitExtractedText(text));
      } catch (Exception e) {
        Log.e("Utils", "extractFileText error", e);
        promise.reject("EXTRACT_FILE", e.getMessage() != null ? e.getMessage() : "提取文件内容失败");
      }
    }).start();
  }

  /**
   * 读取本地图片并返回 data: dataUrl（仅在发送/重发请求时临时生成，不落盘）。
   */
  @ReactMethod
  public void readImageDataUrl(String uriStr, Promise promise) {
    new Thread(() -> {
      try {
        if (uriStr == null || uriStr.isEmpty()) {
          promise.reject("EMPTY_URI", "图片地址为空");
          return;
        }
        byte[] bytes = readUri(Uri.parse(uriStr));
        if (bytes == null || bytes.length == 0) {
          promise.reject("READ_FAILED", "读取图片失败");
          return;
        }
        String mime = detectImageMime(bytes);
        String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
        promise.resolve("data:" + mime + ";base64," + base64);
      } catch (Exception e) {
        Log.e("Utils", "readImageDataUrl error", e);
        promise.reject("READ_IMAGE", e.getMessage() != null ? e.getMessage() : "读取图片失败");
      }
    }).start();
  }

  /** 尽力删除 file:// 本地缓存图片（消息/附件删除后的引用清理，失败忽略） */
  @ReactMethod
  public void deleteFiles(ReadableArray uris, Promise promise) {
    new Thread(() -> {
      int deleted = 0;
      if (uris != null) {
        for (int i = 0; i < uris.size(); i++) {
          try {
            String s = uris.getString(i);
            if (s == null || s.isEmpty()) continue;
            Uri uri = Uri.parse(s);
            if (!"file".equalsIgnoreCase(uri.getScheme())) continue;
            String path = uri.getPath();
            if (path == null || path.isEmpty()) continue;
            File f = new File(path);
            if (!isManagedAttachmentFile(f)) continue;
            if (f.exists() && f.delete()) deleted++;
          } catch (Exception ignored) {
            // 尽力删除，失败忽略
          }
        }
      }
      promise.resolve(deleted);
    }).start();
  }

  private boolean isManagedAttachmentFile(File file) throws Exception {
    File dir = new File(reactContext.getCacheDir(), "attachments").getCanonicalFile();
    File target = file.getCanonicalFile();
    String dirPath = dir.getPath();
    String targetPath = target.getPath();
    return targetPath.startsWith(dirPath + File.separator);
  }

  private byte[] readUri(Uri uri) throws Exception {
    return readUri(uri, Long.MAX_VALUE);
  }

  private byte[] readUri(Uri uri, long maxBytes) throws Exception {
    String scheme = uri.getScheme();
    if ("data".equalsIgnoreCase(scheme)) {
      String whole = uri.toString();
      int comma = whole.indexOf(',');
      if (comma < 0) throw new Exception("无法读取图片数据");
      String meta = whole.substring(5, comma);
      String body = whole.substring(comma + 1);
      byte[] data;
      if (meta.contains(";base64")) {
        data = android.util.Base64.decode(body, android.util.Base64.DEFAULT);
      } else {
        data = java.net.URLDecoder.decode(body, "UTF-8").getBytes("UTF-8");
      }
      if (data.length > maxBytes) throw new Exception("文件超过大小限制");
      return data;
    }
    InputStream input = reactContext.getContentResolver().openInputStream(uri);
    if (input == null) throw new Exception("无法读取文件地址");
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    long total = 0;
    while ((read = input.read(chunk)) != -1) {
      total += read;
      if (total > maxBytes) {
        input.close();
        throw new Exception("文件超过大小限制");
      }
      buf.write(chunk, 0, read);
    }
    input.close();
    return buf.toByteArray();
  }

  private WritableMap buildSkippedFile(String name, long size, String reason) {
    WritableMap item = Arguments.createMap();
    item.putString("name", name != null && !name.isEmpty() ? name : "文件");
    item.putDouble("size", Math.max(0, size));
    item.putString("reason", reason);
    return item;
  }

  private String queryDisplayName(Uri uri) {
    try (Cursor cursor = reactContext.getContentResolver().query(uri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (index >= 0) {
          String name = cursor.getString(index);
          if (name != null && !name.trim().isEmpty()) return name.trim();
        }
      }
    } catch (Exception ignored) {
      // ignore
    }
    String path = uri.getLastPathSegment();
    if (path == null || path.trim().isEmpty()) return "file.txt";
    int slash = path.lastIndexOf('/');
    return slash >= 0 ? path.substring(slash + 1) : path;
  }

  private long queryFileSize(Uri uri) {
    try (Cursor cursor = reactContext.getContentResolver().query(uri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.SIZE);
        if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index);
      }
    } catch (Exception ignored) {
      // ignore
    }
    return -1;
  }

  private String sanitizeFileName(String raw) {
    String name = raw == null || raw.trim().isEmpty() ? "file.txt" : raw.trim();
    name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "_");
    if (name.length() > 80) name = name.substring(name.length() - 80);
    return name.isEmpty() ? "file.txt" : name;
  }

  private String guessMimeFromName(String name) {
    String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".doc")) return "application/msword";
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
    if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
    if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (lower.endsWith(".zip")) return "application/zip";
    if (lower.endsWith(".gz")) return "application/gzip";
    if (lower.endsWith(".tar")) return "application/x-tar";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
    if (lower.endsWith(".xml")) return "application/xml";
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "application/yaml";
    if (
      lower.endsWith(".txt") ||
      lower.endsWith(".log") ||
      lower.endsWith(".properties") ||
      lower.endsWith(".env")
    ) {
      return "text/plain";
    }
    return "application/octet-stream";
  }

  private String extractReadableText(byte[] bytes, String mimeType, String name) throws Exception {
    String ext = getFileExtension(name);
    String mime = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT);
    if (isZipFile(bytes)) {
      if ("xlsx".equals(ext) || mime.contains("spreadsheetml")) return extractXlsxText(bytes);
      if ("docx".equals(ext) || mime.contains("wordprocessingml")) return extractDocxText(bytes);
      if ("pptx".equals(ext) || mime.contains("presentationml")) return extractPptxText(bytes);
    }

    String decoded = decodeLikelyText(bytes);
    if (decoded != null && isReadableText(decoded)) {
      if ("xls".equals(ext) || mime.contains("ms-excel")) {
        String legacyExcelText = extractLegacyExcelText(decoded);
        if (legacyExcelText != null && !legacyExcelText.trim().isEmpty()) return legacyExcelText;
      }
      if (looksLikeHtml(decoded)) return htmlToText(decoded);
      return decoded.trim();
    }

    if ("xls".equals(ext) || mime.contains("ms-excel")) {
      String binaryText = extractBinaryStrings(bytes);
      if (binaryText != null && !binaryText.trim().isEmpty()) return binaryText;
    }
    return null;
  }

  private String getFileExtension(String name) {
    String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
    int dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.substring(dot + 1) : "";
  }

  private boolean isZipFile(byte[] bytes) {
    return bytes.length >= 4 &&
      bytes[0] == (byte) 0x50 &&
      bytes[1] == (byte) 0x4B &&
      bytes[2] == (byte) 0x03 &&
      bytes[3] == (byte) 0x04;
  }

  private String decodeLikelyText(byte[] bytes) {
    if (bytes.length >= 2) {
      if (bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xFE) {
        return new String(bytes, 2, bytes.length - 2, Charset.forName("UTF-16LE"));
      }
      if (bytes[0] == (byte) 0xFE && bytes[1] == (byte) 0xFF) {
        return new String(bytes, 2, bytes.length - 2, Charset.forName("UTF-16BE"));
      }
    }
    String utf8 = new String(bytes, StandardCharsets.UTF_8);
    if (isReadableText(utf8)) return stripBom(utf8);
    try {
      String gb = new String(bytes, Charset.forName("GB18030"));
      if (isReadableText(gb)) return stripBom(gb);
    } catch (Exception ignored) {
      // ignore
    }
    return null;
  }

  private String stripBom(String text) {
    return text != null && text.startsWith("\uFEFF") ? text.substring(1) : text;
  }

  private boolean isReadableText(String text) {
    if (text == null || text.trim().isEmpty()) return false;
    int bad = 0;
    int useful = 0;
    int total = Math.min(text.length(), 4000);
    for (int i = 0; i < total; i++) {
      char c = text.charAt(i);
      if (c == '\uFFFD' || (Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')) {
        bad++;
      } else if (!Character.isWhitespace(c)) {
        useful++;
      }
    }
    return useful >= 4 && bad <= Math.max(4, total / 50);
  }

  private boolean looksLikeHtml(String text) {
    String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);
    return lower.contains("<html") || lower.contains("<table") || lower.contains("<tr") || lower.contains("<td");
  }

  private String extractLegacyExcelText(String text) {
    if (text == null || text.trim().isEmpty()) return "";
    if (looksLikeHtml(text)) return htmlToText(text);
    String spreadsheetText = spreadsheetXmlToText(text);
    if (spreadsheetText != null && !spreadsheetText.trim().isEmpty()) return spreadsheetText;
    return text.trim();
  }

  private String htmlToText(String html) {
    String text = html == null ? "" : html;
    text = text.replaceAll("(?is)<script[^>]*>.*?</script>", " ");
    text = text.replaceAll("(?is)<style[^>]*>.*?</style>", " ");
    List<String> rows = new ArrayList<>();
    Matcher rowMatcher = Pattern.compile("(?is)<tr\\b[^>]*>(.*?)</tr>").matcher(text);
    while (rowMatcher.find()) {
      List<String> cells = new ArrayList<>();
      Matcher cellMatcher = Pattern.compile("(?is)<t[dh]\\b[^>]*>(.*?)</t[dh]>").matcher(rowMatcher.group(1));
      while (cellMatcher.find()) {
        cells.add(normalizeExtractedCellText(cellMatcher.group(1)));
      }
      trimTrailingEmpty(cells);
      if (!cells.isEmpty()) rows.add(joinTabs(cells));
    }
    if (!rows.isEmpty()) return joinLines(rows).trim();

    text = text.replaceAll("(?i)</t[dh]\\s*>", "\t");
    text = text.replaceAll("(?i)</tr\\s*>", "\n");
    text = text.replaceAll("(?i)<br\\s*/?>", "\n");
    text = text.replaceAll("(?is)<[^>]+>", " ");
    text = unescapeXml(text);
    text = text.replaceAll("[ \\x0B\\f\\r]+", " ");
    text = text.replaceAll("\\t\\s+", "\t");
    text = text.replaceAll("\\s+\\n", "\n");
    text = text.replaceAll("\\n{3,}", "\n\n");
    return text.trim();
  }

  private String spreadsheetXmlToText(String xml) {
    String raw = xml == null ? "" : xml;
    List<String> sheets = new ArrayList<>();
    Matcher sheetMatcher = Pattern
      .compile("(?is)<(?:[\\w]+:)?Worksheet\\b([^>]*)>(.*?)</(?:[\\w]+:)?Worksheet>")
      .matcher(raw);
    while (sheetMatcher.find()) {
      String sheetName = getAttr(sheetMatcher.group(1), "ss:Name");
      if (sheetName.isEmpty()) sheetName = getAttr(sheetMatcher.group(1), "Name");
      String rows = parseSpreadsheetXmlRows(sheetMatcher.group(2));
      if (rows.trim().isEmpty()) continue;
      sheets.add((sheetName.isEmpty() ? "" : "# " + sheetName + "\n") + rows.trim());
    }
    if (!sheets.isEmpty()) return joinBlocks(sheets);
    return parseSpreadsheetXmlRows(raw);
  }

  private String parseSpreadsheetXmlRows(String xml) {
    List<String> lines = new ArrayList<>();
    Matcher rowMatcher = Pattern
      .compile("(?is)<(?:[\\w]+:)?Row\\b[^>]*>(.*?)</(?:[\\w]+:)?Row>")
      .matcher(xml == null ? "" : xml);
    while (rowMatcher.find()) {
      List<String> cells = new ArrayList<>();
      Matcher cellMatcher = Pattern
        .compile("(?is)<(?:[\\w]+:)?Cell\\b([^>]*)>(.*?)</(?:[\\w]+:)?Cell>")
        .matcher(rowMatcher.group(1));
      int nextIndex = 0;
      while (cellMatcher.find()) {
        String attrs = cellMatcher.group(1);
        String body = cellMatcher.group(2);
        int colIndex = parseOneBasedIndex(getAttr(attrs, "ss:Index"), nextIndex + 1) - 1;
        while (cells.size() < colIndex) cells.add("");
        String value = extractXmlTextRuns(body, "Data");
        if (value.trim().isEmpty()) value = normalizeExtractedCellText(body);
        cells.add(value);
        nextIndex = colIndex + 1;
      }
      trimTrailingEmpty(cells);
      if (!cells.isEmpty()) lines.add(joinTabs(cells));
    }
    return joinLines(lines);
  }

  private int parseOneBasedIndex(String raw, int fallback) {
    try {
      int value = Integer.parseInt(raw == null ? "" : raw.trim());
      return value > 0 ? value : fallback;
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private String extractXlsxText(byte[] bytes) throws Exception {
    List<String> sharedStrings = new ArrayList<>();
    List<String> sheetEntries = new ArrayList<>();
    List<String[]> xmlEntries = readZipXmlEntries(bytes);
    for (String[] entry : xmlEntries) {
      if ("xl/sharedStrings.xml".equals(entry[0])) sharedStrings = parseSharedStrings(entry[1]);
      if (entry[0].startsWith("xl/worksheets/sheet") && entry[0].endsWith(".xml")) {
        sheetEntries.add(entry[0]);
      }
    }
    Collections.sort(sheetEntries);
    StringBuilder out = new StringBuilder();
    int sheetIndex = 1;
    for (String sheetEntry : sheetEntries) {
      String xml = findZipText(xmlEntries, sheetEntry);
      if (xml == null) continue;
      String sheetText = parseWorksheet(xml, sharedStrings);
      if (sheetText.trim().isEmpty()) continue;
      if (out.length() > 0) out.append("\n\n");
      out.append("# Sheet ").append(sheetIndex).append("\n").append(sheetText.trim());
      sheetIndex++;
    }
    return out.toString();
  }

  private String extractDocxText(byte[] bytes) throws Exception {
    List<String[]> entries = readZipXmlEntries(bytes);
    String xml = findZipText(entries, "word/document.xml");
    if (xml == null) return "";
    List<String> paragraphs = new ArrayList<>();
    Matcher pMatcher = Pattern.compile("(?is)<w:p\\b[^>]*>(.*?)</w:p>").matcher(xml);
    while (pMatcher.find()) {
      String paragraph = extractXmlTextRuns(pMatcher.group(1), "w:t");
      if (!paragraph.trim().isEmpty()) paragraphs.add(paragraph.trim());
    }
    return joinLines(paragraphs);
  }

  private String extractPptxText(byte[] bytes) throws Exception {
    List<String[]> entries = readZipXmlEntries(bytes);
    List<String> slideEntries = new ArrayList<>();
    for (String[] entry : entries) {
      if (entry[0].startsWith("ppt/slides/slide") && entry[0].endsWith(".xml")) slideEntries.add(entry[0]);
    }
    Collections.sort(slideEntries);
    List<String> slides = new ArrayList<>();
    int index = 1;
    for (String slide : slideEntries) {
      String xml = findZipText(entries, slide);
      if (xml == null) continue;
      String text = extractXmlTextRuns(xml, "a:t");
      if (!text.trim().isEmpty()) {
        slides.add("# Slide " + index + "\n" + text.trim());
      }
      index++;
    }
    return joinBlocks(slides);
  }

  private List<String[]> readZipXmlEntries(byte[] bytes) throws Exception {
    List<String[]> result = new ArrayList<>();
    ZipInputStream zis = new ZipInputStream(new java.io.ByteArrayInputStream(bytes));
    ZipEntry entry;
    byte[] chunk = new byte[8192];
    while ((entry = zis.getNextEntry()) != null) {
      if (!entry.isDirectory() && entry.getName().endsWith(".xml")) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int read;
        while ((read = zis.read(chunk)) != -1) out.write(chunk, 0, read);
        result.add(new String[] { entry.getName(), new String(out.toByteArray(), StandardCharsets.UTF_8) });
      }
      zis.closeEntry();
    }
    zis.close();
    return result;
  }

  private String findZipText(List<String[]> entries, String name) {
    for (String[] entry : entries) {
      if (name.equals(entry[0])) return entry[1];
    }
    return null;
  }

  private List<String> parseSharedStrings(String xml) {
    List<String> strings = new ArrayList<>();
    Matcher matcher = Pattern.compile("(?is)<si\\b[^>]*>(.*?)</si>").matcher(xml);
    while (matcher.find()) strings.add(extractXmlTextRuns(matcher.group(1), "t"));
    return strings;
  }

  private String parseWorksheet(String xml, List<String> sharedStrings) {
    List<String> lines = new ArrayList<>();
    Matcher rowMatcher = Pattern.compile("(?is)<row\\b[^>]*>(.*?)</row>").matcher(xml);
    while (rowMatcher.find()) {
      List<String> cells = new ArrayList<>();
      Matcher cellMatcher = Pattern.compile("(?is)<c\\b([^>]*)>(.*?)</c>").matcher(rowMatcher.group(1));
      int nextIndex = 0;
      while (cellMatcher.find()) {
        String attrs = cellMatcher.group(1);
        String body = cellMatcher.group(2);
        int colIndex = getCellColumnIndex(getAttr(attrs, "r"), nextIndex);
        while (cells.size() < colIndex) cells.add("");
        cells.add(getCellValue(attrs, body, sharedStrings));
        nextIndex = colIndex + 1;
      }
      trimTrailingEmpty(cells);
      if (!cells.isEmpty()) lines.add(joinTabs(cells));
    }
    return joinLines(lines);
  }

  private String getCellValue(String attrs, String body, List<String> sharedStrings) {
    String type = getAttr(attrs, "t");
    if ("s".equals(type)) {
      String raw = firstXmlTagText(body, "v");
      try {
        int index = Integer.parseInt(raw.trim());
        return index >= 0 && index < sharedStrings.size() ? sharedStrings.get(index) : raw;
      } catch (Exception ignored) {
        return raw;
      }
    }
    if ("inlineStr".equals(type)) return extractXmlTextRuns(body, "t");
    return firstXmlTagText(body, "v");
  }

  private int getCellColumnIndex(String ref, int fallback) {
    if (ref == null || ref.isEmpty()) return fallback;
    int col = 0;
    for (int i = 0; i < ref.length(); i++) {
      char c = Character.toUpperCase(ref.charAt(i));
      if (c < 'A' || c > 'Z') break;
      col = col * 26 + (c - 'A' + 1);
    }
    return col > 0 ? col - 1 : fallback;
  }

  private String getAttr(String attrs, String key) {
    Matcher matcher = Pattern
      .compile("\\b" + Pattern.quote(key) + "\\s*=\\s*([\"'])(.*?)\\1")
      .matcher(attrs == null ? "" : attrs);
    return matcher.find() ? unescapeXml(matcher.group(2)).trim() : "";
  }

  private String firstXmlTagText(String xml, String tag) {
    Matcher matcher = Pattern.compile("(?is)<(?:[\\w]+:)?" + tag + "\\b[^>]*>(.*?)</(?:[\\w]+:)?" + tag + ">").matcher(xml == null ? "" : xml);
    return matcher.find() ? unescapeXml(stripTags(matcher.group(1))).trim() : "";
  }

  private String extractXmlTextRuns(String xml, String tag) {
    List<String> values = new ArrayList<>();
    Matcher matcher = Pattern.compile("(?is)<(?:[\\w]+:)?" + tag + "\\b[^>]*>(.*?)</(?:[\\w]+:)?" + tag + ">").matcher(xml == null ? "" : xml);
    while (matcher.find()) values.add(unescapeXml(stripTags(matcher.group(1))));
    return joinWith(values, "").trim();
  }

  private String stripTags(String raw) {
    return (raw == null ? "" : raw).replaceAll("(?is)<[^>]+>", "");
  }

  private String normalizeExtractedCellText(String raw) {
    String text = raw == null ? "" : raw;
    text = text.replaceAll("(?i)<br\\s*/?>", "\n");
    text = unescapeXml(stripTags(text));
    text = text.replaceAll("[ \\x0B\\f\\r]+", " ");
    text = text.replaceAll("\\s+\\n", "\n");
    text = text.replaceAll("\\n\\s+", "\n");
    return text.trim();
  }

  private String unescapeXml(String raw) {
    String text = (raw == null ? "" : raw)
      .replace("&nbsp;", " ")
      .replace("&amp;", "&")
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .replace("&quot;", "\"")
      .replace("&apos;", "'");
    Matcher matcher = Pattern.compile("&#(x[0-9a-fA-F]+|\\d+);").matcher(text);
    StringBuffer out = new StringBuffer();
    while (matcher.find()) {
      try {
        String value = matcher.group(1);
        int codePoint = value.startsWith("x") || value.startsWith("X")
          ? Integer.parseInt(value.substring(1), 16)
          : Integer.parseInt(value, 10);
        matcher.appendReplacement(out, Matcher.quoteReplacement(new String(Character.toChars(codePoint))));
      } catch (Exception ignored) {
        matcher.appendReplacement(out, Matcher.quoteReplacement(matcher.group(0)));
      }
    }
    matcher.appendTail(out);
    return out.toString();
  }

  private void trimTrailingEmpty(List<String> values) {
    while (!values.isEmpty() && values.get(values.size() - 1).trim().isEmpty()) {
      values.remove(values.size() - 1);
    }
  }

  private String joinTabs(List<String> values) {
    return joinWith(values, "\t");
  }

  private String joinLines(List<String> values) {
    return joinWith(values, "\n");
  }

  private String joinBlocks(List<String> values) {
    return joinWith(values, "\n\n");
  }

  private String joinWith(List<String> values, String separator) {
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < values.size(); i++) {
      if (i > 0) builder.append(separator);
      builder.append(values.get(i));
    }
    return builder.toString();
  }

  private String extractBinaryStrings(byte[] bytes) {
    LinkedHashSet<String> strings = new LinkedHashSet<>();
    collectAsciiStrings(bytes, strings);
    collectUtf16LeStrings(bytes, strings, 0);
    collectUtf16LeStrings(bytes, strings, 1);
    return joinLines(new ArrayList<>(strings));
  }

  private void collectAsciiStrings(byte[] bytes, LinkedHashSet<String> out) {
    StringBuilder run = new StringBuilder();
    for (byte b : bytes) {
      int v = b & 0xFF;
      if (v == 9 || v == 10 || v == 13 || (v >= 32 && v <= 126)) {
        run.append((char) v);
      } else {
        flushRun(run, out, 4);
      }
    }
    flushRun(run, out, 4);
  }

  private void collectUtf16LeStrings(byte[] bytes, LinkedHashSet<String> out, int offset) {
    StringBuilder run = new StringBuilder();
    for (int i = offset; i + 1 < bytes.length; i += 2) {
      int code = (bytes[i] & 0xFF) | ((bytes[i + 1] & 0xFF) << 8);
      char c = (char) code;
      if ((c == '\t' || c == '\n' || c == '\r') || (!Character.isISOControl(c) && code >= 32)) {
        run.append(c);
      } else {
        flushRun(run, out, 2);
      }
    }
    flushRun(run, out, 2);
  }

  private void flushRun(StringBuilder run, LinkedHashSet<String> out, int minLen) {
    String text = run.toString().trim();
    if (text.length() >= minLen && hasUsefulText(text)) out.add(text);
    run.setLength(0);
  }

  private boolean hasUsefulText(String text) {
    if (text == null) return false;
    for (int i = 0; i < text.length(); i++) {
      if (Character.isLetterOrDigit(text.charAt(i))) return true;
    }
    return false;
  }

  private String limitExtractedText(String text) {
    String trimmed = text == null ? "" : text.trim();
    if (trimmed.length() <= MAX_EXTRACTED_TEXT_CHARS) return trimmed;
    return trimmed.substring(0, MAX_EXTRACTED_TEXT_CHARS) + "\n...[内容过长，已截断]";
  }

  private String detectImageMime(byte[] bytes) {
    try {
      if (bytes.length >= 2 && bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xD8) {
        return "image/jpeg";
      }
      if (bytes.length >= 8 &&
        bytes[0] == (byte) 0x89 && bytes[1] == (byte) 0x50 &&
        bytes[2] == (byte) 0x4E && bytes[3] == (byte) 0x47) {
        return "image/png";
      }
      if (bytes.length >= 12 &&
        bytes[0] == (byte) 0x52 && bytes[1] == (byte) 0x49 &&
        bytes[2] == (byte) 0x46 && bytes[3] == (byte) 0x46 &&
        bytes[8] == (byte) 0x57 && bytes[9] == (byte) 0x45 &&
        bytes[10] == (byte) 0x42 && bytes[11] == (byte) 0x50) {
        return "image/webp";
      }
      if (bytes.length >= 4 && bytes[0] == (byte) 0x52 && bytes[1] == (byte) 0x49 &&
        bytes[2] == (byte) 0x46 && bytes[3] == (byte) 0x46) {
        return "image/jpeg";
      }
      return "image/png";
    } catch (Exception e) {
      return "image/png";
    }
  }

  /** Android 10+：写入 MediaStore，无需存储权限，仍可从外部粘贴读取 */
  private Uri insertToMediaStore(byte[] bytes, String mime, String ext) {
    try {
      String name = "ikun_image_" + System.currentTimeMillis() + ext;
      ContentValues values = new ContentValues();
      values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
      values.put(MediaStore.Images.Media.MIME_TYPE, mime);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
      }
      Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
      Uri itemUri = reactContext.getContentResolver().insert(collection, values);
      if (itemUri == null) return null;
      OutputStream out = reactContext.getContentResolver().openOutputStream(itemUri);
      if (out == null) return null;
      out.write(bytes);
      out.flush();
      out.close();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        reactContext.getContentResolver().update(itemUri, values, null, null);
      }
      return itemUri;
    } catch (Exception e) {
      Log.e("Utils", "insertToMediaStore error", e);
      return null;
    }
  }

  /** Android 9-（或 MediaStore 失败时）：落盘到 cache 目录并借助 FileProvider 授权 */
  private Uri writeToCacheFile(byte[] bytes, String mime, String ext) {
    try {
      File dir = new File(reactContext.getCacheDir(), "clipboard");
      if (!dir.exists() && !dir.mkdirs()) return null;
      File file = new File(dir, "ikun_image_" + System.currentTimeMillis() + ext);
      FileOutputStream fos = new FileOutputStream(file);
      fos.write(bytes);
      fos.flush();
      fos.close();
      return FileProvider.getUriForFile(reactContext, reactContext.getPackageName() + ".provider", file);
    } catch (Exception e) {
      Log.e("Utils", "writeToCacheFile error", e);
      return null;
    }
  }

  /**
   * ClipData.prepareToLeaveContext(boolean) 在旧 compileSdk 下可能缺失，
   * 用反射调用：高版本自动给粘贴方开放读取，低版本静默跳过。
   */
  private void grantClipReadPermission(ClipData clip) {
    try {
      var method = ClipData.class.getMethod("prepareToLeaveContext", boolean.class);
      method.invoke(clip, false);
    } catch (Exception ignored) {
      // 忽略：低版本无法授权时，粘贴方可能读不到缓存图片
    }
  }

  /**
   * Gets the device's WiFi interface IP address
   *
   * @return device's WiFi IP if connected to WiFi, else '0.0.0.0'
   */
  @ReactMethod
  public void getWIFIIPV4Address(final Promise promise) throws Exception {
    // https://github.com/pusherman/react-native-network-info/blob/master/android/src/main/java/com/pusherman/networkinfo/RNNetworkInfo.java
    WifiManager wifi = (WifiManager) reactContext.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    new Thread(new Runnable() {
      public void run() {
        try {
          WifiInfo info = wifi.getConnectionInfo();
          int ipAddress = info.getIpAddress();
          @SuppressLint("DefaultLocale") String stringip = String.format("%d.%d.%d.%d", (ipAddress & 0xff), (ipAddress >> 8 & 0xff),
            (ipAddress >> 16 & 0xff), (ipAddress >> 24 & 0xff));
          promise.resolve(stringip);
        } catch (Exception e) {
          promise.resolve(null);
        }
      }
    }).start();
  }

  // https://stackoverflow.com/a/26117646
  @ReactMethod
  public void getDeviceName(final Promise promise) {
    String manufacturer = Build.MANUFACTURER;
    String model = Build.MODEL;
    if (model.startsWith(manufacturer)) {
      promise.resolve(capitalize(model));
    } else {
      promise.resolve(capitalize(manufacturer) + " " + model);
    }
  }

  private String capitalize(String s) {
    if (s == null || s.isEmpty()) {
      return "";
    }
    char first = s.charAt(0);
    if (Character.isUpperCase(first)) {
      return s;
    } else {
      return Character.toUpperCase(first) + s.substring(1);
    }
  }

  @ReactMethod
  public void isNotificationsEnabled(final Promise promise) {
    new Thread(() -> {
      boolean enabled = NotificationPermissionUtil.isNotificationsEnabled(
        reactContext.getApplicationContext());
      promise.resolve(enabled);
    }).start();
  }

  @ReactMethod
  public void openNotificationPermissionActivity(Promise promise) {
    new Thread(() -> {
      boolean result = NotificationPermissionUtil.openNotificationPermissionActivity(
        reactContext.getApplicationContext());
      promise.resolve(result);
    }).start();
  }

  @ReactMethod
  public void shareText(String shareTitle, String title, String text) {
    Intent shareIntent = new Intent(Intent.ACTION_SEND);
    shareIntent.setType("text/plain");
    shareIntent.putExtra(Intent.EXTRA_TEXT, text);
    shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
    Objects.requireNonNull(reactContext.getCurrentActivity()).startActivity(Intent.createChooser(shareIntent, shareTitle));
  }

  // https://stackoverflow.com/questions/73463341/in-per-app-language-how-to-get-app-locale-in-api-33-if-system-locale-is-diffe
  @ReactMethod
  public void getSystemLocales(Promise promise) {
    Locale locale = null;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      LocaleListCompat list = LocaleManagerCompat.getSystemLocales(reactContext);
      if (!list.isEmpty()) {
        locale = list.get(0);
      } else {
        promise.resolve(null);
        return;
      }
    } else {
      locale = Locale.getDefault();
    }
    if (locale == null) {
      promise.resolve("");
      return;
    }

    // 格式化成 zh_cn、en_us 等
    String language = locale.getLanguage(); // zh, en
    String country = locale.getCountry();   // CN, US
    String localeStr;

    if (!country.isEmpty()) {
      localeStr = language.toLowerCase() + "_" + country.toLowerCase();
    } else {
      localeStr = language.toLowerCase();
    }

    promise.resolve(localeStr);
  }

  // https://github.com/Anthonyzou/react-native-full-screen/blob/master/android/src/main/java/com/rn/full/screen/FullScreen.java
  //  @ReactMethod
  //  public void onFullScreen() {
  //    UiThreadUtil.runOnUiThread(() -> {
  //      Activity currentActivity = reactContext.getCurrentActivity();
  //      if (currentActivity == null) return;
  //      currentActivity.getWindow().getDecorView().setSystemUiVisibility(
  //        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
  //          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
  //          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
  //          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION // hide nav bar
  //          | View.SYSTEM_UI_FLAG_FULLSCREEN // hide status bar
  //          | View.SYSTEM_UI_FLAG_IMMERSIVE
  //      );
  //    });
  //  }
  //  @ReactMethod
  //  public void offFullScreen() {
  //    UiThreadUtil.runOnUiThread(() -> {
  //      Activity currentActivity = reactContext.getCurrentActivity();
  //      if (currentActivity == null) return;
  //      currentActivity.getWindow().getDecorView().setSystemUiVisibility(
  //        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
  //          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
  //          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
  //      );
  //    });
  //  }

  @ReactMethod
  public void getWindowSize(Promise promise) {
    WritableMap params = Arguments.createMap();

    Activity currentActivity = reactContext.getCurrentActivity();
    if (currentActivity == null) {
      params.putInt("width", 0);
      params.putInt("height", 0);
      promise.resolve(params);
      return;
    }
    // 获取当前应用可用区域大小
    Window window = currentActivity.getWindow();
    Rect rect = new Rect();
    window.getDecorView().getWindowVisibleDisplayFrame(rect);
    // View decorView = window.getDecorView();
    // int width = decorView.getMeasuredWidth();
    // int height = decorView.getMeasuredHeight();
    params.putInt("width", rect.width());
    params.putInt("height", rect.height());
    promise.resolve(params);
  }

  @ReactMethod
  public void isIgnoringBatteryOptimization(Promise promise) {
    new Thread(() -> {
      boolean result = BatteryOptimizationUtil.isIgnoringBatteryOptimization(
        reactContext.getApplicationContext(),
        reactContext.getPackageName()
      );
      promise.resolve(result);
    }).start();
  }

  @ReactMethod
  public void requestIgnoreBatteryOptimization(Promise promise) {
    new Thread(() -> {
      try {
        boolean result = BatteryOptimizationUtil.requestIgnoreBatteryOptimization(
          reactContext.getApplicationContext(),
          reactContext.getPackageName()
        );
        promise.resolve(result);
      } catch (Exception e) {
        promise.reject("ERROR", e);
      }
    }).start();
  }
}
