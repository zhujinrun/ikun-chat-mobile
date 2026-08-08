# IKUN Chat Mobile

一款通用的 **Chat Agent** 手机客户端（Android）。配置中转站的 `api_url` 与 `api_key` 后即可拉取模型并会话。

协议兼容 **OpenAI Chat Completions**（`/v1/models`、`/v1/chat/completions`，含 SSE 流式），可对接 NewAPI / OneAPI 等常见中转站。

## 功能

- 配置 API URL / API Key（可选额外请求头）
- 自动拉取并缓存模型列表
- 多会话：新建 / 切换 / 删除
- 流式输出、停止生成、重新生成
- 全局 / 会话级系统提示词、Temperature、Max Tokens
- 助手消息 Markdown 渲染
- 浅色 / 深色主题、字号
- 会话与消息本地持久化
- Release 异常落盘（下次启动可查看崩溃报告）

## 技术栈

- React Native 0.73
- react-native-navigation
- AsyncStorage
- GitHub Actions 自动打包（对齐 [ikun-music-mobile](https://github.com/ikunshare/ikun-music-mobile) 流程）

## 开发

当前仓库已按 Linux / Ubuntu 环境整理启动脚本，Android Gradle 命令默认使用 `android/gradlew`。

```bash
# 环境要求
# - Node >= 18（仓库 .nvmrc 为 22；当前 Node 20+ 也符合 package.json engines）
# - JDK 17+
# - Android SDK / platform-tools，并确保 adb 可用

npm install
npm start
# 另开终端
npm run dev
```

调试开发节奏：

1. 先确认模拟器已连接：`adb devices`
2. 一个终端保持运行 `npm start`
3. 另一个终端执行 `npm run dev` 安装并启动 debug 包
4. 改 JS / TS / TSX 通常直接自动刷新或手动 Reload；改 Android 原生代码、Gradle 配置或依赖后重新执行 `npm run dev`
5. 需要打开 Android 调试菜单时执行 `npm run menu`

常用命令：

```bash
npm run sc                  # 重启 Metro 并清缓存
npm run typecheck           # TypeScript 类型检查
npm run menu                # 打开 Android 调试菜单
npm run pack:android:debug  # 生成 debug APK
npm run clear               # Gradle clean
```

如果需要在 Windows 下执行 Gradle 打包，可使用 `pack:android:debug:win`、`pack:android:win`、`clear:win`。

### 本地 Release 打包

开发调试使用已提交的 `android/app/debug.keystore`；本地 Release 打包使用 `android/keystore.properties`，该文件已加入 `.gitignore`，请勿提交。

`android/keystore.properties` 参数：

| 参数 | 说明 |
|------|------|
| `storeFile` | keystore 文件路径，支持绝对路径、`~/` 路径，或相对 `android/` 的路径 |
| `storePassword` | keystore store 密码 |
| `keyAlias` | 签名 key 别名 |
| `keyPassword` | 签名 key 密码 |

示例：

```properties
storeFile=~/ikun-chat.keystore
storePassword=***
keyAlias=***
keyPassword=***
```

执行打包：

```bash
npm run pack
```

产物位于 `android/app/build/outputs/apk/release/`，命名形如：

```text
ikun-chat-mobile-v0.1.1-arm64-v8a.apk
ikun-chat-mobile-v0.1.1-universal.apk
...
```

## GitHub Actions 打包

Push `main` 或手动 `workflow_dispatch` 触发 `.github/workflows/release.yml`。CI 会把 Secrets 解码为 keystore 文件，并通过 `KEYSTORE_*` 环境变量供 Gradle 读取。

需在仓库 Secrets 配置：

| Secret | 注入环境变量 | 说明 |
|--------|--------------|------|
| `KEYSTORE_STORE_FILE_BASE64` | `KEYSTORE_BASE64` | keystore 文件 base64 内容 |
| `KEYSTORE_STORE_FILE` | `KEYSTORE_FILE` | keystore 文件名，例如 `ikun-chat.keystore` |
| `KEYSTORE_KEY_ALIAS` | `KEYSTORE_ALIAS` | 签名 key 别名 |
| `KEYSTORE_PASSWORD` | `KEYSTORE_STORE_PASSWORD` | keystore store 密码 |
| `KEYSTORE_KEY_PASSWORD` | `KEYSTORE_KEY_PASSWORD` | 签名 key 密码 |

发版前可更新版本与日志：

```bash
npm run publish 0.1.1   # 升版本后再 push 发版
```

## 中转站配置说明

- **API URL**：可填 `https://host` 或 `https://host/v1`，客户端会规范化到 `.../v1`
- **API Key**：`Authorization: Bearer <key>`
- 模型列表：`GET /v1/models`
- 对话：`POST /v1/chat/completions`

## License

Apache-2.0
