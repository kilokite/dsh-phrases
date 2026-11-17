# 实现与插槽

## 包结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半：注册 `/dsh-phrases/api`、读写数据文件 |
| `client.js` | Client 半：四个槽位、面板、按钮、编辑器 |
| `cordis.patch.yml` | bundle 行，插入 Host 插件 |
| `locale/zh.json`、`locale/en.json` | 插件管理器展示的标题与描述 |
| `icon.svg` | 插件图标 |
| `docs/` | 本目录文档 |

没有构建步骤，直接发布源码。

## 名称一致性

以下三处必须完全相同：

1. `package.json` 的 `name`
2. `cordis.patch.yml` 中 bundle 行的 `name`
3. `client.js` 中 `window.__ModuleLoader__.load({ id })` 的 `id`

DSH 的浏览器模块系统按包名装载 Client bundle，只改其中一处会导致 Host 已安装但 Client 不加载。

## Host 半

- 通过 `ctx.inject(['webServer'])` 复用 DSH 已有的 HTTP 服务
- 注册精确路由 `/dsh-phrases/api`，与 GUI 同端口
- `GET` 读取、`PUT` 保存；请求带 `x-dsh-phrases: 1`，并校验 `Origin`
- 数据写入使用临时文件 + rename 的原子替换
- 写入串行化，避免并发请求互相截断

## Client 半

| 槽位 | 用途 |
| --- | --- |
| `conversation.input.overlay` | 短语候选面板 |
| `conversation.input.left` | 输入框工具行触发按钮 |
| `settings.section` | 设置页 |
| `shell.overlay` | 「编辑短语」编辑对话框 |

草稿读写只使用公开接口：

- `useInput` 读取草稿、选区、阶段
- `InputActions.captureInsertion()` 读取光标 span 与 revision
- `InputActions.insertText()` 替换触发符与查询文本

不直接操作编辑器 DOM，也不替换 composer 本身。

### 触发检测

- 用 `draft` + `occurrences` 重建 detect 文本（引用 chip 折叠为一个占位符）
- 在光标前查找最近的触发符，校验词边界、查询字符集与 revision
- 多个触发符同位置时取最长
- 面板打开时用 capture 监听方向键、Enter、Tab、Esc，避免触发发送

### 面板与编辑器

- 候选面板与「编辑短语」对话框为纯白底、固定深色文字，不依赖主题色
- 设置页跟随应用主题
- 编辑器复用同一套 `PhrasesSettings` 组件
- 保存后更新共享 store，面板与设置页同步

## 发布

```powershell
npm pack --dry-run
npm publish --dry-run
npm publish
```

`package.json` 的 `files` 白名单已包含运行文件、图标、locale、README、LICENSE 和 docs。

## 已知限制

- 数据只在本机，不随会话、工作区或账号同步
- 正文按纯文本插入；多行文本与粘贴多行文本的行为一致
- 没有导入/导出 UI，只有 JSON 文件
- 多标签页同时编辑时没有冲突检测，最后一次保存生效
- Host 代码改动需要重启 Harness；Client 代码在开发环境可由 HMR 替换
