# IKUN Chat Mobile

一款通用的 **Chat Agent** 手机客户端（Android）。配置中转站的 `api_url` 与 `api_key` 后即可拉取模型并会话。

协议兼容 **OpenAI Chat Completions**（`/v1/models`、`/v1/chat/completions`，含 SSE 流式），可对接 NewAPI / OneAPI 等常见中转站。

## 功能

- 配置 API URL / API Key（可选额外请求头）
- 自动拉取并缓存模型列表
- 多会话：新建 / 切换 / 删除
- 流式输出、停止生成
- 系统提示词、Temperature、Max Tokens
- 浅色 / 深色主题、字号
- 会话与消息本地持久化

## 技术栈

- React Native 0.73
- react-native-navigation
- AsyncStorage
- GitHub Actions 自动打包（对齐 [ikun-music-mobile](https://github.com/ikunshare/ikun-music-mobile) 流程）

## 开发

```bash
# 需要 Node >= 18
npm install
npm start
# 另开终端
npm run dev
```

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
