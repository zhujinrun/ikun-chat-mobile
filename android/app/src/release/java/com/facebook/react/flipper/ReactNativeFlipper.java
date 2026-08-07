package com.facebook.react.flipper;

import android.content.Context;
import com.facebook.react.ReactInstanceManager;

/**
 * Release 空实现：不初始化 Flipper，避免 release 包依赖调试组件。
 */
public class ReactNativeFlipper {
  public static void initializeFlipper(Context context, ReactInstanceManager reactInstanceManager) {
    // no-op
  }
}
