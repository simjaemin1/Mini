#!/usr/bin/env node
// ★[2026-08-02c 소멸 0 튜닝] A/B 집계 — 덤프에서 인구·소멸·좀비를 3시드 평균으로 낸다.
//   좀비 = 재민 기준 "10명 미만 장기 고착". 최종 인구 <10 && 최종 인구 < 최대 도달 인구의 절반 → 고착으로 본다
//   (한 번도 안 자란 신생촌과 무너져 눌러앉은 마을을 구분한다).
'use strict';
const fs = require('fs');
const tags = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const rows = [];
for (const tag of tags) {
  let pop = 0, ext = 0, zomb = 0, tool = 0, n = 0, missing = [];
  const per = [];
  for (const s of SEEDS) {
    const f = `/tmp/lab/${tag}_${s}.json`;
    if (!fs.existsSync(f)) { missing.push(s); continue; }
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    let p = 0, e = 0, z = 0, t = 0;
    for (const v of d.villages) {
      const cur = v.pop;
      p += cur;
      t += (v.storage && v.storage.tool) || 0;
      if (cur === 0) { e++; continue; }
      const peak = (v.history || []).reduce((a, h) => Math.max(a, h.p), cur);
      if (cur < 10 && cur < peak * 0.5) z++;
      else if (cur < 10) z++;   // 처음부터 못 자란 마을도 좀비로 집계(재민 기준은 결과 인구)
    }
    per.push({ s, p, e, z });
    pop += p; ext += e; zomb += z; tool += t; n++;
  }
  if (!n) { rows.push({ tag, err: '덤프 없음' }); continue; }
  rows.push({ tag, pop: +(pop / n).toFixed(0), ext: +(ext / n).toFixed(2), zomb: +(zomb / n).toFixed(2),
    tool: +(tool / n).toFixed(0), per, missing });
}
const pad = (s, w) => String(s).padEnd(w);
console.log(pad('태그', 14) + pad('인구', 7) + pad('소멸/19', 9) + pad('좀비<10', 9) + pad('도구', 7) + '시드별 (인구/소멸/좀비)');
for (const r of rows) {
  if (r.err) { console.log(pad(r.tag, 14) + r.err); continue; }
  console.log(pad(r.tag, 14) + pad(r.pop, 7) + pad(r.ext, 9) + pad(r.zomb, 9) + pad(r.tool, 7)
    + r.per.map(x => `s${x.s}:${x.p}/${x.e}/${x.z}`).join('  ')
    + (r.missing.length ? `  ⚠결측 ${r.missing.join(',')}` : ''));
}
