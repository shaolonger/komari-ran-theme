# Ran Liquid Glass Redesign TODO

目标：将当前 Ran 主题从“精密金工仪表盘”重设计为受 iOS Liquid Glass、Siri 暗流光、动态微动效和横屏边栏生态启发的 Komari 监控界面。

执行规则：
- 每个任务完成后先自审效果与构建风险。
- 自审通过后，将对应状态改为 `done`。
- 每个完成任务单独提交，提交信息使用 `liquid: ...` 前缀。

## Tasks

- [x] `todo-01` 建立本文件，明确 Liquid Glass 改造范围、执行规则和验收节奏。
- [x] `todo-02` 新增 Liquid 主题 token、背景材质变量、可访问性 fallback，并将默认主题切换到 Liquid 暗色。
- [x] `todo-03` 新增 Siri 暗流光背景层，让全局页面具备低干扰的动态环境光。
- [x] `todo-04` 新增 Liquid 基础组件原语，用统一的玻璃材质、按钮、胶囊和状态芯片替换零散 inline 样式。
- [x] `todo-05` 改造顶部栏与侧边栏为横屏优先的 Liquid shell，保留当前所有页面入口。
- [x] `todo-06` 改造 OverviewV2 核心首页，让状态条、总览卡和内容面板进入 Liquid Glass 视觉体系。
- [x] `todo-07` 改造节点卡片和节点列表核心组件，加入柔和玻璃表面、流动高光和更清晰的在线状态反馈。
- [x] `todo-08` 改造详情/Traffic/Billing/Hub 的共享外壳和主要卡片，使多页面体验保持一致。
- [x] `todo-09` 更新主题配置、README 说明和 preview/cover 相关文案，使发布包描述与新设计一致。
- [ ] `todo-10` 完成构建、自审和最终 QA，记录剩余风险或后续增强项。

## Acceptance Checklist

- [ ] `npm run build` 通过。
- [ ] 桌面宽屏下左侧边栏和顶部控制区呈现 Liquid Glass 风格。
- [ ] 竖屏/窄屏下导航不会遮挡核心数据。
- [ ] 动态背景不影响文字可读性。
- [ ] `prefers-reduced-motion` 下禁用主要流动动画。
- [ ] `prefers-contrast` 或禁用透明效果时仍能阅读核心指标。
