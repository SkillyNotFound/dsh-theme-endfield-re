# 音频通知（fork 增量）— 实现说明

本文件描述 `dsh-theme-endfield` 这个工作树相对上游 `b3e60dc` 新增的**音频通知**功能。
上游原版的说明在 `README.md`（主题本身的用法）。

> 播报词（Terminal 语音文案）见工作区外层的 `endfield-audio-voice-lines.md`；
> 试玩与还原步骤见 `endfield-audio-tryout.md`。

---

## 1. 它做什么

在四个**真实发生**的时刻各播一声，声音由**宿主进程**播放（不是浏览器），因此页面最小化、切到别的应用、甚至关掉标签页都还能听见。
出厂音：`boot` 是代码算出来的合成音，其余四个槽位随包发布录音（4.4–6.4 秒），见 §5。

| 槽位 | 时刻 | 判据 |
| --- | --- | --- |
| `boot` | 页面加载播放 ENDFIELD 启动加载板 | 客户端在 `runLoader()` 里报告一次，**每次页面加载只报一次**（点「预览」重播不报） |
| `turn-start` | 用户从会话框提交指令 | 宿主 `agent/inbox/claimed`，且消息带**会话框提交凭据**（`source.rpcId`）且发起者是根 agent |
| `turn-done` | 助手产出最终结果 | 宿主 `agent/turn-stopping`，且该回合最后一条助手消息**含可见文本** |
| `attention` | **出现需要人点一下的确认框** | 客户端观察界面上的三个面板（见下），或宿主侧的 `approval/request` / `user-questions/request` 瀑布 |
| `turn-fail` | ⛔ **不接任何事件** | 故意的：不需要人工干预的错误保持静音 |

## 2. 为什么 `attention` 要观察界面

在**本部署**里，`ask_user_question` 由 harness 提供，**不在 profile 的插件栈里**（`dsh-tool-ask-user` 未被组合），
因此 `ctx.userQuestions.ask()` 从不执行、`user-questions/request` 瀑布从不派发。

实测证据：确认框在屏幕上并被回答的同时，宿主的 `question` 计数**始终为 0**。

所以改成从界面观察——它不关心是谁发起的，只要"需要你点一下"的东西出现就算。
宿主侧那两条瀑布监听**仍然保留**（在真实 dsh profile 里它们是对的），两条路都汇到同一个槽位，
宿主侧防抖会把重复上报合并成一声。

**锚点只用面板专属的 data 属性，不用类名**：

| 面板 | 锚点 |
| --- | --- |
| 审批 | `[data-approval-key]` |
| 计划求批 | `[data-plan-review-key]` |
| 提问 | `[data-question-key]` |

> 类名方案试过并已废弃：`[class*='_card']` 在已安装的客户端包里命中 **15 个**不同组件、`[class*='_frame']` 命中 **8 个**，
> 打开任意一张卡片都会误响。现在有一条测试断言**任何锚点都不得包含 `class`**。

检测方式：`MutationObserver` 即时触发 + 合并到下一帧；**1000ms 轮询作为兜底**
（观察者若绑定在被替换的容器上会静默失效，轮询不会）。

## 3. 防噪规则

- **同一槽位 2.5 秒防抖**（`audioDebounceMs`），由宿主独家裁决；
- **仅根 agent**：子代理、后台驱动不单独发声；
- **边沿触发**：确认框一直开着不会反复响；
- 流式输出、每次工具调用、状态栏变化一律不响。

## 4. 配置

设置页 **设置 › 终末地主题设置 › 05 音频**（字段在 `dsh-theme-endfield` 命名空间；0.1.7 起持久化在 profile 的 `cordis.patch.yml`，旧版宿主回落 `<dshHome>/settings.yaml`）：

**总开关 `audioEnabled` 默认开启**：出厂即出声，无需手动选择加入。
各槽位开关（同样默认开启）决定具体哪几种情形响；只想留一两种时逐个关掉，或者关掉总开关一次静音。

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `audioEnabled` | `'1'` | 总开关（**默认开启**，可一次静音） |
| `audioVolume` | `'100'` | 音量，对 PCM 采样缩放，**不改系统音量** |
| `audioTurnStart` | `'1'` | 任务开始音 |
| `audioTurnDone` | `'1'` | 任务结束音 |
| `audioAttention` | `'1'` | 需要你回应 |
| `audioTurnFail` | `'1'` | 出错音（**不接事件**） |
| `audioHumanOnly` | `'1'` | 开始音只认会话框提交（关掉=宽松模式，调试用） |
| `audioBoot` | `'1'` | 启动加载动画音 |
| `audioDiag` | `'0'` | 诊断日志（宿主控制台 + `/state`） |
| `audioDebounceMs` | `'2500'` | 同槽位最小间隔（无设置行） |
| `audioSoundDir` | `''` | 自定义音效目录（**设置行暂时移除**，字段与宿主解析逻辑保留） |

设置页的行序与上表一致：总开关 → 音量 → 四个槽位 → 开始音仅认会话框 → 启动加载动画音 → 诊断日志。
四个槽位行都是「开启 / 关闭 + 试听」的同一套控件，`audioTurnFail` 也不例外；它的行文案直说该槽位目前没有事件接线。

> **当前音源 / 自定义音效目录两行已删除**（2025 整理设置页时移除，因为自定义音效暂不支持）。
> `audioSoundDir` 字段还在 schema 里，宿主侧仍然按「自定义目录 → 工作区 → 桌面 → 内置音」解析，
> 所以把行加回来就能立刻用；在那之前设置页不请求 `/theme-endfield/audio/state`。

## 5. 出厂音效与自定义覆盖

解析顺序（第一处命中即用）：

**自定义目录 → 工作区根目录 → 桌面 → 内置 `sounds/`**

**每个槽位只认一个文件名，由 `lib/slots.js` 的 `file` 字段声明**，解析器读的是它而不是 `<slot>.wav`：

| 槽位 | 文件名 |
| --- | --- |
| `boot` 启动加载动画音 | `boot.wav` |
| `turn-start` 任务开始音 | `start.wav` |
| `turn-done` 任务结束音 | `end.wav` |
| `attention` 需要你回应 | `wait.wav` |
| `turn-fail` 出错提示音 | `erro.wav` |

把同名的 wav 放进上面任意一个靠前的目录即可覆盖内置音（自定义/工作区/桌面三处都用同一个名字 ——
一个槽位两个名字正是「我放的文件没反应」这类问题的来源）。**改名要改 `lib/slots.js` 的 `file`，不要改文件**：
解析、打包校验与测试都从那张表读名字。

要求 **16-bit PCM WAV**（音量缩放只认 8 / 16-bit PCM，其他位深会被原样播放 —— 音量滑块对它无效），
单声道或立体声，采样率不限（内置录音 48 kHz、合成音 44.1 kHz，播放器两者都吃）。
**没有时长上限**：同一槽位「上一声还在响」的窗口由文件自身时长 + 250 ms 推出（`lib/audio.js` 的
`playUntil`），所以一条 6 秒的语音不会被下一声截断，代价是同一槽位约 6 秒内不会再响。

### 出厂自带的五个音

| 槽位 | 出厂音 | 来源 |
| --- | --- | --- |
| `boot` 启动加载动画音 | 0.95 s 合成音（G4 → D5 → G5 上行） | `lib/tone.js` 按 `lib/slots.js` 的音符定义**算出来** |
| `turn-start` 任务开始音 | 5.88 s 录音 | `sounds/start.wav`（随包发布的录音） |
| `turn-done` 任务结束音 | 6.44 s 录音 | `sounds/end.wav` |
| `attention` 需要你回应 | 6.16 s 录音 | `sounds/wait.wav` |
| `turn-fail` 出错提示音 | 4.36 s 录音 | `sounds/erro.wav` |

四个录音都是 **48 kHz / 16-bit PCM / 立体声**。随包发布的这一版实测峰值 −13.6 ~ −9.7 dBFS，
比合成音（−3 dBFS）低约 8–10 dB：**同一音量下滑块对这四个槽位更「轻」**，要齐平可以把音量推到 100
或自行归一化后再替换文件。
`lib/slots.js` 用 `shipped: 'recorded' | 'tone'` 标明每个槽位的出厂音属于哪一类。

### 重新生成 / 校验

```bash
node scripts/build-sounds.js          # 只重新生成 shipped: 'tone' 的槽位
node scripts/build-sounds.js --check  # 合成音与定义一致 + 录音文件在且是可播放的 16-bit PCM
```

**录音槽位永远不会被脚本覆盖**：`build-sounds.js` 对它们只做存在性与格式校验。把录音换成合成音等于
悄悄换掉出厂默认，所以那条路被刻意堵住了；要换录音就直接按上表的文件名替换 `sounds/` 里的对应文件。

## 6. 桥接路由（宿主提供，页面调用）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/theme-endfield/audio/state` | 槽位快照、解析到的文件、计数、诊断环形日志 |
| `GET`/`POST` | `/theme-endfield/audio/preview?slot=<id>` | 试听：**强制播放**（跳过防抖），但仍尊重槽位开关 |
| `POST` | `/theme-endfield/audio/attention` | 页面报告"看到确认框了"：**不强制**，尊重开关/音量/防抖 |

## 7. 平台与性能

| 平台 | 播放器 |
| --- | --- |
| Windows | `pwsh.exe` → `powershell.exe`（`-EncodedCommand` + `Media.SoundPlayer`） |
| macOS | `afplay` |
| Linux | `paplay` → `aplay` |

**实测（同一台开发机，已扣除音频时长）**：`powershell.exe` 5.1 启动 **0.55–0.8 s**；
`pwsh` 7.6.6（MSI 版）**0.92–0.96 s**；`pwsh` 7（Store 版）**约 1.33 s**。
即 **PowerShell 7 反而更慢**，`playerCommands()` 的回退顺序在只有 5.1 的机器上正好落到最快的那个。
要再压缩只能上"常驻播放器"，收益（约 0.6 s）不值得其复杂度与静默失效风险。

## 8. 不要碰 `tools/execute`

`tools/execute` 是 **waterfall**（`dsh-tools`: `await this.ctx.waterfall(carrier, 'tools/execute', mutableExec, () => this.dispatchToolBody(mutableExec))`）。
一个"检查参数后直接 `return`"的监听器**不调用 `next()`** 就等于宣布"这次工具调用没有结果"：
工具体不执行，失败以空结果回传，**会话里所有后续工具调用都会坏**（表现为 `Cannot read properties of undefined (reading 'isError')`）。

本插件因此**不监听**该事件，并有结构性断言守着：`the plugin never subscribes to the tools/execute waterfall`。

## 9. 测试

```bash
node test/audio-notify.test.js          # 宿主半边：判据、门控、防抖、降级、路由
node test/audio-attention-watch.test.js # 客户端：锚点、即时检测、边沿、开关
node scripts/build-sounds.js --check    # 合成音与定义一致 + 四个录音出厂音可播放
```

`test/audio-notify.test.js` 覆盖的关键断言：会话框凭据判定、只有"含可见文本的回合"才播结束音、
子代理不响、开关与音量 0 静音、无 `subprocess` 时静默降级、自定义文件覆盖、音量缩放走缓存副本、
**五个出厂音齐备（合成音逐字节对照定义，四个录音逐个解析为 16-bit PCM）**、
以及 `agent/error` **必须不发声**（用户的规则：不需要人工干预的错误静音）。
