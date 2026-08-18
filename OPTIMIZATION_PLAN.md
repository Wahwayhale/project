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

### 1.3 冒烟测试（需谨慎设计，未执行）
- **风险点**：`db.js` 的 `DATA_DIR` 硬编码为 `server/data/`，测试若调用 `set()/save()` 会覆盖真实数据。
- **安全做法**（二选一）：
  1. 只测 `Collection` 纯查询 API（`find/findAll/filter/map/toArray/size/has/get`），零文件 I/O。
  2. 若要测原子写入/登录/消息链路，需先把 `DATA_DIR` 改为可用环境变量覆盖（这是一次代码改动，需单独小步做 + 验证）。
- 状态：⏳ 待执行，建议先做方案 1（零风险）。

---

## P2 · 工程治理（纯配置/文档）

| 项 | 问题 | 动作 | 状态 |
|----|------|------|------|
| 未提交改动 | 28 改 + 40 删 + 19 新增未提交 | 先看 diff → 分小 commit | ⏳ 下一步(C) |
| 文档脱节 | README 说 57 端点/4500 行，实际 ~100/3800 | 重写 README+ARCHITECTURE | ✅ 已重写 |
| 根目录垃圾 | `211` `212` `213` `214` 构建残留 | 删除 | ✅ 已删除 |
| `deploy.sh` 旧命名 | 目录 `wechat-app`、PM2 名 `wechat-backend` 与 `chatroom-server` 不一致 | 待核对（origin 仍指向 project.git，本地不运行，暂不改） | ⏸ 待定 |
| 依赖健康度 | 无 audit 记录 | `npm audit` 只报告不改 | ⏳ |

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

## 执行记录

- 2026-08-18：完成 P1.1 + P1.2（数据移出版本控制 + .gitignore）。
- 2026-08-18：完成 P2 部分 —— 删除根目录垃圾文件（211~214）、重写 README + ARCHITECTURE 对齐真实代码规模（server.js ~3800 行 / REST 100 端点 / Socket 68 事件 / 前端 60 组件 + 13 hooks + 24 css）。
- 2026-08-18：`deploy.sh` 暂不改动（Linux 服务器脚本，本地不运行且无法验证；命名不一致已记录待核对）。
