# 「聊天室」优化方案（执行版 · v2）

> 已按用户要求忽略密钥问题（不轮换密钥、不重写 git 历史）。
> 本文档只记录方案与执行进度，不替代代码本身。

---

## 核心判断

| 风险 | 说明 | 后果 |
|------|------|------|
| 🔴 无测试兜底 | 项目 0 个测试，`server.js` 约 4000 行靠手工验证 | 改动可能静默崩 |
| 🟠 运行时数据被 git 跟踪 | `server/data/*.json`（聊天记录、充值、密码 hash）+ 每小时备份进 git | 误回滚/误覆盖直接丢数据 |
| 🟡 文档与代码脱节 | README/ARCHITECTURE 停在重构前 | 维护成本高、易误导 |

---

## P1 · 防坍塌安全网（最优先）

### 1.1 运行时数据移出版本控制
- `git rm -r --cached server/data/`（`--cached` 关键：只移出索引，**磁盘文件不动**）
- 已执行 ✅（见提交 `chore: untrack runtime data`）

### 1.2 补 `.gitignore`
- 新增 `server/data/`、`server/codes.log`、`server/server.out.log`、`server/server.err.log`
- 已执行 ✅

### 1.3 冒烟测试（已完成 ✅）
- **纯查询 API**：`server/test/db.test.js` 测 `Collection` 只读方法（size/has/get/find/findAll/map/filter/toArray/forEach/keys/values/entries），零文件 I/O。
- **原子写入/备份/损坏恢复**：`server/test/db-atomic.test.js`，通过 `DATA_DIR` 环境变量指向临时目录，8/8 通过。
- `db.js` 已加 `DATA_DIR` 环境变量覆盖（默认行为不变）+ 导出 `DATA_DIR` 供测试 fail-fast 断言。
- `server/package.json` 已加 `"test": "node --test"`。
- **重要发现**：`saveJson` 的写锁会让同一文件的第 2+ 次写入推迟到微任务（`.then`），`flush()` 后并非立即落盘。生产有 200ms 防抖 + 3s autoFlush 兜底，非数据损坏 bug，但值得记录。

### 端到端「登录/发消息」集成测试（暂缓 ⏸）
- `server.js` 是自执行脚本（`server.listen` 直接启动，无 `require.main` 保护），`require()` 会立即加载真实 .env、监听端口、读写真实 data；且 `AUDIT_FILE`/`BACKUP_DIR`/`codes.log` 多处硬编码 data 路径。
- 需先将 server.js 重构为「app 创建与 listen 分离 + 数据路径可配置」才能安全测试，属中等规模重构，风险高，暂缓。

---

## P2 · 工程治理（纯配置/文档）

| 项 | 问题 | 动作 | 状态 |
|----|------|------|------|
| 未提交改动 | 28 改 + 40 删 + 19 新增未提交 | 先看 diff → 分小 commit | ⏳ 下一步(C) |
| 文档脱节 | README 说 57 端点/4500 行，实际 ~100/3800 | 重写 README+ARCHITECTURE | ✅ 已重写 |
| 根目录垃圾 | `211` `212` `213` `214` 构建残留 | 删除 | ✅ 已删除 |
| `deploy.sh` 旧命名 | 目录 `wechat-app`、PM2 名 `wechat-backend` 与 `chatroom-server` 不一致 | 待核对（origin 仍指向 project.git，本地不运行，暂不改） | ⏸ 待定 |
| 依赖健康度 | 13 漏洞（10 high） | `npm audit fix`（非 force）已修 WebSocket DoS（socket.io-parser 4.2.7 / ws 8.21.3），13→4；剩余 4 个（NeteaseCloudMusicApi 的 file-type/ip-address + uuid）需 breaking 升级暂缓 | ✅ |

---

## P3 · 可维护性（中期，需逐块点头）

| 项 | 现状 | 建议 | 风险 |
|----|------|------|------|
| server.js 单文件 4000 行 | 定位难、易误伤 | 按模块拆，每次一块+冒烟 | 中 |
| JSON 无 Schema 校验 | 字段错拼静默写坏 | 轻量校验+启动自检 | 中 |
| 无 CI | 手工验证 | Actions: `node --check` + 冒烟 | 低 |
| 裸 JS | 无类型 | 新代码加 JSDoc（不整体迁 TS） | 低 |

---

## P4 · 架构演进（长期可选）

- 单进程 JSON → 渐进迁 SQLite（JSON 保留只读备份，双写过渡）
- WebSocket-only → 增加 polling 降级
- ngrok free tier → 评估自有域名 + 反代

---

## 执行原则

1. 先补安全网，再动刀。
2. 每步可逆（`git reset`/`git revert` 可回）。
3. 业务代码改动一律小步 + 可回滚 + 改后冒烟。
4. 任何会写 `server/data/` 的测试必须先隔离数据目录。

---

## 健康基线（2026-08-18 已验证 ✅）

| 检查项 | 结果 |
|--------|------|
| server.js / db.js 语法 | ✅ 通过 |
| 后端测试 | ✅ 8/8 通过 |
| 前端 `npm run build` | ✅ 一次成功 |
| 后端启动 + `/health` | ✅ status:ok，18 用户 20 房间 |
| 首页 `/` | ✅ HTTP 200 |
| 依赖完整性（含 @mediapipe） | ✅ 齐全 |

新增 `verify.bat`：发版前一条命令串行跑「语法检查 → npm test → build」，任一步失败即中断，保证“一次成功”。

## 风险决策（2026-08-18）

- **暂停高风险重构**：server.js 按模块拆分、抽 AI 公共函数、端到端集成测试，均涉及核心链路，与“求稳”目标相悖，暂不执行。
- **继续遵循**：只做低风险、可逆、默认行为不变的改动；每改一处跑 `verify.bat`。

---

## 执行记录

- 2026-08-18：完成 P1.1 + P1.2（数据移出版本控制 + .gitignore）。
- 2026-08-18：完成 P2 部分 —— 删除根目录垃圾文件（211~214）、重写 README + ARCHITECTURE 对齐真实代码规模（server.js ~3800 行 / REST 100 端点 / Socket 68 事件 / 前端 60 组件 + 13 hooks + 24 css）。
- 2026-08-18：`deploy.sh` 暂不改动（Linux 服务器脚本，本地不运行且无法验证；命名不一致已记录待核对）。
- 2026-08-18：完成 P1.3 冒烟测试 —— `db.js` 加 `DATA_DIR` 环境变量覆盖，补原子写入/备份/损坏恢复测试（8/8 通过，临时目录隔离，真实数据零污染）；端到端集成测试因 server.js 为自执行脚本而暂缓。
- 2026-08-18：建立健康基线（build ✅ / test ✅ / health ✅ / 首页 200），新增 `verify.bat` 发版检查脚本；决策：暂停高风险重构（server.js 拆分、抽 AI 函数）。
- 2026-08-18：`npm audit fix`（非 force）修复 WebSocket 公网 DoS 漏洞（socket.io 4.7.2→4.8.3、socket.io-parser→4.2.7、ws→8.21.3），13→4；验证语法/测试 12/12/启动 health 全过。剩余 4 个漏洞均需 breaking 升级（NeteaseCloudMusicApi→3.47.5、uuid→14），涉及音乐功能稳定性，暂缓待坤哥决策。package.json 未变（`^4.7.2` 范围已涵盖修复版）。
