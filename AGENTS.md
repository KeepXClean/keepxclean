# KeepXClean 项目约定

## UI 设计

- UI 默认采用浅色背景，覆盖插件弹窗、完整设置页及 X 页面内交互组件。
- 品牌图标采用用户选定的“黑钛盾牌 + 镂空圆角 x”，配浅绿圆角底（目标色 `#EAF6EF`）与克制的银灰边缘高光。x 为等粗对称的普通几何笔画，不得复用 X/Twitter 官方标识或原始轮廓；不添加保护圈、光弧、背景内外分色、星芒或角标。圆角外必须为真实透明，不得保留白色方框或外边；所有尺寸与官网视频须从同一透明母版导出。正式设计与导出说明见 `design/ui-light-v1/icon-concepts/shield-x-v1/`。旧 `official-x/` 与 `original-k-v2/` 素材仅作历史探索，不得用于新发布。此约定替代此前的黑钛 X、原创 K 以及不使用实体盾牌的要求。

## 发版与部署

- 发版操作前须先阅读 `.agents/skills/keepxclean-release/SKILL.md`。
- 常规发版使用 `pnpm release:bump <X.Y.Z>` 原子对齐全仓版本并更新 `CHANGELOG.md`，本地门禁通过后推送 `v<X.Y.Z>` 标签即可由 GitHub Actions 全自动完成测试、Cloudflare D1/API/官网部署、GitHub Release 创建及 Chrome Web Store API v2 自动上传与提审上架（`CWS_*` 密钥已配置）。
- 若版本涉及商店详情页长描述、截图、权限理由、隐私披露或审核测试说明变更，Chrome Web Store API v2 不覆盖这些后台表单字段，须按发版 Skill 指引通过 `ego-browser` 在开发者后台同步。
