# KeepXClean

KeepXClean 是面向 X（Twitter）的信息流与评论区过滤扩展，使用 WXT、React 和共享规则引擎，社区服务使用 Cloudflare Workers、D1 与 R2。

## 浅色 UI

新 UI 代码已完成：五个设置页面、400px 插件弹窗、X 页面内的设置抽屉、快捷净空、折叠提示及主页标签。品牌统一采用浅绿纯色底的黑钛 X，不使用保护圈。

- [实现方案](design/ui-light-v1/implementation-plan.md)
- [实现与验收记录](design/ui-light-v1/verification/README.md)
- [实际界面截图](design/ui-light-v1/verification/index.html)
- [原设计稿](design/ui-light-v1/index.html)
- [图标与全部尺寸](design/ui-light-v1/icon-concepts/official-x/selected-black-titanium/README.md)

## 功能与行为

- 七类规则：历史日均与观察窗口频率、社区记录、关键词与正则、蓝标回复、标签数量、账号质量、推广广告。提供轻度、标准、极致三档预设及关注账号、主页场景豁免。
- 隐藏与折叠两种模式。过滤使用已收到的 X GraphQL 数据，不额外请求账号资料。已经从响应中剔除的内容需要刷新 X 才能重新加载。
- 自定义关键词支持正文、简介、昵称和链接范围、粉丝豁免及备注；公共词库单独控制、只读。
- 黑白名单使用数字 UID；从 X 导入时先读取完整分页、展示重复及白名单冲突，再确认本地保存。社区共享单独选择，超过 500 个账号分批提交。
- 快捷净空先保存本地，提供 **4.5 秒撤销窗口**；窗口结束后按偏好执行 X 原生拉黑与社区提交，三阶段结果分别显示。撤销只恢复本次本地改动，不会误解除既有 X 拉黑。
- 外部结果可能是成功、失败、未计入或未确认；不会用本地保存成功冒充外部成功。明确失败可手动重试，未知结果不盲目重试。
- 拦截记录保留最近 200 条；今日按本地日期统计，累计独立保存。规则详情显示拦截当时的证据，旧记录缺失的证据不会补造。
- JSON 配置导入有校验与差异预览，保存使用后台串行语义命令，避免多入口覆盖无关字段。首次升级保留原配置备份。
- 社区快照失败时继续使用可用缓存；自定义 HTTPS 服务需授权，失败不转发到其他服务。社区计数来自快照，不代表已经核实的身份或风险。

## 本地开发

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`pnpm test` 包括 shared、extension 和 server；服务端测试使用 Miniflare 的本地 D1/R2。

```bash
pnpm dev:ext
pnpm --filter @keepxclean/extension zip
```

构建目录为 `apps/extension/.output/chrome-mv3`。在 Chromium 浏览器的扩展管理页启用开发者模式，选择“加载已解压的扩展程序”后加载此目录，再刷新 X 页面。开发模式目录为 `apps/extension/.output/chrome-mv3-dev`。

## UI 验收宿主

```bash
pnpm --filter @keepxclean/extension preview:ui
```

打开 `http://127.0.0.1:5178/`。此宿主运行生产 UI 组件，使用独立模拟存储与接口，便于复现空态、失败和布局；不包含在扩展生产包中。

- `/?surface=options#/rules`：完整设置，可切换 `keywords`、`accounts`、`history`、`preferences`。
- `/?surface=popup`：插件弹窗。
- `/?surface=x&theme=dark`：深色 X DOM 样本；不传 `theme` 为浅色。
- `state=empty|paused|offline|loading|error|native-error`：状态样本。
- `/responsive.html?width=390#/rules`：实际 iframe 视口，可改为 768、1024、1440。

截图与宿主检查不能替代真实扩展的权限、X 接口及浏览器生命周期验证。当前真实 X 联调尚未完成，详见验收记录。

## 项目结构

```text
packages/shared/       规则、GraphQL 解析、类型与默认配置
apps/extension/
  entrypoints/         background、MAIN/content、设置与弹窗入口
  src/background/      串行配置仓储、快照、可恢复操作与导入任务
  src/services/        命令契约、完整校验、客户端
  src/state/           多入口共享状态订阅
  src/ui/              浅色变量与公共组件
  src/features/        五个设置页面及快捷控制
  src/content/         Shadow DOM、Portal、页面节点管理与 MAIN 桥
  tests/               失败边界测试与本地 UI 宿主
apps/server/           Workers API、D1 原子聚合与 R2 快照
```

## 社区服务开发与部署

```bash
pnpm db:migrate:local
pnpm dev:server
```

生产部署需要先配置 `apps/server/wrangler.toml` 中的 D1、R2 和域名。配置完成后可使用 `pnpm db:migrate:remote`、`pnpm deploy:server`。本次实现没有部署生产服务或发布扩展商店。

服务端将每个目标与提交者的记录去重，并在 D1 事务中重算聚合，避免重试、并发或标签修改造成累加漂移。当前提交者标识和账号资料由客户端提供，未实现服务端身份认证；不要将其描述为已验证的防刷票身份系统。
