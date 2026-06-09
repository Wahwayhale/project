# 画书 · huashu-design

> 微信风格聊天应用设计系统 | v3.0 | 2026-06-09

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **克制** | 减少装饰，让内容成为主角。颜色仅用于状态区分和行动召唤 |
| **透气** | 充足的留白和间距，UI 不拥挤。4px 基准网格 |
| **一致** | 同一套图标（Lucide）、同一套间距、同一套圆角，全应用统一 |
| **即时** | 动画 ≤200ms，不拖沓。操作立即反馈 |

---

## 2. 色彩系统

### 2.1 主色调 — 微信绿

```
Primary:      #07c160  → 按钮、链接、选中态
PrimaryLight: #10b981  → hover 态
PrimaryDark:  #05a04f  → active 态
PrimaryBg:    rgba(7, 193, 96, 0.08)  → 选中背景
PrimaryGrad:  linear-gradient(135deg, #07c160, #10b981)
```

### 2.2 语义色

```
Danger:   #ef4444  → 删除、错误、红包
Warning:  #f59e0b  → 提醒、收藏
Info:     #3b82f6  → 链接、提示
Success:  #10b981  → 完成、确认
```

### 2.3 中性色 — 亮色模式

```
Bg:         #f5f6fa  → 页面背景
BgCard:     #ffffff  → 卡片/弹窗
BgHover:    #f0f1f5  → hover 态
BgActive:   #e8eaef  → 选中态
Border:     #e4e6eb  → 分割线
Text:       #1e1e1e  → 主文字
TextSec:    #8a8d91  → 次要文字
TextTer:    #b0b3b8  → 禁用/占位
```

### 2.4 中性色 — 暗色模式

```
Bg:         #1a1a2e  → 页面背景
BgCard:     #2d2d3f  → 卡片
BgHover:    #252538  → hover
BgActive:   #1e1e30  → 选中
Border:     #3a3a50  → 分割线
Text:       #e8eaef  → 主文字（#fff 降一档，减少眩光）
TextSec:    #9ca3af  → 次要
BubbleSent: #5b6ef7  → 自己发送的气泡
BubbleRecv: #2d2d3f  → 收到的气泡
```

---

## 3. 图标系统

### 3.1 图标库

**Lucide React** — 线性轮廓图标，统一视觉规范：

| 属性 | 值 |
|------|-----|
| strokeWidth | 1.2px |
| 端点 | round（圆头） |
| 连接 | round（圆角） |
| 默认尺寸 | 24×24px |
| 安全区域 | 20×20px |
| 颜色 | `currentColor` 继承 |

### 3.2 图标组件

```jsx
<I name="chat" size={22} />
<I name="search" size={15} color="var(--text-secondary)" />
```

完整映射表见 `client/src/App.js` 第 19-34 行 `map` 对象。

### 3.3 图标尺寸规范

| 场景 | 尺寸 |
|------|------|
| Tab 图标 | 22px |
| 工具栏按钮 | 15px |
| 消息操作 | 15px |
| 输入区工具 | 17px |
| 弹窗标题 | 20px |
| 发现页卡片 | 20px |
| 列表按钮 | 14px |

---

## 4. 字体系统

### 4.1 字体栈

```css
-apple-system, BlinkMacSystemFont, 'Segoe UI',
'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
sans-serif
```

### 4.2 字号阶梯

| Token | 大小 | 用途 |
|-------|------|------|
| xs | 10px | Tab 标签、角标 |
| sm | 12px | 辅助文字、时间戳 |
| base | 14px | 正文、气泡文字 |
| md | 15px | 列表标题、输入框 |
| lg | 16px | 弹窗标题 |
| xl | 20px | 页面标题 |
| 2xl | 24px | 大数字 |

---

## 5. 间距系统

基准 **4px**。

| Token | 值 | 用途 |
|-------|-----|------|
| xs | 4px | 紧密排列元素 |
| sm | 8px | 图标与文字间距 |
| md | 12px | 列表项内边距 |
| lg | 16px | 卡片/弹窗内边距 |
| xl | 20px | 发现页卡片内边距 |
| 2xl | 24px | 页面水平边距 |

---

## 6. 圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| sm | 6px | 标签、小按钮 |
| md | 8px | 输入框、列表项 |
| lg | 10px | 气泡、卡片 |
| xl | 12px | 弹窗、大卡片 |
| 2xl | 16px | 移动端底部弹窗 |
| full | 9999px | 头像、圆形按钮 |

---

## 7. 阴影系统

| Token | 值 | 用途 |
|-------|-----|------|
| sm | 0 1px 3px rgba(0,0,0,0.06) | 轻微浮起 |
| md | 0 4px 12px rgba(0,0,0,0.08) | 卡片、气泡 |
| lg | 0 8px 24px rgba(0,0,0,0.12) | 弹窗 |
| xl | 0 16px 48px rgba(0,0,0,0.16) | 大弹窗 |

---

## 8. 动效系统

| Token | 值 | 用途 |
|-------|-----|------|
| ease | cubic-bezier(0.25, 0.1, 0.25, 1) | 通用过渡 |
| ease-bounce | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性动画 |
| duration-sm | 150ms | 微交互（hover、toggle） |
| duration-md | 200ms | 标准过渡（展开、切换） |
| duration-lg | 300ms | 页面转场、弹窗 |

---

## 9. 布局系统

### 9.1 断点

| 断点 | 适配 |
|------|------|
| ≤480px | 小屏手机 |
| ≤768px | 手机/平板 |
| ≤900px | 窄桌面 |
| >769px | 桌面端 |

### 9.2 底部导航栏

- 高度：56px
- 位置：fixed bottom
- 安全区：`padding-bottom: env(safe-area-inset-bottom)`
- 桌面端隐藏（`@media (min-width: 769px)`）

### 9.3 聊天头部

- 桌面：单行（标题 + 工具栏）
- 移动：两行（第一行标题，第二行可横向滚动的工具栏）

### 9.4 输入区

- 移动：两行（第一行工具按钮，第二行输入框 + 发送）
- 底部安全区适配

---

## 10. 组件规范速查

| 组件 | 高度 | 关键样式 |
|------|------|---------|
| 聊天列表项 | auto | padding: 12px 16px, gap: 12px |
| 头像 | 42px/48px | 圆角: 8-10px |
| 聊天气泡 | auto | padding: 10px 14px, 圆角: 12px |
| 输入框 | ≥38px | 圆角: 10px, border: 2px |
| 发送按钮 | 40px | 渐变背景, 圆角: 10px |
| 弹窗 | max 85vh | 移动端底部弹出, 圆角: 16px 16px 0 0 |
| Toast | auto | 圆角: 10px, 居中底部 |
| 角标 | 16px | 圆形, 红色背景 |

---

## 11. 触控规范（移动端）

- 最小触控区：44×44px（iOS HIG）
- 点击反馈：`-webkit-tap-highlight-color: transparent`
- 禁止缩放：`user-scalable=no, maximum-scale=1`
- 禁止选择：`user-select: none`（输入框除外）
- 滚动：`overscroll-behavior: contain`, `-webkit-overflow-scrolling: touch`
- 隐藏滚动条：`::-webkit-scrollbar { display: none }`

---

## 12. 文件索引

| 文件 | 职责 |
|------|------|
| `client/src/index.css` | 设计 Token 定义、组件样式、响应式 |
| `client/src/App.js` | 图标映射 `<I>` 组件 |
| `client/public/index.html` | viewport、PWA meta、全局重置 |
| `client/public/manifest.json` | PWA 配置 |

---

> 此文档服务于开发和设计对齐。任何视觉变更应先更新此文档，再修改代码。
