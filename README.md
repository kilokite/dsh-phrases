# 常用短语（dsh-phrases）

给 DeepSeek Harness 输入框加一个常用短语面板：输入触发符号，模糊搜索短语文本或简码，回车插入完整文本。

## 特性

- 输入框输入`#`触发短语选择器，可以自定义，比如使用`>`和`》`（支持多个触发符号
- 可按正文、名称、简码模糊搜索
  
## 快速使用

安装（二选一）：

- npm 包：在 Harness 插件管理器中安装 `dsh-phrases`
- 本地开发：`install_bundle` 指向本目录

使用：

1. 输入任意触发符号，默认 `#`
2. 输入短语文字或简码，如 `#wt`、`#纯提`、`#方案`
3. `↑` / `↓` 选择，`Enter` 插入
4. 编辑：面板右下角「编辑短语」，或「设置 → 常用短语」

## 文档

- [安装与升级](docs/install.md)
- [触发符、搜索与快捷键](docs/usage.md)
- [数据文件与 HTTP API](docs/data.md)
- [实现与插槽](docs/internals.md)

## License

MIT
