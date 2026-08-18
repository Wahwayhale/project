// 数据结构自检测试：validateCollections 只读诊断
// 直接传 Map（有 entries()），避免触发 Collection 的防抖写盘，零文件 I/O
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCollections } = require('../db');

test('正常数据无警告', () => {
  const warnings = validateCollections({
    users: new Map([['u1', { id: 'u1', username: 'Alice' }]]),
    rooms: new Map([['r1', { id: 'r1', name: '房', type: 'public', members: [], messages: [] }]]),
    recharges: new Map([['rc1', { id: 'rc1', userId: 'u1', amount: 10 }]]),
    friends: new Map([['u1', ['u2']]]),
    friendRequests: new Map([['u1', []]])
  });
  assert.deepEqual(warnings, []);
});

test('缺少必需字段会告警', () => {
  const warnings = validateCollections({
    users: new Map([['bad1', { id: 'x' }]]) // 缺 username
  });
  assert.ok(warnings.some(w => w.includes('缺少必需字段 "username"')), '应报告缺 username');
});

test('字段类型错误会告警', () => {
  const warnings = validateCollections({
    rooms: new Map([['bad2', { id: 'x', name: 'y', type: 'public', messages: 'not-array' }]]),
    friends: new Map([['bad3', { not: 'array' }]])
  });
  assert.ok(warnings.some(w => w.includes('字段 "messages" 应为数组')), '应报告 messages 非数组');
  assert.ok(warnings.some(w => w.includes('应为数组')), '应报告 friends 非数组');
});

test('值为空会告警', () => {
  const warnings = validateCollections({
    users: new Map([['bad4', null]])
  });
  assert.ok(warnings.some(w => w.includes('值为空')), '应报告值为空');
});
