#!/usr/bin/env node
// === scripts/t9-overlap.js — 러너 밖 하네스가 등록 하네스와 겹치나(T9) ==========
// 이름이나 감으로 "중복"이라고 쓰면 그건 추측이다. **무엇을 검사하는가**로 본다:
//   하네스가 require 하는 server/*·sim/* 모듈 집합을 비교해, 등록 하네스 중
//   모듈이 겹치는 것을 나열한다. 겹침이 없으면 '없음', 있으면 후보를 그대로 적는다.
//   ⚠이건 **후보**지 판정이 아니다 — 같은 모듈을 다른 각도에서 볼 수 있다. 판정은 PM.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname);

function mods(file) {
  let s = '';
  try { s = fs.readFileSync(path.join(DIR, file), 'utf8'); } catch (e) { return new Set(); }
  const out = new Set();
  const re = /require\([`'"]([^`'"]+)[`'"]\)|join\([^)]*['"]server['"]\s*,\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(s))) {
    const p = m[1] || ('server/' + m[2]);
    if (!p) continue;
    const mm = p.match(/(server|sim)\/([\w.-]+?)(\.js)?$/);
    if (mm) out.add(`${mm[1]}/${mm[2]}`);
  }
  // 서버를 spawn 해서 쓰는 하네스(실클라 e2e)는 require 가 안 잡힌다 — 그 사실을 표시로 남긴다
  if (/spawn\([^)]*zone\.js|['"]zone\.js['"]/.test(s)) out.add('*존서버 기동');
  if (/playwright|chromium/.test(s)) out.add('*실클라');
  return out;
}

const all = fs.readdirSync(DIR).filter((f) => /^(test|e2e)-.*\.js$/.test(f));
const reg = all.filter((f) => /^\/\/ @regress/m.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
const out = all.filter((f) => !reg.includes(f));
const regMods = new Map(reg.map((f) => [f, mods(f)]));

for (const f of out.sort()) {
  const mine = mods(f);
  const cand = [];
  for (const [r, rm] of regMods) {
    const shared = [...mine].filter((x) => rm.has(x) && !x.startsWith('*'));
    if (shared.length >= 1) cand.push(`${r.replace(/\.js$/, '')}(${shared.join(',')})`);
  }
  console.log([f, [...mine].join(' ') || '(모듈 없음)', cand.length ? cand.slice(0, 3).join(' · ') : '없음'].join('\t'));
}
