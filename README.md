# KeepXClean

KeepXClean 是面向 X（Twitter）的信息流与评论区高信噪比过滤扩展，采用 WXT（Manifest V3）、React 与共享确定性规则引擎构建；官方网站与社区快照服务基于 Cloudflare Workers、D1 与 R2 部署。

- **官方网站**：https://keepxclean.com
- **隐私政策**：https://keepxclean.com/privacy/
- **公共快照接口**：`https://api.keepxclean.com/v1/snapshot.json` · `https://cdn.keepxclean.com/v1/snapshot.json`
- **Chrome Web Store 提审指南与素材**：[SUBMISSION_GUIDE.md](release/chrome-web-store/SUBMISSION_GUIDE.md)

## 浅色 UI 与品牌规范

全局统一采用浅色背景（`#F7F9F8` / `#FFFFFF`），覆盖五个完整设置页面、400px 插件弹窗，以及 X 页面内的设置抽屉、快捷净空按钮、单行折叠提示与个人主页标签。品牌图标统一采用浅绿纯色圆角底（`#EAF6EF`）配黑钛 X，不添加保护圈、光弧或盾牌。

- [实现方案](design/ui-light-v1/implementation-plan.md)
- [实现与验收记录](design/ui-light-v1/verification/README.md)
- [图标与全部尺寸规范](design/ui-light-v1/icon-concepts/official-x/selected-black-titanium/README.md)

## 核心功能与行为

- **九类确定性过滤维度**：
  1. 评论区防灌水与防高仿（极短水评、蓝标水军回复、低粉简介导流、原推主高仿识别）
  2. 口令引流与互动乞讨拦截（评论领资料、抽奖转发诱导、互关互赞车队）
  3. 高频刷屏拦截（历史日均发推上限 + 观察窗口短期爆发上限）
  4. 社区高危名单（基于公开快照聚合举报数阈值）
  5. 自定义关键词与正则（支持正文、简介、昵称、外链范围，支持仅评论区生效与粉丝数豁免）
  6. 公共词库包（内置烂梗套话、币圈喊单、互关车队、黑灰产导流、黄赌毒广告五大分类共 24 条规则；默认无粉丝豁免，支持逐条独立开关与一键“复制自定义”）
  7. 推文语言过滤（支持黑名单屏蔽指定语种或白名单仅保留指定语种）
  8. 标签与代币符号堆砌过滤（`#hashtag` / `$cashtag` 数量上限）
  9. 账号质量信号与推广广告净空（新注册低质默认头像号识别、推广流无痕移除）
- **三档预设与豁免机制**：提供轻度、标准、极致三档预设，支持已关注账号豁免与个人主页场景保护。
- **隐藏与折叠双模式**：过滤直接作用于页面收到的 X GraphQL 响应，零额外账号资料请求；折叠模式下若因转发/引用内容命中规则，操作按钮精准指向被转引的目标账号。
- **数字 UID 名单与安全导入**：黑白名单基于永久数字 UID 存储；从 X 导入拉黑名单时完整读取分页、检测重复与白名单冲突，确认后再保存，超过 500 个账号自动分批处理。
- **快捷净空与 4.5 秒撤销窗口**：先保存本地并提供 **4.5 秒撤销窗口**；窗口结束后按用户偏好执行 X 原生拉黑与匿名社区提交，三阶段结果独立真实呈现（成功 / 失败 / 未计入 / 未确认），撤销绝不误解除既有 X 拉黑。
- **拦截记录与配置备份**：本地保留最近 200 条真实命中证据；JSON 配置导入具备完整 Schema 校验与差异预览，后台串行命令写入避免多入口并发覆盖。
- **10 种界面语言**：内置 `en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`es`、`pt`、`fr`、`de`、`ru` 完整多语言字典与浏览器语言自动跟随，非 UI 后台与 MAIN 世界脚本与 React 字典解耦以保持轻量体积。

## 本地开发与打包

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 覆盖 `shared`、`extension` 与 `server`（服务端测试基于 Miniflare 本地 D1/R2）。

```bash
pnpm dev:ext
pnpm --filter @keepxclean/extension zip
```

- 解压调试目录：`apps/extension/.output/chrome-mv3`（开发模式为 `chrome-mv3-dev`）
- 商店发布压缩包：`apps/extension/.output/keepxcleanextension-0.1.0-chrome.zip`

## UI 预览宿主

```bash
pnpm --filter @keepxclean/extension preview:ui
```

打开 `http://127.0.0.1:5178/`（仅用于本地视觉调优与截图采集，不包含在生产扩展包中）：

- `/?surface=options&lang=en#/rules`：完整设置页（可切换 `keywords`、`accounts`、`history`、`preferences` 及 `lang=zh-CN` 等语种）
- `/?surface=popup&lang=en`：插件弹窗
- `/?surface=x&lang=en`：X 页面内嵌折叠条、快捷按钮与浅色设置抽屉宿主

## 项目结构

```text
packages/shared/            过滤引擎、GraphQL 解析、公共词库预设、类型与默认配置
apps/extension/
  entrypoints/              background、MAIN/content 桥接、options 与 popup 入口
  src/background/           串行配置仓储、快照拉取、可恢复净空与导入任务
  src/i18n/                 10 语种界面词典、轻量错误文案与语言解析
  src/services/             命令契约、Schema 校验与消息客户端
  src/state/                多入口共享响应式状态订阅
  src/ui/                   浅色设计系统变量与公共组件
  src/features/             五个设置功能模块与快捷控制面板
  src/content/              Shadow DOM 样式隔离、Portal 挂载与 MAIN 桥接
  tests/                    单元测试、失败边界测试与本地 UI 预览宿主
apps/server/                Cloudflare Workers API/CDN、D1 原子聚合与 R2 快照缓存
apps/web/                   官方网站 (keepxclean.com) 与隐私政策静态站点 Worker
release/chrome-web-store/   Chrome Web Store 提审指南、1280x800 截图与 440x280 宣传图
```

## 云端服务与官网部署

### GitHub Actions 推送自动部署

仓库内置 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)，推送至 `main` 分支或推送 `v*` 版本标签时自动运行：

1. **全量质量门禁（`verify`）**：执行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test` 及 `wxt zip`，并将构建好的扩展包上传为 Actions Artifact。
2. **服务端按需部署（`deploy-server`）**：当 `apps/server/`、`packages/shared/` 或依赖配置变更时，自动执行 `pnpm db:migrate:remote` 与 `pnpm deploy:server`，并预热刷新线上 `snapshot.json`。
3. **官网按需部署（`deploy-web`）**：当 `apps/web/` 变更时，自动执行 `pnpm deploy:web` 并校验 `keepxclean.com` 与 `/privacy/` 在线可用性。
4. **版本发布（`release-extension`）**：推送 `v*` 标签（如 `git tag v0.1.0 && git push origin v0.1.0`）时，自动创建 GitHub Release 附带扩展 `.zip`；若配置了可选的 `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN`，还会自动上传并发布到 Chrome Web Store（`plngcinmibjmkjjpfjemhfabjfjjkhhd`）。

**GitHub Actions 必需 Secret**：
- `CLOUDFLARE_API_TOKEN`：具备所属账号 `Workers Scripts: Edit`、`D1: Edit` 以及 `keepxclean.com` 站点 `Workers Routes: Edit` 权限的 Cloudflare API Token。

### 手动命令

```bash
# 本地 D1 迁移与服务端开发
pnpm db:migrate:local
pnpm dev:server

# 远端 D1 迁移与生产环境部署
CI=1 pnpm db:migrate:remote
pnpm deploy:server
pnpm deploy:web
```

服务端对同一目标与提交者哈希（SHA-256）去重，并在 D1 事务中重算聚合计数，通过 R2 与定时任务发布静态 `snapshot.json`。社区计数代表公开快照聚合结果，客户端提交不依赖账号登录态。
