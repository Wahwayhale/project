// 原子写入 + 备份 + 损坏恢复测试
// 通过 DATA_DIR 环境变量把 db 指向临时目录，绝不触碰 server/data/
const fs = require('fs');
const os = require('os');
const path = require('path');

// 必须在 require('../db') 之前设置，因为 db.js 顶层会读取该变量
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chatroom-test-'));
process.env.DATA_DIR = TMP_DIR;

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, DATA_DIR } = require('../db');

// 防御性断言：环境变量覆盖必须生效，否则立即失败，杜绝写真实数据
assert.equal(DATA_DIR, TMP_DIR, 'DATA_DIR 覆盖未生效，拒绝继续（避免污染 server/data）');

// saveJson 的写锁会让同一文件的第 2+ 次写入推迟到微任务，等待一个宏任务即可落盘
const tick = () => new Promise((r) => setImmediate(r));

test('原子写入：set + flush 后文件存在且内容正确', async () => {
  const col = new Collection('users');
  col.set('u1', { id: 'u1', name: 'Alice' });
  col.flush();
  await tick();

  const filePath = path.join(TMP_DIR, 'users.json');
  assert.equal(fs.existsSync(filePath), true, 'users.json 应已写入');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(data.u1.name, 'Alice');
});

test('备份机制：第二次写入前生成 .bak，且内容为上一次状态', async () => {
  const col = new Collection('users');
  col.set('u2', { id: 'u2', name: 'Bob' });
  col.flush();
  await tick(); // 关键：等待写锁链的 .then 微任务完成

  const bakPath = path.join(TMP_DIR, 'users.json.bak');
  assert.equal(fs.existsSync(bakPath), true, '第二次写入前应生成 .bak');
  const bak = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
  assert.equal(bak.u1.name, 'Alice', '.bak 应为上一次写入的状态');
  assert.equal(bak.u2, undefined, '.bak 不应包含本次新增的数据');
});

test('损坏恢复：主文件 JSON 损坏时从 .bak 自动恢复', () => {
  const filePath = path.join(TMP_DIR, 'users.json');
  // 人为写坏主文件
  fs.writeFileSync(filePath, '{ broken json', 'utf-8');

  const col = new Collection('users');
  col.load(); // 应触发 .bak 恢复逻辑

  assert.equal(col.get('u1').name, 'Alice', '应从 .bak 恢复出 u1');
  const recovered = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(recovered.u1.name, 'Alice', '主文件应被重写为 .bak 内容');
});

after(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});
