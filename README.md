# 弈间 · 围棋工作台

弈间（YIJIAN）是一个使用 Vite、原生 JavaScript 和 SVG 构建的围棋前端，提供棋局操作、逐手复盘、SGF 导入导出和引擎分析展示，通过 WebSocket JSON 与兼容后端通信。

**本仓库仅包含前端，不包含 Rust 服务、推理 Worker 或模型权重。** 完整的对弈和分析功能需要另行准备兼容后端；本仓库目前未提供公开后端地址或后端下载地址。没有后端时可以启动和查看界面，但棋局修改与分析不可用。前端不生成模拟胜率、随机 AI 落子或默认示例棋局。

项目自有代码采用 [Unlicense](LICENSE)，可以自由使用、修改、商用、闭源和再分发，无须署名或公开修改后的源码。第三方依赖和资源仍适用各自协议，见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 快速开始

准备 Node.js 22.12+ 或 24.x，以及随 Node.js 安装的 npm。在仓库根目录运行：

```sh
npm ci
npm run dev
```

在浏览器中打开终端显示的地址，通常为 `http://localhost:5173`。开发服务器监听 `0.0.0.0`，也可以通过本机局域网地址访问。若只需本机访问，可运行 `npm run dev -- --host 127.0.0.1`。

### 连接后端

未设置环境变量时，前端连接**浏览器地址栏中的主机名和端口**、路径 `/ws`。Vite 开发及预览服务器将 `/ws` 转发至前端机器上的 `127.0.0.1:8090`，因此后端仅监听本机地址时也能通过局域网使用前端：

| 打开的前端地址 | 默认 WebSocket 地址 |
| --- | --- |
| `http://localhost:5173` | `ws://localhost:5173/ws` |
| `http://192.168.1.10:5173` | `ws://192.168.1.10:5173/ws` |
| `https://go.example.com` | `wss://go.example.com/ws` |

如果默认地址符合部署方式，无须创建环境文件。需要指定其他后端时，将 [`.env.example`](.env.example) 复制为 `.env.local`，再修改其中的地址：

```dotenv
VITE_ENGINE_WS_URL=ws://127.0.0.1:8090/ws
```

这里的 `127.0.0.1` 指向**打开网页的设备**；远程访问时应改为该设备可以访问的后端主机。HTTPS 页面需要可用的 `wss://` 地址。保存后重启开发服务器；已构建的站点需要重新构建并部署。

`VITE_*` 是构建期公开变量，值会进入浏览器可读取的前端代码。不要在其中填写密钥、访问令牌或密码。前端所需的请求、快照和事件格式见 [后端接入协议](docs/backend-protocol.md)。

启动兼容后端后，页面应显示“服务已连接”。未连接时显示空棋盘或上次快照并暂停修改；后端没有可用推理 Worker 时，分析结果为空或保留上次有效结果，页面显示等待算力。AI 落子需要后端提供真实算力。

## 当前功能与边界

- 桌面工作台按窗口高度完整显示棋盘，分析栏可拖动调宽，支持方向键微调和双击恢复。专注模式放大棋盘，手机和平板将复盘控制放在棋盘下方。
- 棋盘采用本地 SVG 木纹、厚度和落子阴影；黑白棋子使用独立光照渐变与白子细纹，手数及候选点仍可独立切换。
- 分析详情可切换推荐选点、胜率走势和落子记录；手数滑条支持快速定位，分析栏宽度保存在当前浏览器会话中。
- 19 路中国规则：双方手动落子、停一手、悔棋、清枰、重开与设置贴目。棋局合法性和最终状态以服务端快照为准。
- 逐手复盘、自动播放和历史定位；在历史位置落子时，兼容服务会截断后续主线。
- 开始／停止持续分析、AI 落子与取消。AI 落子按服务预算执行并直接落子，无算力时显示服务错误。
- 展示黑方胜率、目差、候选点、搜索访问量和搜索速度。胜率曲线只记录本页面收到的局面评估，未分析的手数保留空缺。
- 候选点悬停 300 毫秒后读取已有搜索图中的后续变化（PV），持续悬停时每次请求完成后间隔 1 秒更新；等待期间保留预览，相同变化不重绘，移开或落子即取消。支持停一手与提子显示；悬停不会请求启动新的推理任务。
- 候选点显示比例默认 10%，按服务返回的候选总数向上取整，最少 3 个、最多 30 个，不足 3 个时全部显示。棋盘与推荐列表同步更新，比例保存在当前浏览器会话中。
- SGF 导入导出，保留双方名称、规则和贴目。导入仅接受 19 路中国规则、无摆子、无分支、从黑方交替落子的单局棋谱；前端发送整份主线，由兼容服务原子校验，失败不应改变现局。
- 断线时拒绝未完成操作并保留页面快照，自动重连后尝试用当前浏览器会话中的 session ID 恢复。修改命令不会自动重发；原会话过期时提示并创建新棋局。

双方名称和显示偏好由前端管理。会话实际保留期限与跨服务重启恢复能力取决于后端，请导出 SGF 长期保存棋谱。当前不支持日本规则、让子和带复杂分支的 SGF。

页面从 Google Fonts 加载 Noto Sans SC 与 Noto Serif SC；字体服务不可用时使用系统后备字体。

## 构建与部署

```sh
npm run build
```

将生成的 `dist/` 内容部署到静态网站服务器。后端需要单独运行。使用默认地址时，生产服务器必须将 `/ws` 反向代理至后端，并支持 WebSocket 升级；Vite 的代理配置不会打包进 `dist/`。也可在构建时设置 `VITE_ENGINE_WS_URL`，指定浏览器能够直接连接的后端地址。

默认按站点根路径构建。部署到 `/yijian/` 等子路径时：

```sh
npm run build -- --base=/yijian/
```

`--base` 设置静态资源路径，不改变 WebSocket 地址；后端地址仍按“连接后端”一节配置。

可以使用 `npm run preview` 本地检查构建产物，地址以终端输出为准。Vite preview 用于预览，不作为生产服务器。

## 验证

### 单元测试与构建

```sh
npm test
npm run build
```

Node 测试覆盖请求乱序、取消与超时、断线不重放、会话恢复、过期快照与 PV 丢弃、SGF 边界及棋盘回放，不需要真实后端或 Python。

### 浏览器回归

浏览器脚本需要 Python 3、Python Playwright 和本机安装的 Google Chrome。先在一个终端运行：

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

另开终端创建虚拟环境并安装依赖。Windows PowerShell：

```powershell
python -m venv .venv-browser
.\.venv-browser\Scripts\python.exe -m pip install playwright
.\.venv-browser\Scripts\python.exe scripts\browser_smoke.py
```

macOS / Linux：

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python -m pip install playwright
.venv-browser/bin/python scripts/browser_smoke.py
```

[`browser_smoke.py`](scripts/browser_smoke.py) 使用受控 WebSocket 协议夹具检查界面，无须后端，不验证真实围棋引擎。脚本固定访问 `http://127.0.0.1:5173` 并拦截以 `/ws` 结尾的连接，运行时请保留默认 WebSocket 地址，或使用路径为 `/ws` 的地址。

[`browser_live.py`](scripts/browser_live.py) 用于真实服务联调，需要另外准备兼容后端。Windows PowerShell 示例：

```powershell
# 后端未连接推理 Worker：检查等待算力和无算力错误
.\.venv-browser\Scripts\python.exe scripts\browser_live.py

# 后端已连接真实推理 Worker：检查真实分析和 AI 落子
.\.venv-browser\Scripts\python.exe scripts\browser_live.py --expect-worker

# 前端不在默认地址时，可指定前端 URL
.\.venv-browser\Scripts\python.exe scripts\browser_live.py --url http://127.0.0.1:5173
```

macOS / Linux 将上述 Python 路径替换为 `.venv-browser/bin/python`。真实联调脚本在独立浏览器会话中创建测试棋局，不复用已打开的用户棋局。截图与检查报告写入 `test-results/`。

[`session_resume_live.mjs`](scripts/session_resume_live.mjs) 是多连接恢复的专项联调脚本，需要外部 Rust 测试服务及配套 Worker 夹具；这些夹具不在本仓库中，无法仅凭此仓库运行该项检查，也不应将它连接到正在使用的服务会话。

## 代码导航

| 文件 | 职责 |
| --- | --- |
| [`src/main.js`](src/main.js) | 界面状态、操作映射与服务快照展示 |
| [`src/style.css`](src/style.css) | 页面样式与响应式布局 |
| [`src/engine-connection.js`](src/engine-connection.js) | 请求关联、取消、超时和连接管理，不重放修改命令 |
| [`src/engine-session.js`](src/engine-session.js) | 会话恢复、分析意图以及代次和版本过滤 |
| [`src/variation-api.js`](src/variation-api.js) | 候选点悬停防抖、取消与过期响应处理 |
| [`src/board-view.js`](src/board-view.js) | 主线回放、候选点展示和 PV 视觉预览 |
| [`src/go.js`](src/go.js) | 棋盘坐标与前端回放辅助逻辑，不替代服务端合法性判定 |
| [`src/sgf.js`](src/sgf.js) | 受限 SGF 解析与导出 |

协议约定和前端接入范围见 [后端接入协议](docs/backend-protocol.md)。提交问题或改进前可阅读 [贡献指南](CONTRIBUTING.md)。
