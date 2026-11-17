# 数据文件与 HTTP API

## 数据文件

路径按以下顺序解析：

1. `DSH_PROFILE_DIR`：`<DSH_PROFILE_DIR>/dsh-phrases.json`
2. 否则 `DSH_HOME`：`<DSH_HOME>/dsh-phrases.json`
3. 否则：`~/.dsh/dsh-phrases.json`

Windows 桌面版通常写入：

```text
C:\Users\<用户>\.dsh\dsh-phrases.json
```

首次读取时文件不存在会自动写入默认短语。文件是普通 JSON，可以直接编辑；改完在编辑页点「重新加载」。

## 文件结构

```json
{
  "version": 1,
  "triggers": ["#", ";;"],
  "phrases": [
    {
      "id": "p-pure-question",
      "body": "本次是纯提问，不要修改。",
      "alias": "wt",
      "label": "纯提问"
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `version` | 当前为 `1` |
| `triggers` | 触发符数组，最多 8 个，每个 1–8 字符 |
| `phrases[].id` | 短语 id，缺失时由 Host 生成 |
| `phrases[].body` | 插入的正文，不能为空 |
| `phrases[].alias` | 简码，可为空 |
| `phrases[].label` | 名称，可为空 |

旧格式 `{"trigger": "#", ...}` 仍可读取，会归一化为 `triggers: ["#"]`。

## HTTP API

Host 半在 DSH 已有的 `webServer` 上注册精确路由，**与 DSH 同端口、同源**，不另起服务。

```text
GET  /dsh-phrases/api
PUT  /dsh-phrases/api
```

请求头：

```text
x-dsh-phrases: 1
content-type: application/json   # PUT
```

若请求带 `Origin`，必须与 Harness 同源（允许 `localhost` 与 `127.0.0.1` 的 loopback 别名）。

### 读取

```json
{
  "ok": true,
  "data": {
    "version": 1,
    "triggers": ["#"],
    "phrases": [],
    "trigger": "#"
  }
}
```

`trigger` 是兼容旧客户端的字段，等于 `triggers[0]`。

### 保存

```json
{
  "triggers": ["#", ";;"],
  "phrases": [
    { "id": "a", "body": "hello", "alias": "hi", "label": "Greeting" }
  ]
}
```

成功返回保存后的数据；失败返回：

```json
{ "ok": false, "error": "..." }
```

### 校验限制

| 项 | 限制 |
| --- | --- |
| 触发符数量 | 1–8 |
| 单个触发符 | 1–8 个非空白字符 |
| 触发符唯一性 | 不允许重复 |
| 保留触发符 | `/`、`@` |
| 短语数量 | 最多 500 |
| 单条正文 | 最多 20000 字符 |
| 请求体 | 最多 1 MB |

### 并发

没有版本号或乐观锁：后写入的请求覆盖先写入的内容。多标签页同时编辑时以最后一次保存为准。

### 安全边界

- 同源 + 自定义请求头，阻止普通跨站页面读写
- 不是身份认证机制；同机进程可以直接读写数据文件
- 不属于 DSH 的 Remote API，没有生成的类型与鉴权命名空间

## 备份

数据只有一个 JSON 文件。升级、卸载前复制该文件即可；恢复时放回原路径并点「重新加载」。
