# KeepXClean 黑钛图标 · 无保护圈

2026-11-10 用户选定浅绿底配黑钛 X，并明确取消保护圈。本目录为当前采用的无光圈版本；历史光弧探索保存在 `../metal-a/`，已弃用。

## 文件与尺寸

- `logo.svg`：可编辑的 512 × 512 矢量母版。
- `logo-small.svg`、`logo-32.svg`、`logo-48.svg`：小尺寸版，等比放大 X，保留原始路径。
- `icon-{size}.png`：16、24、32、48、64、128、256、512、1024 px，圆角外透明。
- `reference-preview.png`：用户选定的 imagegen 黑钛原图。
- `sizes-preview.png`：各尺寸对照。
- `keepxclean-black-titanium-icons.zip`：本目录的图标与规范。

## 视觉规范

浅绿纯色底固定 `#EAF6EF`，圆角半径为边长的 21.875%。X 使用近黑色金属渐变和窄银灰边缘反光，保持原版轮廓。常规 X 宽度为画布的 56.25%；48 px 为 59.375%；32 px 为 62.5%；16 / 24 px 为 68.75%。不加保护圈、光弧、背景内外分色、实体盾牌、星芒或角标。

基础版 SVG 是按选定质感制作的矢量重建，使用原始 X 路径、渐变和细边缘表现黑钛；它不是将生成图像素嵌入 SVG，细微反射与生成原图有差异。PNG 从对应 SVG 导出，小尺寸优先保证轮廓清晰。

这些素材已接入插件代码：PNG 位于 `apps/extension/public/icon/`，SVG 位于 `apps/extension/public/brand/`；manifest、工具栏、设置页、弹窗及 X 页面内品牌使用本版。原始路径来自 `../logo.svg`；黑钛概念由内置 imagegen 生成，完整提示词见 `../metal-a/black-titanium-prompts.json`。
