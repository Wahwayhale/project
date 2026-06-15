# CLAUDE.md — 项目开发规范

> 基于 `react-expert` `engineering-frontend-developer` `engineering-backend-architect` `code-reviewer` `subagent-driven-development` 等技能制定

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Socket.io Client + Axios + Lucide React |
| 后端 | Express + Socket.io + JWT + bcryptjs + multer |
| AI | Zhipu GLM / Kimi Moonshot / DeepSeek / 百度千帆 |
| 存储 | JSON 文件持久化（`db.js` Collection 类），原子写入 |
| 构建 | react-scripts (CRA)，Capacitor Android |
| 隧道 | ngrok → `parakeet-nimble-cage.ngrok-free.dev` |

---

## 1. 前端开发规范

### 1.1 项目结构

```
client/
  src/
    App.js          ← 单文件主组件（~4500行），可拆分但非必须
    index.js        ← ReactDOM 入口 + ErrorBoundary
    index.css       ← 全局样式 + 设计 Token（CSS 变量）
  public/
    index.html      ← PWA meta、viewport、全局重置
    manifest.json   ← PWA 配置
  capacitor.config.ts ← Android OTA 模式配置
```

### 1.2 图标系统

**只用 Lucide React**，禁止使用 emoji 作为 UI 图标：

```jsx
<I name="chat" size={22} />               {/* Tab 图标 */}
<I name="search" size={15} color="var(--text-secondary)" />
<I name="delete" size={14} color="var(--danger)" />
```

完整映射表在 `App.js` 第 19-34 行 `map` 对象。

### 1.3 样式规则

- **颜色**必须用 CSS 变量：`var(--primary)` `var(--bg)` `var(--text)` `var(--border)` `var(--danger)` 等
- **间距**基准 4px：用 4、8、12、16、20、24
- **圆角**：6/8/10/12/16px 五级
- **新样式**加在 `index.css` 末尾，不要改已有规则除非修复 bug
- **禁止**内联 `style={{}}` 写颜色、字体大小、间距；仅限动态值
- 移动端断点 `768px`，小屏 `480px`，横屏 `(orientation: landscape)`

### 1.4 状态管理

- 全部用 `useState` + `useRef`，不引入 Redux/Zustand
- Socket 事件驱动状态更新：`socketRef.current.on('event', (data) => setState(...))`
- 新状态变量加在 `// ===== 功能名 =====` 注释块内

### 1.5 触控规范

- 最小触控区：**44×44px**
- 禁止页面缩放：`user-scalable=no`
- 输入框防 iOS 缩放：`font-size: 16px`
- 禁止文字选择：`user-select: none`（输入框除外）

### 1.6 OTA 更新与版本管理（强制）

本项目采用 **ngrok 单域名 OTA 架构**：

| 入口 | 指向 | 用途 |
|------|------|------|
| `https://parakeet-nimble-cage.ngrok-free.dev` | `localhost:3001` | Web、API、Socket.io、OTA 元信息、APK 下载 |

**核心规则**：

- **Web 功能更新**（UI、样式、API 端点、AI 功能、业务逻辑）→ 更新 Web 构建并重启 3001 服务，已安装 App 下次打开自动加载 ngrok 上的新网页，无需重新安装 APK
- **原生功能更新**（Android 权限、Capacitor 插件、`capacitor.config.ts` 变更）→ 必须构建新 APK 并推送安装
- **旧 APK 兼容**：新 Web 功能必须兼容旧版 APK（不能引入旧版不支持的插件调用）。检测 `isCapacitor` 标志，对旧版做降级处理
- **版本号规则**：纯 Web 更新 → `webBuild +1`。原生更新 → `webBuild +1`、`nativeBuild +1`，并同步 `appVersion`、`capacitor.config.ts`、Android `versionCode/versionName`
- **APK 更新推送**：`ota-version.json` 设置 `apkUrl` + `apkSize`。App 只在 `nativeBuild` 或 `minNativeBuild` 高于本机原生构建时弹窗

**判定表**：

| 改动类型 | webBuild | nativeBuild | 需新 APK？ |
|----------|----------|-------------|-----------|
| CSS / 样式 | +1 | 不变 | 否 |
| 新增 API 端点 | +1 | 不变 | 否 |
| AI 功能 / 逻辑 | +1 | 不变 | 否 |
| 安装新 Capacitor 插件 | +1 | +1 | **是** |
| 修改 AndroidManifest.xml | +1 | +1 | **是** |
| 修改 capacitor.config.ts | +1 | +1 | **是** |
| 调用新插件 API（如 Geolocation） | +1 | +1 | **是** |

---

## 2. 后端开发规范

### 2.1 项目结构

```
server/
  server.js     ← 主文件（~2700行），Express + Socket.io
  db.js         ← JSON 持久化层（Collection 类）
  data/         ← JSON 数据文件
  .env          ← 密钥和配置
  uploads/      ← 用户上传文件
```

### 2.2 API 设计

- REST 端点：`/api/<资源>/<操作>` 格式
- 认证：JWT `Authorization` header + `verifyToken` 中间件
- Socket 事件：camelCase（`sendMessage` `joinRoom` `recallMessage`）
- 响应格式：`{ success, data, error }` 或直接返回资源

### 2.3 安全规则（强制）

- **每个私有路由**必须通过 `verifyToken` 中间件
- **房间访问**：`isRoomMember(room, username)` 检查后才能 join/sendMessage/readMessages
- **管理员操作**：额外检查 `user.username === 'admin'`
- **密码**：bcrypt hash，10 轮
- **JWT**：7 天过期，Secret 从 `.env` 读取
- **文件上传**：500MB 限制，multer 处理
- **禁止**在代码中硬编码密钥、密码

### 2.4 数据持久化

```javascript
// 新增数据 → Collection.set() 自动触发防抖写入
users.set(username, user);

// 关键操作 → 立即写入，不等防抖
users.set(username, user);
users.save();  // 防数据丢失

// 充值/支付 → 必须同时 save
recharges.set(id, record);
recharges.save();
users.set(username, user);
users.save();
```

写入流程：`saveDebounced(200ms)` → `saveJson()` → `tmp文件` → `rename（原子操作）` → 正式文件

### 2.5 性能规则

- 房间消息上限：**3000 条**，超出 `slice(-3000)`
- API 分页：50 条/页（`/api/rooms/:id/messages?page=N`）
- Socket 事件去重：bot 每 10 秒最多触发一次
- 文件清理：分片上传 1 小时后过期

---

## 3. AI 集成规范

### 3.1 可用模型

| 模型 | 提供方 | 定价 |
|------|--------|------|
| `glm-4-flash` | Zhipu | 免费 |
| `deepseek-v4-flash` | DeepSeek 直连 | 付费 ¥0.02/次 |
| `deepseek-v4-pro` | DeepSeek 直连 | 付费 ¥0.02/次 |
| `deepseek-r1` | DeepSeek 直连 | 付费 ¥0.02/次 |
| `ernie-4.5-turbo-128k` | 百度千帆 | 付费 ¥0.02/次 |

### 3.2 新增 AI 功能规则

- 优先用 `glm-4-flash`（免费）或百度千帆可用模型
- 禁止使用外部免 key 文本通道；用户选择哪个模型就只调用哪个模型，失败时直接返回该模型错误
- 用 `callAIFree(messages, callback)` 包装函数
- admin 用户调用付费模型不扣费

---

## 4. 子代理驱动开发

本项目采用子代理模式处理多步骤任务：

1. **规划阶段**：用 `EnterPlanMode`，检查关联文件、设计变更方案
2. **执行阶段**：独立任务派给子代理，主线程只做协调
3. **验证阶段**：`node --check server.js` + `npm run build` 确认无编译错误
4. **完成前自检**：代码改动不超过需求范围、未引入新 lint 错误、余额相关操作含 `save()`

---

## 5. 代码审查清单

改完代码后自检：

### 前端
- [ ] 图标用 `<I name="..." />`，无 emoji
- [ ] 颜色/间距用 CSS 变量，无硬编码
- [ ] 触控区 ≥44px
- [ ] `npm run build` 无 error
- [ ] 移动端预览不溢出

### 后端
- [ ] 新路由含 `verifyToken`
- [ ] 私有房间操作含 `isRoomMember` 检查
- [ ] 余额/充值操作含 `save()`
- [ ] `node --check server.js` 无语法错误
- [ ] 无硬编码密钥

### 安全
- [ ] 无 SQL/NoSQL 注入（本项目用 Map，无此风险）
- [ ] 用户输入经 `typeof` 类型校验
- [ ] 文件上传有大小限制
- [ ] JWT 验证未跳过

---

## 6. 测试策略

- 功能测试优先：注册 → 登录 → 操作 → 验证结果
- 充值流程必须端到端测试（注册用户 → 申请充值 → admin 确认 → 检查余额）
- 安全测试：越权访问私有房间应返回 403
- 修改后运行 `npm run build` + `node --check server.js`

---

## 7. 设计系统

完整规范见 `huashu-design.md`。

核心速查：
- **主色**：`#42d6a4`（清新薄荷绿）
- **字体**：系统字体栈，14px 正文
- **图标**：Lucide 1.2px 线性，24×24 基准
- **圆角**：6/8/10/12/16 px
- **间距**：4/8/12/16/20/24 px
- **阴影**：sm/md/lg/xl 四级

---

## 8. 禁止事项

- ❌ 删除或重构不相关的代码
- ❌ 引入新依赖而不经规划
- ❌ 硬编码颜色/字号/间距
- ❌ 跳过 `isRoomMember` 检查
- ❌ 余额操作忘记 `save()`
- ❌ 在 render 中调用 `Date.now()` 或 `Math.random()`
- ❌ `npm run build` 未通过就声称完成
