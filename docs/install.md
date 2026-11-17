# 安装与升级

## 环境

- DeepSeek Harness，Web GUI 或桌面版
- 无额外运行时依赖

## 从 npm 安装

在 Harness 的插件管理器中执行 `install_bundle`，`target` 填 npm 包名：

```text
dsh-phrases
```

## 从本地目录安装（开发）

在插件管理器中执行 `install_bundle`，`target` 填本目录的绝对路径。

## 生效方式

- 安装后刷新 Harness 页面，浏览器端槽位才会加载
- 只改 `client.js`：开发环境下 HMR 会自动替换浏览器端模块
- 改 `index.js`（Host 端接口）：需要重启 Harness 才会换用新模块

## 升级

修改 `version` 后重新安装：

```text
install_bundle  ->  dsh-phrases
```

短语数据保存在独立 JSON 文件中，升级不会覆盖。

## 卸载

```text
remove_bundle  ->  dsh-phrases
```

卸载不会删除短语文件。需要一并清理时，手动删除数据文件（路径见 [数据文件与 HTTP API](data.md)）。

## 排障

| 现象 | 检查 |
| --- | --- |
| 插件列表没有条目 | 包名是否为 `dsh-phrases`，profile 中是否已安装 |
| 输入框没有触发按钮 | 刷新页面；确认当前会话的 composer 已挂载 |
| 设置里没有「常用短语」 | 刷新页面；确认插件行处于启用状态 |
| 保存失败 | 数据文件是否可写；Harness 的 Web 端口是否变化（API 与 GUI 同端口） |
| 修改 Host 代码后行为没变 | 重启 Harness，Client HMR 不会重载 Host 模块 |

## 维护者注意

发布包的 `package.json` 名称、`cordis.patch.yml` 中的 `name`、`client.js` 中 `__ModuleLoader__.load` 的 `id` 必须完全一致，否则 Host 能安装但 Client 不会加载。详见 [实现与插槽](internals.md)。
