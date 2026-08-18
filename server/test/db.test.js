// 零文件 I/O 的 Collection 纯查询 API 冒烟测试
// 只操作内存 Map，不调用 set/save/delete/load，绝不读写 server/data/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('../db');

function makeCollection() {
  const col = new Collection('__test__');
  // 直接注入内存数据（绕过会触发防抖写盘的 set()）
  col._data = new Map([
    ['u1', { id: 'u1', name: 'Alice', age: 30 }],
    ['u2', { id: 'u2', name: 'Bob', age: 25 }],
    ['u3', { id: 'u3', name: 'Carol', age: 35 }],
  ]);
  return col;
}

test('基本查询 size/has/get', () => {
  const col = makeCollection();
  assert.equal(col.size, 3);
  assert.equal(col.has('u2'), true);
  assert.equal(col.has('missing'), false);
  assert.equal(col.get('u1').name, 'Alice');
  assert.equal(col.get('missing'), undefined);
});

test('find 返回首个匹配，无匹配返回 undefined', () => {
  const col = makeCollection();
  assert.equal(col.find(u => u.age > 30).id, 'u3');
  assert.equal(col.find(u => u.age > 100), undefined);
});

test('findAll 返回所有匹配', () => {
  const col = makeCollection();
  assert.equal(col.findAll(u => u.age >= 30).length, 2);
  assert.equal(col.findAll(u => u.age > 100).length, 0);
});

test('map/filter/toArray 转换', () => {
  const col = makeCollection();
  assert.deepEqual(col.map(u => u.name).sort(), ['Alice', 'Bob', 'Carol']);
  assert.equal(col.filter(u => u.age < 30).length, 1);
  assert.equal(col.toArray().length, 3);
});

test('forEach/keys/values/entries 遍历', () => {
  const col = makeCollection();
  let count = 0;
  col.forEach(() => count++);
  assert.equal(count, 3);
  assert.equal(Array.from(col.keys()).length, 3);
  assert.equal(Array.from(col.values()).length, 3);
  assert.equal(Array.from(col.entries()).length, 3);
});
