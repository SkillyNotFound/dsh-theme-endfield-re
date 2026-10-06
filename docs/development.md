# 开发与部署

本文件描述在本机迭代这个主题的完整闭环，以及几个会影响流程的环境事实。

## 闭环

```bash
# 1. 改代码（源码只有一份：本仓库）
#    client.js / index.js / lib/ / cordis.patch.yml …

# 2. 跑闸门
npm test            # 静态门 + 浏览器测试（需要本机 Chrome/Edge）
npm run check       # 只跑静态门：check.js + worker 构建校验

# 3. 部署到运行中的 profile
npm run deploy:check    # 先看差了多少，不写入
npm run deploy          # 按 package.json 的 files 集合镜像过去

# 4. 完全退出并重启 DSH（刷新页面不够，见下）
```

`npm run deploy` 复制的是**包自己声明的 `files` 集合**，也就是一次真实安装会装的那些文件，而不是「工作目录里恰好有什么」。复制完它会逐文件比对哈希，确认落盘无误。

### 为什么必须有这一步

两件事叠在一起：

1. **桌面 profile 只能由 Electron 应用管理。** `dsh plugin --profile desktop …` 会被直接拒绝（`profile "desktop" is managed exclusively by the Electron application`），所以不能用 CLI 重装。
2. **应用装的是副本，不是链接。** `profiles/desktop/node_modules/dsh-theme-endfield-re` 是一个真实目录（`LinkType` 为空），不是 junction/symlink。改仓库不会影响它。

再加上宿主会**快照每个插件的 `client.js`** 并以 immutable 缓存下发，所以任何改动都只有一条路到达页面：写进 profile，然后**整个进程重启**。只刷新页面时，跑的仍是启动时那份 Host 代码。

> `npm run deploy` 是开发捷径，不是分发路径：它让 profile 清单仍指向固定的 commit，而磁盘上的文件更新。下一次由应用驱动的更新会覆盖它。这是刻意的取舍——换来的是一条命令的迭代循环，而发布路径仍是 `git push` + 在插件管理器里更新。

## CI

`.github/workflows/ci.yml` 三个 job：

| job | 内容 | 阻塞 |
| --- | --- | --- |
| 静态检查 | 语法解析、样式表护栏、行尾空白、`cordis.patch.yml` 结构、`package.json` 自洽 | 是 |
| 测试套件（19 项） | `check.js` + 测试子集 | 是 |
| 性能与覆盖率 | `contour-perf`、`contour-coverage` | 否 |

`.github/scripts/check-patch-yml.js` 曾经**硬编码**上游包名 `dsh-theme-endfield`，而本仓库的行是 `dsh-theme-endfield-re`，于是改名之后每一次推送这个 job 都是红的——而测试套件本身全绿，所以看起来像代码问题。现在它从 `package.json` 读包名。**凡是从上游继承、又断言名字的东西，都要按这个方式改成派生。**

## 版本号

本仓库使用**自己的**版本号，与上游的 `1.x` 序列无关。当前 `2.1.0` 是自有序列的起点。

| 段 | 何时递增 |
| --- | --- |
| MAJOR | 改变设置命名空间、rowId 或包名，或需要用户重新配置的改动 |
| MINOR | 新增功能或设置项（例如「中央散景」） |
| PATCH | 修复、参数调整、文档 |

起点选 `2.0.0` 而不是 `1.0.0` 有两个原因：它与上游的 `1.x` 明确分开；同时**在 semver 顺序上严格大于**改名时用过的 `1.1.5-re.1`——版本号只降不升，会让插件的「可更新」判断把一次正常升级读成降级。

改动后只需更新 `package.json` 的 `version`（全仓库只此一处引用）。市场条目的 `install.version` 由市场 CI 在补全时从 `package.json` 读取，不需要手工改。

## 与皮肤市场的关系

市场条目是**薄条目**，`install.commit` 由市场 CI 在补全时钉住。也就是说：

- 往本仓库推新提交 → 市场那边的自动化（`chore(skins): update automated registry`）会重新钉版本，不需要你改条目。
- 只有在**换仓库、换 rowId、换包名**时才需要新的市场 PR。

市场插件的目录来自 `raw.githubusercontent.com`，本机上该域名不可达；相关的本地权宜脚本在 `~/.dsh/dev-tools/market/`。

## 已知的待办与判断

- **profile 里仍装着上游的 `dsh-theme-endfield`**（`dependencies` 里有、`dsh.profile.bundles` 里没有），即已安装但未挂载。清理它要在应用的插件管理器里操作，不能走 CLI。
- **本仓库落后上游 20 个提交。** 上游 1.1.9 修掉了若干本仓库仍存在的问题（例如 `contour-specks` 的 `CONTOUR_MIN_INK` 覆盖度加固）。是否跟进是独立决定：上游的取向与本仓库已经分叉（例如上游把 `_heroGlow` 保留为自愈钩子，本仓库主动重画）。
- **`中央散景` 与 `worker-webgl` 后端互斥**，这是设计而非缺陷：该 pass 需要主线程 canvas，选中等同于声明 worker 不合法。相关推导在 `bokehNeedsMainThread`。
