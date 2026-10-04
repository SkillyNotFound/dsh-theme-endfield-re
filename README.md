# dsh-theme-endfield-re

[`dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield) 的 fork，基线是上游 **1.1.5**（提交 `82655a0`，2026-09-25）。从这里开始由本仓库独立开发。

参考《明日方舟：终末地》官网风格的 DSH Web 主题插件。奶油纸底、墨黑文字、信号黄/武陵青强调色、全直角工业编辑风。

**本仓库是完整主题本体**，不是补丁集——clone 下来就能装、就能改、就能跑测试。

## 相对上游 1.1.5 的改动

| 改动 | 说明 |
| --- | --- |
| **中央散景**（新功能） | 等高线在对话中轴线（或 hero 页画面中心）附近虚化，四周保持锐利。上游没有这个功能 |
| **hero 兼容修复** | 修好 DSH 0.2.0-rc.2 上新建会话页的三处静默失效：字标掉到屏幕外、中间一条黑带、光晕消失 |
| **`.gitattributes`** | 新增。上游没有，导致 Windows 上 clone 会被 `core.autocrlf=true` 改写成 CRLF，committed 的 bundle 与测试过的字节不一致 |
| **worker 侧散景桩** | `src/contour-worker.js` 新增 `contourBokehPass` 空实现。`contourDrawLines()` 是被构建脚本原样抽取进 worker 的内核函数，补丁让它调用了 `contourBokehPass`，不补这个桩 worker 内会 ReferenceError，且构建门 `--check` 永远红着 |
| **内嵌 worker 换行** | 上游 1.1.5 把 `\r\n` 编进了内嵌 worker 字符串；本 fork 用 `build:worker` 重新生成后为纯 `\n`（上游要到 1.1.9 前的 `533e549` 才把这一点独立修掉） |
| **测试同步** | 补丁加了 2 行设置却没更新测试登记，`settings-rows`（ROW_KEYS 27→29）与 `settings-namespace`（两个 fixture 缺 `bokeh`/`bokehWash`）失败；内核抽取型 harness（`contour-cusps`、`contour-smoothness`）也缺 `contourBokehPass` 桩。本 fork 已补齐 |

上游 1.1.9 至今**没有**「中央散景」，也**没有**修 hero 字标定位（它跟进的另外三处应用侧钩子是回合状态标签、右侧栏改名、插件卡片文案）。

设置项在 **设置 › 终末地主题设置 › 02 背景**：

| 设置行 | 字段 | 取值 | 默认 |
| --- | --- | --- | --- |
| 中央散景 | `bokeh` | `off` / `subtle` / `standard` / `strong` | `standard` |
| 散景压暗 | `bokehWash` | `off` / `subtle` / `standard` / `strong` | `standard` |

散景只在**主线程 canvas** 画笔里实现。选中等同于声明 `Worker / WebGL` 后端不合法，所以主题会**自动回退到 canvas**（worker 的 WebGL2 垫片没有 `filter` / `globalCompositeOperation` / 渐变 / `drawImage`，承载不了这个 pass）。把 **中央散景** 调回 `关闭`，worker 会在下次同步时重新接管。

> **注意**：`id: theme-endfield`（`cordis.patch.yml`）同时是设置命名空间，已刻意保留，所以你在上游版本里保存的设置迁移过来仍然有效。代价是本 fork 与上游**不能同时安装**（同一个 row id）。要换回来就先卸载其一。

## 安装

```bash
dsh plugin --profile web add github:SkillyNotFound/dsh-theme-endfield-re
```

重启或重新加载 `web` profile 后生效。**更新插件文件时注意**：Client 半（`client.js`）由 Host 按请求从磁盘读取，浏览器刷新即可生效；Host 半（`index.js`）只在 profile 启动时 import 一次，**必须整进程重启 DSH** 才会重新加载（`dsh-hmr` 的 watch 默认忽略 `**/node_modules`，软链安装的仓库文件不在其观察范围内）。只刷新页面时，运行的仍是启动时那份 Host 代码。

卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield-re
```

## 功能

在 **设置 › 终末地主题设置** 中调整：

- 主题总开关、谷地黄/武陵青配色、直角/圆角模式；
- 等高线背景、动态开关、`24 / 60 / 120 FPS`、速度 `1x / 2x / 4x`、绘制后端（Canvas / Worker+WebGL）；
- **中央散景与散景压暗**（本 fork 新增）；
- 可选鼠标轨迹：鼠标附近的等高线局部变形并逐渐恢复，默认关闭；
- 背景水印及持续显示；
- 启动加载动画；
- 雷霆大字及入场动画。

所有设置由 DSH 自己的设置服务持久化，与页面 origin/端口无关：Host `index.js` 导出一份字段全部 `.volatile()` 的 schemastery `Config`（命名空间 = 本插件 profile entry id `theme-endfield`），浏览器 `client.js` 通过 `ctx.configForms` 读写并订阅，值随 `<profile>/cordis.patch.yml` 落盘；在**旧版 DSH** 上则回落到 `ctx.settings.register` + `ctx.settingsScope`。两代都与页面 origin 无关，因此 DSH web 与 DSH Desktop 都能正确保存并在重启/换端口后恢复。详见 [docs/features.md](docs/features.md) 与 [docs/engineering-notes.md](docs/engineering-notes.md)。

**如果开关总是「刷新后复位」**：先看 Host 侧有没有这份 `Config`（`Config.listConfigs` 对该 entry 报 `absent` 就是没有）。没有 Config 时 DSH 不投影任何表单，Host `apply()` 会打一行 warn 并在 profile 目录留下报告文件 `theme-endfield-diagnostic.json`。另外注意：**改 Host 半（`index.js`）必须整进程重启 DSH**。

## 开发与验证

```bash
node check.js          # 样式表静态校验
node selftest.js       # 校验器自检
node scripts/build-contour-worker.js --check   # 内嵌 worker 与 src/ 是否一致
npm test               # 全套（含真实浏览器渲染、性能预算）
```

`npm test` 覆盖样式不变量、配色、设置页、真实浏览器渲染、等高线平滑/尖点、动画可访问性、覆盖率和 24/60/120 FPS 性能预算。部分浏览器测试需要本机安装 Chrome 或 Edge。

本 fork 建立时的实测状态：**静态门全绿**（`check.js`、`selftest.js`、`build:worker --check`、`build:sounds --check`），**全部非浏览器测试通过**；浏览器依赖的测试（`contour-render`、`font-scope`、`palette-switch`、`settings-off`、`contour-smoothness` 等 15 个）在受限环境里无法运行，需要能启动 Chrome 的机器。`hover-check` / `live-check` 还需要一个带 DevTools 端点的运行实例。

**Windows 开发者注意**：bundle 是纯 LF。Git for Windows 默认 `core.autocrlf=true`，会把 clone 变成 CRLF，于是 committed 的字节和测试过的不一致。仓库已带 `.gitattributes`（`* -text`）关掉所有 EOL 转换；如果你在加入它之前就 clone 了，请 `git config core.autocrlf false` 后重新检出。

改动内嵌 worker 相关代码后，记得跑 `npm run build:worker` 重新生成内嵌字符串——`npm run check` 会校验它是否与 `src/` 一致。

### 散景的实现要点

虚化**不是 CSS `blur()`**，而是在光栅器里重画——1px 描边被高斯模糊只会把墨摊开直到线消失（峰值随半径下降、宽度线性增长），那是「线没了」不是「线虚了」。

最终做法是线性混合：

```
R = m_sharp * sharp  +  Σ_k  m_k * dim_k * blur_k(sharp)
```

`m_k` 是沿离轴距离的帽函数，与锐利结点一起恰好分割单位。三步：按总覆盖 `1 - m_sharp` **一次性**挖掉锐利墨（`destination-out`）→ 各分带**加性**叠回（`lighter`）→ 散景压暗折进各分带的 alpha。

一条教训：中间版本在**每个分带里各自挖一次再各自加回**，那是另一个函数——两个帽函数各占一半权重处会留下 25% 的**锐利**线，表现就是虚化中心一圈亮环加外层更多环。必须**只挖一次**。

未复现：参考目标（Photoshop 倾斜偏移）的 `w10/w50 ≈ 1.0–1.6` 比高斯平坦，因为镜头成的是圆盘像；Canvas 只有高斯 `filter: blur()`。

## 项目结构

```text
client.js          Client 侧主题实现（含内嵌等高线 worker 源码）
index.js           Host 侧：导出 volatile Config，声明设置命名空间
cordis.patch.yml   Bundle 注入配置（row id = theme-endfield，name = 包名）
check.js           样式表静态校验
selftest.js        校验器自检
src/               worker 源码与 WebGL 描边器（构建脚本从这里生成内嵌字符串）
scripts/           worker / 音效构建脚本
test/              渲染、设置、配色与性能测试
docs/              设计、功能、工程与测试文档（上游撰写）
sounds/            提示音（由 lib/tone.js 合成，非二进制素材）
```

## 归属与许可

- **上游**：[`ymh0000123/dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield)，MIT，Copyright (c) 2026 ymh0000123。本仓库基线为其 **1.1.5**（提交 `82655a0`）。
- **上游内嵌贡献者**：`higekibaka` —— GPU 描边绘制器（源自 Endfield Glass）、Worker/WebGL 渲染器、磨砂玻璃、等高线性能优化。
- **本 fork**：Copyright (c) 2026 SkillyNotFound。
- 完整归属、商标与素材声明见 [`NOTICE.md`](NOTICE.md)。

## 免责声明

非官方同人作品，与**鹰角网络（Hypergryph）**及**上游作者**均无隶属、赞助或背书关系。《明日方舟：终末地》的名称、标识、商标、官网视觉与设计语言归鹰角网络所有，**不在 MIT 覆盖范围内**。若权利方认为任何素材使用不当，请通过 Issue 联系，我们会立即删除或替换。
