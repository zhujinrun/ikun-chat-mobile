# Add project specific ProGuard rules here.

# React Native / Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.ikunshare.chat.mobile.** { *; }

# 避免过度裁剪导致反射失败
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
