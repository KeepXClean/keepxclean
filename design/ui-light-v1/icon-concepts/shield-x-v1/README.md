# KeepXClean 正式品牌：盾牌 + x

2026-11-16 按用户提出的“盾牌 + x”方向，使用内置 image_gen 生成。

- 黑钛实体盾牌，中心为等粗圆角几何 x 镂空。
- 延续浅绿圆角底与克制的银灰边缘高光。
- x 使用普通对称交叉笔画，不采用 X 官方标识的原始轮廓。
- 原始生成稿包含不透明白色外框；2026-11-16 经用户明确授权，使用程序精确去除白色外框与边缘白色底色，保留盾牌和 x。生产母版为真实 RGBA 透明 PNG。
- 用户已选定本版作为正式图标，用于插件、官网与商店。旧 X 与 K 方案归档。

[透明母版](shield-x-transparent.png) · [原始设计稿](concept-shield-x.png) · [完整提示词](prompts.json)


## 生产导出

PNG 从去白边后的透明母版等比缩放为 16、24、32、48、64、128、256、512、1024 px，位于 `apps/extension/public/icon/` 与 `apps/web/public/`。圆角外 alpha 为 0，不保留白框。SVG 文件以 data URI 嵌入对应 PNG，避免矢量重绘改变已批准的轮廓；它们不是独立矢量母版。扩展、官网和宣传视频均使用同一套选定图像。

复现去白边与全部图标导出：`uv run design/ui-light-v1/icon-concepts/shield-x-v1/export_icons.py`。脚本只去除与画布边缘连通的白色背景，并对抗锯齿边缘解除白色合成底；盾牌内部像素保持不变。浅深背景验收见 [transparency-qa.png](transparency-qa.png)。

官网视频同一时间点的修正效果见 [video-reveal-qa.png](video-reveal-qa.png)。原图白框已从素材中去除，不依赖页面背景遮盖或 CSS 裁剪。
