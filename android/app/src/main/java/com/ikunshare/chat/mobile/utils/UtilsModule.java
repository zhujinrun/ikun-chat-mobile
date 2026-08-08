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
import android.graphics.Rect;
import android.net.Uri;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.app.LocaleManagerCompat;
import androidx.core.content.FileProvider;
import androidx.core.os.LocaleListCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.Objects;

public class UtilsModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;

  private int listenerCount = 0;

  UtilsEvent utilsEvent;

  UtilsModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    utilsEvent = new UtilsEvent(reactContext);
    registerScreenBroadcastReceiver();
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

  private byte[] readUri(Uri uri) throws Exception {
    String scheme = uri.getScheme();
    if ("data".equalsIgnoreCase(scheme)) {
      String whole = uri.toString();
      int comma = whole.indexOf(',');
      if (comma < 0) throw new Exception("无法读取图片数据");
      String meta = whole.substring(5, comma);
      String body = whole.substring(comma + 1);
      if (meta.contains(";base64")) {
        return android.util.Base64.decode(body, android.util.Base64.DEFAULT);
      }
      return java.net.URLDecoder.decode(body, "UTF-8").getBytes("UTF-8");
    }
    InputStream input = reactContext.getContentResolver().openInputStream(uri);
    if (input == null) throw new Exception("无法读取图片地址");
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    while ((read = input.read(chunk)) != -1) {
      buf.write(chunk, 0, read);
    }
    input.close();
    return buf.toByteArray();
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

