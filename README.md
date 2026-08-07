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

1. 在 `android/keystore.properties` 配置签名（参考下方）
2. 执行：

```bash
npm run pack
```

产物位于 `android/app/build/outputs/apk/release/`，命名形如：

```
ikun-chat-mobile-v0.1.0-arm64-v8a.apk
ikun-chat-mobile-v0.1.0-universal.apk
...
```

### keystore.properties 示例

```properties
storeFile=../app/your.keystore
storePassword=***
keyAlias=***
keyPassword=***
```

该文件已加入 `.gitignore`，请勿提交。

## GitHub 自动发布

Push 到 `main` 或手动 `workflow_dispatch` 触发 `.github/workflows/release.yml`。

需在仓库 Secrets 配置：

| Secret | 说明 |
|--------|------|
| `KEYSTORE_STORE_FILE_BASE64` | keystore 文件 base64 |
| `KEYSTORE_STORE_FILE` | 文件名 |
| `KEYSTORE_KEY_ALIAS` | 别名 |
| `KEYSTORE_PASSWORD` | store 密码 |
| `KEYSTORE_KEY_PASSWORD` | key 密码 |

发版前可更新版本与日志：

```bash
# 编辑 publish/changeLog.md 后
npm run publish 0.1.1
```

## 中转站配置说明

- **API URL**：可填 `https://host` 或 `https://host/v1`，客户端会规范化到 `.../v1`
- **API Key**：`Authorization: Bearer <key>`
- 模型列表：`GET /v1/models`
- 对话：`POST /v1/chat/completions`

## License

Apache-2.0
