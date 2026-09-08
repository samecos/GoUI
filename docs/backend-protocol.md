# 前端 WebSocket 契约

本文记录当前前端实际发送和消费的协议子集，依据本仓库的连接、会话、界面代码及测试整理。它用于实现兼容服务、识别后端依赖；不代表完整后端规范，也不表示本仓库包含或发布了后端、推理 Worker 或模型。测试夹具仅验证交互，不能用作围棋规则或 AI 引擎。

## 连接与消息

构建时可通过 `VITE_ENGINE_WS_URL` 指定完整地址。未配置时连接当前页面主机的 `8090/ws`：HTTP 页面使用 `ws://`，HTTPS 页面使用 `wss://`。前端直接使用浏览器原生 WebSocket，未指定子协议，也未实现登录或应用层鉴权流程。

每个 WebSocket 消息都是一个 JSON 对象。请求字段平铺，无 `payload` 包装：

```json
{"id":"2","type":"play","sessionId":"example-session","index":180,"color":1}
```

- `id`：客户端生成的递增数字字符串，仅用于本连接客户端实例内的请求关联；响应须原样带回。允许乱序响应，不应把它当作全局幂等键。
- 成功响应：`{"type":"response","id":"2","ok":true,"data":...}`。棋局操作的 `data` 应为完整快照，前端不会合并局部补丁。
- 失败响应：`{"type":"response","id":"2","ok":false,"error":{"code":"ILLEGAL_MOVE","message":"该落点不合法"}}`。`message` 用于提示；除恢复会话时的 `SESSION_NOT_FOUND`，前端不依赖固定错误码列表。
- 主动更新：直接发送 `{"type":"snapshot",...}`，不是 `response` 包装。其他主动消息类型当前不处理。分析进度应通过完整快照推送。

## 创建与恢复会话

每次连接建立后，前端先发送 `open`。新会话请求为：

```json
{"id":"1","type":"open"}
```

下面是完整、可解析的最小空棋局响应示例。`data` 也可单独作为主动快照发送；数组按 19 行排版，实际为 361 项的一维数组。示例没有分析结果。

```json
{
  "type": "response",
  "id": "1",
  "ok": true,
  "data": {
    "type": "snapshot",
    "sessionId": "example-session",
    "generation": 1,
    "version": 1,
    "boardSize": 19,
    "board": [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ],
    "moves": [],
    "position": 0,
    "toPlay": 1,
    "captures": {"black": 0, "white": 0},
    "settings": {"komi": 7.5, "rules": "chinese"},
    "terminal": null,
    "analysis": {
      "enabled": false,
      "status": "idle",
      "root": null,
      "candidates": [],
      "visits": 0,
      "nodesPerSecond": 0
    }
  }
}
```

前端按连接地址把 `sessionId` 和分析开关意图存入浏览器 `sessionStorage`。同一页面重连或刷新时发送：

```json
{"id":"3","type":"open","sessionId":"example-session"}
```

服务应返回该会话的最新完整快照，并恢复该连接的快照订阅。附加连接本身不应重开棋局、重新启动分析或替换已有 AI 落子任务。若会话不存在，返回：

```json
{"type":"response","id":"3","ok":false,"error":{"code":"SESSION_NOT_FOUND","message":"会话不存在或已过期"}}
```

前端会提示、清除本地会话和分析意图，再发送不带 `sessionId` 的 `open`。会话保留时间及服务重启后的持久性不由前端定义；SGF 用于长期保存棋谱。

## 操作与字段

下表列出当前界面发出的操作。除 `open`、`cancel` 外，所有请求均包含 `sessionId`；表内只列额外字段。棋局由服务校验并以快照确认，前端不会先行落子。

| `type` | 额外字段 | 界面期望的行为 / 成功 `data` |
| --- | --- | --- |
| `open` | 可选 `sessionId` | 创建或恢复会话，返回完整快照。 |
| `play` | `index`、`color` | 落子或停一手，返回完整快照；在历史位置落子时替换后续主线。 |
| `undo` | 无 | 撤销当前手并截断后续主线，返回完整快照。 |
| `seek` | `position` | 定位到主线的第几手，保留完整主线，返回完整快照。 |
| `new_game` | `komi`、`rules:"chinese"` | 清空棋局并应用设置，返回完整快照。 |
| `set_position` | `boardSize:19`、`moves`、`komi`、`rules:"chinese"` | 导入完整主线并定位末手，返回完整快照；应先完整校验，失败保留原棋局。 |
| `analyze` | `enabled`，布尔值 | 开始 / 停止持续分析，返回完整快照；后续分析通过快照更新。 |
| `genmove` | `color` | 按服务的搜索预算选择并直接落子，返回完整快照；前端不传预算，超时为 50 秒，可取消。 |
| `variation` | `index`、当前 `generation` | 只读取该候选点已有变化，返回下述 PV 对象，不启动新推理。 |
| `cancel` | `requestId`，被取消的请求 ID | 尽力停止原请求；该消息拥有新的 `id`，不含 `sessionId`，前端不等待其响应。 |

`index` 是 `row * 19 + column`，行列从 0 开始、由左上向右下；`0` 为 A19，`180` 为 K10，`360` 为 T1，棋盘字母跳过 I。`null` 表示停一手。`color` / `toPlay`：`1` 黑，`2` 白。`moves` 是 `[{"index":180,"color":1}, ...]`，不含摆子或分支。当前 SGF 导入仅接受 19 路中国规则、从黑方开始交替落子的单局主线。双方名称及显示偏好由前端管理，不随上述请求提交。

## 快照消费与过期过滤

以下字段需保持互相一致。接收器只检查会话、整数代次/版本、19 路棋盘长度及 `moves` 是否为数组；通过检查不等于其余内容合法，缺字段或无法回放的主线仍可能使界面报错。

| 字段 | 当前用途 |
| --- | --- |
| `type:"snapshot"` | 主动推送时必需；作为响应 `data` 时由 `board` 字段触发接收。 |
| `sessionId` | 与当前已打开会话一致。 |
| `generation`、`version` | 整数；用于丢弃旧局面分析及延迟响应，规则见下文。 |
| `boardSize:19`、`board` | 361 项一维数组，`0` 空、`1` 黑、`2` 白，表示当前 `position`。 |
| `moves`、`position` | 完整主线及当前手数；`position` 是 `0..moves.length` 的整数。历史帧由主线回放，当前帧由服务棋盘覆盖。 |
| `toPlay`、`captures` | 当前行棋方，以及 `{black,white}` 两方累计提子数。 |
| `settings` | `{komi,rules}`；当前支持 `rules:"chinese"`。 |
| `terminal` | 可省略或为 `null`；任何非空值都会显示“棋局已结束”，其内部结构不被读取。结束后操作是否合法仍须服务校验。 |
| `analysis` | 分析状态及结果；无结果时使用下述空值结构。 |

同一 `sessionId` 已有快照时，下一份必须同时满足 `next.generation >= current.generation` 和 `next.version > current.version`。因此 **`version` 必须跨代次持续递增，不能在新的 `generation` 中归零**。同版本的响应与推送只会接收一次。切换棋局、定位或更换搜索根时，服务应增加 `generation`，使旧根的 PV 失效；同根的分析进度可保持 `generation` 并增加 `version`。首次接收该会话只要求代次和版本为整数。页面重连会保留当前快照，因此旧版本恢复响应也可能被丢弃。

## 分析、Worker 与 PV

兼容服务应提供 `analysis.enabled` 布尔值：前端据此同步开关并信任服务恢复状态。若缺失此字段且本地保存的分析意图为真，前端在 `open` 后会补发 `analyze {enabled:true}`。其余分析字段虽有空值回退，完整功能应按下表返回。

| 字段 | 含义及空值行为 |
| --- | --- |
| `analysis.status` | 已识别 `idle`、`analyzing`、`waiting_workers`、`memory_limited`、`finished`、`error`。未知或缺失显示“待命”。 |
| `analysis.reason` | 可选说明文本，显示于提示；容量受限时也用于主说明。 |
| `analysis.visits`、`analysis.nodesPerSecond` | 搜索访问量、每秒访问量，有限数值；缺失显示 0。 |
| `analysis.root` | 无评估时为 `null`；有结果时包含 `winRateBlack`（0..1）与 `scoreLeadBlack`（黑方领先为正）。缺失或 `null` 的数值显示“—”。 |
| `analysis.candidates` | 无结果时为 `[]`；有结果时按服务排名排列，每项含 `index`、`visits`、`winRateBlack`、`scoreLeadBlack`。比例筛选保持顺序，前端不会重新排名。 |

候选表中的胜率始终为黑方视角；棋盘标记换算为当前行棋方视角。缺算力时用 `waiting_workers`，结果可为空或保留同一局面的有效结果；`genmove` 无法完成时应返回失败响应。前端没有 Worker 连接流程，不读取快照中的 `workers`，也不读取候选点的 `color`、`prior`、`pv`，这些字段不是本契约的必需项。Worker 的部署、调度、认证和模型推理属于兼容服务自己的实现。

悬停 300ms 后发送 `variation`。本地悬停组件持有的 `board`、`toPlay`、`candidate` 不会原样上网；实际请求字段为 `index`、`generation`、`sessionId`。成功响应 `data` 的示例（仅表示格式，并非 AI 推荐结果）：

```json
{
  "available": true,
  "generation": 1,
  "version": 2,
  "moves": [{"index":180,"color":1},{"index":null,"color":2}]
}
```

无已有变化时返回 `{"available":false,"generation":1,"version":2,"moves":[]}`。应总是提供 `available`、`generation`、`moves`；`version` 是约定的结果元数据，当前 PV 代码不据它过滤。请求期间会话或当前 `generation` 改变，或结果的 `generation` 不匹配，结果会被丢弃。非空 PV 第一手必须等于请求候选点，第一手颜色必须为当前 `toPlay`，之后颜色交替，落点为 `null` 或 0..360 整数且可在当前棋盘上回放。空 `moves` 显示暂无后续变化。

## 错误、取消与断线

默认请求超时 15 秒（`genmove` 为 50 秒）。超时或 `AbortSignal` 取消会立即结束本地等待，并在连接仍可用时发送 `cancel`；迟到响应被忽略。取消不是事务回滚，已经完成的服务操作应通过权威快照反映。

连接关闭会拒绝全部未完成请求，保留最后一份棋局快照并禁用修改。默认每隔约 1 秒尝试重连，再通过 `open` 同步状态；未完成的落子、导入、AI 落子等请求不会自动重发。无效 JSON 会显示协议错误；未关联到待处理请求的响应会被忽略。

实现依据：[连接与过滤](../src/engine-connection.js)、[会话适配](../src/engine-session.js)、[界面操作](../src/main.js)、[悬停请求](../src/variation-api.js)、[棋盘与 PV 回放](../src/board-view.js)。对应的 `*.test.js` 及 [浏览器夹具](../scripts/browser_smoke.py) 覆盖请求关联、恢复、取消、过期过滤和主要显示行为；本文件不定义服务内部规则实现、搜索预算或完整错误码集合。
