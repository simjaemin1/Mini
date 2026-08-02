#!/usr/bin/env node
// ★[2026-08-02c 소멸 0 튜닝] A/B 집계 — 덤프에서 인구·소멸·좀비를 3시드 평균으로 낸다.
//   좀비 = 재민 기준 "10명 미만 장기 고착". 최종 인구 <10 && 최종 인구 < 최대 도달 인구의 절반 → 고착으로 본다
//   (한 번도 안 자란 신생촌과 무너져 눌러앉은 마을을 구분한다).
'use strict';
const fs = require('fs');
// 식량환산 — 엔진 함수를 그대로 부른다(사본 금지: 계수가 갈리면 지표가 거짓말한다)
const econ = require('/root/minirepo/sim/economy-sim.js');
const FE = (obj) => { try { return econ.totalFoodEquivalent(obj || {}); } catch (e) { return 0; } };
const tags = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const rows = [];
for (const tag of tags) {
  let pop = 0, ext = 0, zomb = 0, tool = 0, n = 0, missing = [];
  let rw = 0, rn = 0, rse = 0;   // 산골 1인당 부 · 산골 마을 수 · 석재 수출량
  let wqs = 0, wrs = 0;          // 품질보정 무기 총량 · 원 수량
  const per = [];
  for (const s of SEEDS) {
    const f = `/tmp/lab/${tag}_${s}.json`;
    if (!fs.existsSync(f)) { missing.push(s); continue; }
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    let p = 0, e = 0, z = 0, t = 0;
    let rockW = 0, rockN = 0, rockPop = 0, rockStoneExp = 0;
    let wq = 0, wRaw = 0;   // ★[2026-08-02e ②] 품질보정 무기 총량 Σ(수량×_weapQ) — "적지만 좋은 무기"를 세는 자
    for (const v of d.villages) {
      const cur = v.pop;
      p += cur;
      t += (v.storage && v.storage.tool) || 0;
      // ★[2026-08-02e ②] 무기는 **수량만 세면 거짓말**이다 — 합금 등급이 0.79→1.21 로 올랐으므로
      //   "적지만 좋은 무기"면 개선이다. `_weapQ`(마을 무기 스톡 품질 EMA, 석검 0.5 ~ 명장 청동 1.0+)를 곱해
      //   **석검 환산 무기량**으로 센다. 판정은 이 값으로 한다(수량은 참고).
      {
        const q = (v._int && v._int._weapQ) || 0.5;
        const n0 = (v.storage && v.storage.weapon) || 0;
        wRaw += n0; wq += n0 * q;
      }
      // ★[2026-08-02e ①] 산골(돌 산지) 마을의 **1인당 부** — 총인구만 보면 소득 축 붕괴를 놓친다.
      //   부 = 곳간 식량환산 + 국고 식량환산 + 국고 현금(BASE_VALUE.food=1.0 이 노동가치 앵커라 1:1 환산).
      //   판정 대상은 `land.stone >= 1.0`(바위 지형이 실한 마을) — 바닥값 0.25 마을은 돌 산지가 아니다.
      if ((v.land && v.land.stone || 0) >= 1.0 && cur > 0) {
        const w = FE(v.storage) + FE(v.treasury) + ((v.treasury && v.treasury._cash) || 0);
        rockW += w; rockPop += cur; rockN++;
        rockStoneExp += ((v.tradeStats && v.tradeStats.exportBy && v.tradeStats.exportBy.stone) || 0);
      }
      if (cur === 0) { e++; continue; }
      const peak = (v.history || []).reduce((a, h) => Math.max(a, h.p), cur);
      if (cur < 10 && cur < peak * 0.5) z++;
      else if (cur < 10) z++;   // 처음부터 못 자란 마을도 좀비로 집계(재민 기준은 결과 인구)
    }
    per.push({ s, p, e, z });
    pop += p; ext += e; zomb += z; tool += t; n++;
    rw += rockPop > 0 ? rockW / rockPop : 0; rn += rockN; rse += rockStoneExp;
    wqs += wq; wrs += wRaw;
  }
  if (!n) { rows.push({ tag, err: '덤프 없음' }); continue; }
  rows.push({ tag, pop: +(pop / n).toFixed(0), ext: +(ext / n).toFixed(2), zomb: +(zomb / n).toFixed(2),
    tool: +(tool / n).toFixed(0), rockW: +(rw / n).toFixed(1), rockN: +(rn / n).toFixed(1),
    stoneExp: +(rse / n).toFixed(0), wq: +(wqs / n).toFixed(0), wRaw: +(wrs / n).toFixed(0), per, missing });
}
const pad = (s, w) => String(s).padEnd(w);
console.log(pad('태그', 14) + pad('인구', 7) + pad('소멸/19', 9) + pad('좀비<10', 9) + pad('도구', 7)
  + pad('산골1인당부', 12) + pad('돌수출', 8) + pad('무기Q', 7) + pad('무기수', 7) + '시드별 (인구/소멸/좀비)');
for (const r of rows) {
  if (r.err) { console.log(pad(r.tag, 14) + r.err); continue; }
  console.log(pad(r.tag, 14) + pad(r.pop, 7) + pad(r.ext, 9) + pad(r.zomb, 9) + pad(r.tool, 7)
    + pad(r.rockW, 12) + pad(r.stoneExp, 8) + pad(r.wq, 7) + pad(r.wRaw, 7)
    + r.per.map(x => `s${x.s}:${x.p}/${x.e}/${x.z}`).join('  ')
    + (r.missing.length ? `  ⚠결측 ${r.missing.join(',')}` : ''));
}
