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
ikun-chat-mobile-v0.1.5-arm64-v8a.apk
ikun-chat-mobile-v0.1.5-universal.apk
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
npm run publish 0.1.5   # 升版本后再 push 发版
```

## 图片消息与多模态模型

支持在输入区 **「+」** 中选择图片后与文本一同发送，适合 GLM-4V / GPT-4o / Qwen-VL 等多模态模型。

### 图片消息交互

- 点击消息图片可**全屏预览**；长按图片可**复制 / 查看大图 / 删除图片**（仅自己的消息可删除）。
- 编辑重发时**保留原图附件**，可在弹窗内逐个移除后再发送。
- 选中的图片在发送前可预览、移除。

### 图片大小限制

| 限制 | 数值 |
|------|------|
| 单次最多选择 | 4 张 |
| 单张图片上限 | 压缩后 4 MB |
| 选图压缩 | 质量 0.8，最长边 1600px（超出自动缩放，超限会跳过） |

### 存储方式

- 选图时会把图片**拷贝到应用缓存目录**（`cache/attachments/`），消息内只保存 `file://` 地址 + mime/宽高/大小等元数据，**不再把 base64 写入 AsyncStorage**，避免长期撑大本地存储。
- 发送 / 重新生成 / 编辑重发时，才临时从缓存文件读取并生成 `dataUrl` 放入请求体，不落盘。
- 删除消息、删除单张图片、清空会话、删会话、截断历史时，会自动回收对应的缓存文件（尽力而为）。
- 缓存目录由系统管理，低存储时可能被系统清理，导致该图片无法预览；发送 / 重发时若缓存文件失效，会提示重新选择图片，并在会话 / 编辑区标记为「图片已失效」。

### 模型兼容提示

- 模型列表每项右侧会显示**视觉 / 仅文本 / 未知**徽标（按模型 ID 启发式推断，无法保证 100% 准确）。
- 所选模型被判定为「仅文本」时，发送图片前会弹确认框；判定为「未知」时给出 toast 提示。
- 切换模型时若已有待发送图片，也会给出对应提醒，避免发到不支持图片的模型上才报错。
- 请求失败时若请求含图片，错误信息会附上「请确认当前模型支持图片输入」的提示。

## Android SDK 注意事项

- 项目参数：`compileSdkVersion 34`、`minSdkVersion 23`、`targetSdkVersion 29`，JDK 17+。
- 图片相关原生能力依赖 **FileProvider**（authority 为 `${applicationId}.provider`，已在 `AndroidManifest.xml` 声明，`res/xml/file_paths.xml` 开放了 `cache-path`）。
- 复制图片到剪贴板：**Android 10+** 走 MediaStore（无需权限）；**Android 9-** 走 FileProvider + `prepareToLeaveContext`（反射调用，低版本 SDK 无则跳过）。
- 修改 `android/` 下的原生代码（如 `UtilsModule.java`、Manifest）后必须重新执行打包（`npm run dev` / `pack:android:*`），JS/TS 改动可热重载。
- Windows 下执行 Gradle 使用 `gradlew.bat`，对应脚本为 `pack:android:debug:win`、`pack:android:win`、`clear:win`。
- 本地图片缓存在应用私有缓存目录内，无需额外存储权限。

## 中转站配置说明

- **API URL**：可填 `https://host` 或 `https://host/v1`，客户端会规范化到 `.../v1`
- **API Key**：`Authorization: Bearer <key>`
- 模型列表：`GET /v1/models`
- 对话：`POST /v1/chat/completions`

## License

Apache-2.0
