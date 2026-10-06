# 归属、商标与素材声明

本文件是 [`README.md`](README.md) 中「归属与许可」一节的完整版。

## 1. 上游项目

| 项 | 内容 |
| --- | --- |
| 项目 | `dsh-theme-endfield` |
| 仓库 | https://github.com/ymh0000123/dsh-theme-endfield |
| 许可 | MIT License |
| 版权 | Copyright (c) 2026 ymh0000123 |
| **本 fork 的基线** | **1.1.5**，提交 `82655a0`（2026-09-25） |

上游的 MIT 许可正文已逐字保留在 [`LICENSE`](LICENSE) 中，另加了一行本 fork 的版权署名。保留上游版权行是 MIT 的硬性要求，不得删除或修改。

`LICENSE` 只覆盖**代码**。它**不**覆盖第 3 节说明的《明日方舟：终末地》同人元素与商标 —— 那部分权利归鹰角网络所有。

## 2. 上游内嵌的第三方贡献

`higekibaka` 是上游的**实际贡献者**（GitHub [@higekibaka](https://github.com/higekibaka)），不是仅有一行署名的名义来源。其在上游仓库中的提交包括：

| 提交 | 内容 |
| --- | --- |
| `7a1525b` | feat: add optional Worker and WebGL contour renderer |
| `59277a2` | feat: add optional frosted glass and distinguish table selection |
| `7fe1a4f` | perf: skip contour regions using exact row-block bounds |

此外 `client.js` 的内嵌 worker 字符串里带有：

- `/* MIT; original terrain Copyright (c) 2026 ymh0000123. */`
- `/* MIT; contributed by higekibaka. GPU stroke painter from Endfield Glass. */`

两处都位于 `CONTOUR_WORKER_SOURCE` 内部，由 `scripts/build-contour-worker.js` 从 `src/contour-worker.js` 生成，上游的 `--check` 门会校验字节一致。

**已实测确认**：`higekibaka` 在**未打补丁的上游 1.1.5** 原版 `client.js` 中出现 1 次，不是本 fork 引入的署名。若你进一步修改该绘制器，请保留这些注释。

## 3. 《明日方舟：终末地》相关素材 —— 不在 MIT 覆盖范围内

本主题是**非官方同人作品**，与**鹰角网络（上海鹰角网络科技有限公司，Hypergryph Network Technology）**不存在任何隶属、赞助或背书关系。

- 《明日方舟：终末地》（Arknights: Endfield）的游戏名称、标识、商标、官网视觉与设计语言及相关美术素材，版权归**鹰角网络**所有。
- 主题中还原的 `ENDFIELD` 字标、信号黄配色与工业编辑风版式，源自或参考上述作品及其官网（https://endfield.hypergryph.com），**仅用于学习、展示与非商业用途**，其权利仍归鹰角网络所有。
- `assets/` 下的界面截图继承上游的同一立场：它们是本主题运行时的界面截图，其中的品牌视觉元素仍归鹰角网络。
- 若权利方认为任何素材使用不当，请通过 Issue 联系，我们会立即删除或替换相关内容。

### 本仓库实际包含的素材

| 类型 | 情况 |
| --- | --- |
| 等高线 | 程序化标量场（高斯凸起之和 + 长波正弦，marching squares 取等值线），**不是贴图** |
| 音频 `sounds/*.wav` | `boot.wav` 由 `lib/tone.js` 按 `lib/slots.js` 的音符定义**计算生成**；其余 4 个槽位（任务开始 / 任务结束 / 需要你回应 / 出错）随包发布**自备录音**（48 kHz / 16-bit PCM / 立体声），其来源与授权由本 fork 作者负责 |
| 字体 | 不打包任何字体文件 |
| 品牌字标 | 由 CSS `content`（`::before`）绘制，仓库中不含其图像文件 |
| `assets/` | 2 张本主题的界面截图，继承上游声明（见上） |

**除 `sounds/` 下那 4 个自备录音外，本仓库不含任何游戏美术或游戏音频文件。**

## 4. 本 fork

| 项 | 内容 |
| --- | --- |
| 仓库 | https://github.com/SkillyNotFound/dsh-theme-endfield-re |
| 版权 | Copyright (c) 2026 SkillyNotFound |
| 许可 | MIT（与上游一致） |
| 相对基线的改动 | 中央散景（新功能）、DSH 0.2.0-rc.2 hero 兼容修复、新增 `.gitattributes` |

## 5. 商标与背书

- 不得暗示上游作者 `ymh0000123`、`higekibaka` 或鹰角网络**为本 fork 背书、参与或认可**。
- 不得使用上游项目名或游戏名作为自己项目的商标。
- 描述本仓库时请说明「**非官方**」「**基于上游 1.1.5 的 fork**」。

## 6. 分发时的红线

- ❌ 不要删除或改写 `LICENSE` 里的上游版权行。
- ❌ 不要删除 `client.js` / `src/` 里 `ymh0000123` 与 `higekibaka` 的署名注释。
- ❌ 不要加入游戏截图、官网图片、游戏音频、鹰角字体文件。
- ❌ 不要声称这是「官方」或「上游认可」的版本。
- ✅ 可以公开分发、允许他人再分发、甚至商用其中的**代码**。
- ✅ 可以署名自己的改动。
