---
name: keepxclean-release
description: >-
  Use this skill whenever the user asks to release, bump versions, publish, or verify a new version
  of KeepXClean, update Chrome Web Store listing copy/screenshots/privacy justifications, push cloud
  keyword hotfixes, or rotate Chrome Web Store API OAuth credentials.
---

# KeepXClean 发版与商店同步指南

## 固定标识与线上基线

- **Chrome Web Store Extension ID**: `plngcinmibjmkjjpfjemhfabjfjjkhhd`
- **Chrome Web Store Publisher ID**: `58be1080-a518-4def-972f-dda8f7db70a4`
- **Google Cloud OAuth 项目**: `keepxclean`（Google Auth Platform 设为「正式版」，Refresh Token 永久有效）
- **GitHub Actions 已配置密钥**: `CLOUDFLARE_API_TOKEN`、`CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN`
- **线上核验端点**:
  - 官网与双语隐私页：`https://keepxclean.com` · `https://keepxclean.com/privacy/`
  - 快照与统计接口：`https://api.keepxclean.com/v1/snapshot.json` · `https://cdn.keepxclean.com/v1/snapshot.json`

---

## 场景 A：常规版本自动发版（不改商店后台表单）

适用于功能迭代、规则优化、Bug 修复及 `_locales/*/messages.json` 标题/简短摘要调整：

1. **原子同步版本号**
   运行 [scripts/release.ts](../../../scripts/release.ts) 同步全仓 5 个 `package.json`、[config.ts](../../../apps/web/src/config.ts)、10 语种官网发布徽标/CTA、测试断言与 [SUBMISSION_GUIDE.md](../../../release/chrome-web-store/SUBMISSION_GUIDE.md)（不会误改历史特性徽标如 `New in v0.2.0`）：
   ```bash
   pnpm release:bump <X.Y.Z>
   ```
   > 若非交互式 Shell 未加载全局 `pnpm`，使用 `corepack pnpm`（或在临时 `PATH` 中挂载 `exec corepack pnpm "$@"` 垫片以支持子进程 `pnpm -r`）。

2. **补齐更新日志**
   编辑 [CHANGELOG.md](../../../CHANGELOG.md) 顶部的 `## [<X.Y.Z>] - YYYY-MM-DD` 章节。CI 会自动抽取该章节正文并附带构建包 SHA-256 写入 GitHub Release。

3. **本地质量门禁**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm --filter @keepxclean/extension zip && pnpm --filter @keepxclean/extension build:firefox && pnpm test:browser && pnpm --filter @keepxclean/web build
   ```

4. **提交并推送标签触发全自动发版**
   ```bash
   git add -A && git commit -m "feat(release): ship KeepXClean v<X.Y.Z>"
   git tag v<X.Y.Z> && git push origin main --tags
   ```

5. **CI 与线上核验**
   - 用 `gh run list -b v<X.Y.Z> -L 1` / `gh run view <runId>` 确认四项任务全部成功：`verify`、`deploy-server`、`deploy-web`、`release-extension`（`chrome-webstore-upload-cli@4` 自动上传 `.zip` 并提交审核、过审后 100% 自动发布）。
   - 用 `gh release view v<X.Y.Z>` 核验 GitHub Release 正文与 `.zip` 附件，并抽检线上 `keepxclean.com` 与 `cdn.keepxclean.com/v1/snapshot.json`。

---

## 场景 B：大版本 Chrome Web Store 后台元数据同步

Google 官方 Chrome Web Store API v2 **不提供**修改长详情描述、截图、权限理由、隐私披露勾选与测试说明的接口。当这些内容发生变更时：

1. **先更新仓库源文案**
   - 10 语种详情描述：[release/chrome-web-store/creative/descriptions/](../../../release/chrome-web-store/creative/descriptions)
   - 权限理由与隐私问卷对照：[release/chrome-web-store/SUBMISSION_GUIDE.md](../../../release/chrome-web-store/SUBMISSION_GUIDE.md)
   - **截图策略**：若仅文案调整，默认**保留已过审的 50 张本地化截图与宣传图不变**以加快审核；若确需重拍，须使用透明底 `shield-x-v1` 品牌资产并导出 `1280×800` 无 alpha RGB PNG（见 [creative/README.md](../../../release/chrome-web-store/creative/README.md)）。

2. **通过 `ego-browser` 同步开发者后台**
   后台基础路径：`https://chrome.google.com/webstore/devconsole/58be1080-a518-4def-972f-dda8f7db70a4/plngcinmibjmkjjpfjemhfabjfjjkhhd`（若跳至 Google 登录页，立即调用 `await task.handOff()` 请用户登录，切勿自行猜测账号或切换 Profile）：
   - **软件包核验（`/edit/package`）**：若走手动上传，上传完成后 CWS 会自动重定向至 `/edit`；需重新打开 `/edit/package` 确认「草稿」表版本已更新为 `<X.Y.Z>`。若已推 Tag 由 CI API v2 上传，请注意：一旦进入 `PENDING_REVIEW` 状态将锁定表单编辑，因此**需要改后台文案的大版本应先在后台改好文案并点「保存草稿」，再推 Tag（或手动上传后一起点「提请审核」）**。
   - **10 语种详情描述（`/edit/listing`）**：
     - 每次点击语言下拉框（`[role="combobox"] >> nth=0`）前先执行 `window.scrollTo(0, 0)` 避免吸顶条遮挡；
     - 语言映射表：仓库 `pt.txt` 对应后台 `li[role="option"][data-value="pt-BR"]`，其余 9 语种（`en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `de`, `es`, `fr`, `ru`）同名；
     - 填入 `textarea[maxlength="16000"]` 并点击「保存草稿」后，必须 `page.reload()` 逐语种回读校验 `value.trim() === expected`。
   - **权限理由与隐私（`/edit/privacy`）**：按 `SUBMISSION_GUIDE.md` 同步 `storage`（`textarea >> nth=1`）、`alarms`、主机权限理由（每项 `<= 1000` 字符）并点击「保存草稿」。
   - **审核测试说明（`/testcredentials`）**：文本框默认处于 `disabled` 状态，须先点击「修改」解锁 `textarea[placeholder="其他说明"]`（`<= 500` 字符），填入版本说明后点「保存更改」。
   - **提交审核**：「提请审核」按钮位于 `/edit/listing` 或 `/edit/privacy` 顶部操作栏（不在 `/edit/status`）。点击弹窗中的「提交审核」（保留「通过审核后自动发布它」勾选），最后跳转 `/edit/status` 确认状态为「待审核 / 该草稿尚待审核」。

---

## 场景 C：云端公共词库热更与 CWS 凭证轮换

- **仅热更云端公共词库（无需发扩展新版本）**：
  修改 [apps/server/cloud-rules.json](../../../apps/server/cloud-rules.json) 后运行 `pnpm cloud-rules:push`（支持 `--dry-run`），自动同步远程 D1 并刷新快照。
- **轮换 Chrome Web Store OAuth 凭证**：
  运行 [scripts/cws-auth.ts](../../../scripts/cws-auth.ts)（`pnpm cws:auth --client-id "<ID>" --client-secret "<SECRET>"`），完成本地回环授权后会自动调用 API v2 `:fetchStatus` 验权并通过 `gh secret set` 更新仓库密钥。
