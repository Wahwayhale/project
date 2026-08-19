#!/usr/bin/env node
/**
 * 发版自检（check:release）
 *
 * 校验大更新发布时三处版本号必须一致：
 *   1. client/public/changelog.json  最新条目的 webBuild
 *   2. client/public/ota-version.json 的 webBuild
 *   3. client/src/utils/constants.js  的 WEB_BUILD
 *
 * 任何一处不一致即退出码 1，防止"改了功能忘了发公告/忘了加版本号"。
 * 用法：npm run check:release
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];

function readJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    errors.push(`文件不存在: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    errors.push(`JSON 解析失败: ${rel} (${e.message})`);
    return null;
  }
}

const changelog = readJson('client/public/changelog.json');
const ota = readJson('client/public/ota-version.json');

const cwb = changelog?.releases?.[0]?.webBuild;
const owb = ota?.webBuild;

const constantsPath = path.join(root, 'client/src/utils/constants.js');
const constantsSrc = fs.existsSync(constantsPath) ? fs.readFileSync(constantsPath, 'utf-8') : '';
const m = constantsSrc.match(/WEB_BUILD\s*=\s*(\d+)/);
const kwb = m ? Number(m[1]) : NaN;

if (cwb === undefined || cwb === null) errors.push('changelog.json 没有最新发布条目（releases[0].webBuild）');
if (owb === undefined || owb === null) errors.push('ota-version.json 缺少 webBuild');
if (!Number.isFinite(kwb)) errors.push('constants.js 缺少 WEB_BUILD 常量');

if (errors.length === 0) {
  if (cwb !== owb) errors.push(`版本号不一致: changelog(${cwb}) != ota(${owb})`);
  if (owb !== kwb) errors.push(`版本号不一致: ota(${owb}) != constants.js WEB_BUILD(${kwb})`);
  const latest = changelog.releases[0];
  if (!latest.title) errors.push('最新公告缺少 title');
  if (!Array.isArray(latest.notes) || latest.notes.length === 0) errors.push('最新公告缺少 notes（更新说明）');
  if (latest.prevWebBuild !== undefined && latest.prevWebBuild !== owb - 1) {
    errors.push(`prevWebBuild(${latest.prevWebBuild}) 应为 ${owb - 1}`);
  }
}

if (errors.length) {
  console.error('❌ 发版自检未通过：');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

const latest = changelog.releases[0];
console.log(`✅ 发版自检通过：webBuild ${owb} 一致（changelog / ota / constants）`);
console.log(`   最新公告：Web ${latest.webBuild}「${latest.title}」${latest.notes.length} 条说明`);
