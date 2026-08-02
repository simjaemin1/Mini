#!/usr/bin/env node
// === scripts/econ-regress.js — CLI 5시드 회귀 (v2 = 프로덕션과 같은 엔진) ===
//
// ★★[재민 확정 2026-08-01 "후자로 가자"] 대상을 v1 CLI → **v2 CLI** 로 옮겼다.
//   v1 CLI(sim/economy-sim.js main)는 createWorld 를 쓰는데 그건 priceFn 을 안 심는다.
//   그 상태에서 picker 만 'rational' 로 맞추면 한계가치 가중 w() 가 전부 1.0 으로 죽는다 —
//   "가격이 노동을 옮긴다"는 rational 의 존재 이유가 꺼진 채 도는, 프로덕션에 없는 키메라다.
//   프로덕션(server/central.js · server/villages.js)은 언제나 createWorldV2 + tickWorldV2 다.
//   sim/economy-sim-v2.js main 이 바로 그 배선이라 이쪽을 잰다.
//
//   ⚠기준선은 여기서 **리셋된다.** v1 표(sim-*)와 직접 비교하면 안 된다 —
//     다른 엔진(계절·날씨·풍흉·유효수요·shadow price·v2 교역)의 수치다.
//
// ★결과 파일을 매번 지우고 실행 실패를 잡는다. 안 그러면 옛 덤프를 읽어 거짓 통과가 난다.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const ROOT = '/root/minirepo';
const DAYS = 800, VILLAGES = 6;

// ★★[2026-08-01] 회귀 숫자를 보기 **전에** 계측기 자체를 검사한다.
//   이 세션에 여섯 번 — 스캔 환산 오차·stale dump·교역 누락·폐지된 이주·v1/v2 혼동·손으로 기운 번들 —
//   전부 "랩이 본 게임과 다른 것을 재고 있었다"였다. 숫자가 맞는지 보기 전에
//   **무엇을 재고 있는지**를 먼저 확인한다. 여기서 죽으면 아래 숫자는 볼 가치가 없다.
try { execFileSync('node', ['scripts/lab-wiring-check.js'], { cwd: ROOT, stdio: 'inherit' }); }
catch (e) { console.error('\n❌ 배선 검사 실패 — 회귀 중단. 랩이 본 게임과 다른 것을 재고 있다.'); process.exit(1); }

const rows = [];
// ★[2026-08-02e ②] 시드 확장 손잡이 — 5시드로는 장비 재고 같은 저빈도 지표가 잡음에 묻힌다.
//   `REGRESS_SEEDS=42,7,19,101,256,8,505,1020` 처럼 넘긴다. 기본은 기존 5시드(기준선 비교 가능성 보존).
const SEEDS = (process.env.REGRESS_SEEDS || '42,7,19,101,256').split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean);
for (const s of SEEDS) {
  const f = `${ROOT}/sim/out/simv2-${s}-${DAYS}d.json`;
  // ★★옛 결과 파일이 남아 있으면 실행이 죽어도 그걸 다시 읽어 **거짓 통과**가 난다.
  //   실제로 그렇게 당했다: RESERVE_PC TDZ 로 CLI 가 죽는데 회귀는 "비트 동일"을 냈다.
  //   ⇒ 매번 지우고, 실행 실패를 삼키지 않는다.
  try { fs.unlinkSync(f); } catch (e) {}
  // v2 main 인자 순서: [일수, 마을수, 시드]  (v1 은 [일수, 시드, 마을수] — 다르다)
  try { execFileSync('node', ['sim/economy-sim-v2.js', String(DAYS), String(VILLAGES), String(s)], { cwd: ROOT, timeout: 900000, stdio: 'ignore' }); }
  catch (e) { rows.push({ s, err: 1, msg: String(e.message || e).slice(0, 80) }); continue; }
  if (!fs.existsSync(f)) { rows.push({ s, err: 1, msg: '덤프 없음' }); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = { s, pop: 0, weap: 0, weapQ: 0, armor: 0, cloth: 0, cu: 0, tin: 0, iron: 0, smith: 0, miner: 0, tailor: 0, dead: 0, ex: 0, cash: 0, exSeen: 0 };
  for (const v of j.villages || []) {
    const n = v.finalPop || 0; r.pop += n; if (n <= 0) r.dead++;
    const st = v.finalStorage || {}, jb = v.jobs || {};
    r.weap += st.weapon || 0; r.armor += st.armor || 0; r.cloth += st.clothes || 0;
    // ★[2026-08-02e ②] 품질보정 무기 총량 — 수량×_weapQ(석검 0.5 ~ 명장 청동 1.0+). 합금 등급이 오르면
    //   같은 수량이라도 전력은 는다. "무기가 줄었다"를 수량만으로 판정하면 개선을 퇴보로 오독한다.
    r.weapQ += (st.weapon || 0) * ((v._int && v._int._weapQ) || 0.5);
    r.cu += st.copper || 0; r.tin += st.tin || 0; r.iron += st.iron || 0;
    r.smith += jb.smith || 0; r.miner += jb.miner || 0; r.tailor += jb.tailor || 0;
    // ★[2026-08-03a ⑰] 확장 셀 수 · 국고 현금 — 현금 배선이 v2 CLI 에서도 같은 방향으로 움직이는지
    // ★[2026-08-03a] 없는 필드를 0 으로 찍으면 '확장 안 함'으로 **오독**된다(배치 7 오진의 교훈).
    //   이 회귀는 v2 CLI 덤프를 읽는데, 그 덤프에 필드가 없으면 exSeen 이 false 로 남아 '-' 를 찍는다.
    if (v.expansions != null) r.exSeen = 1;
    r.ex += v.expansions || 0; r.cash += (v.finalTreasury && v.finalTreasury._cash) || 0;
  }
  for (const k of ['weap', 'weapQ', 'armor', 'cloth', 'cu', 'iron', 'ex', 'cash']) r[k] = +r[k].toFixed(0);
  r.tin = +r.tin.toFixed(1);
  rows.push(r);
}

const H = ['시드', '인구', '무기', '무기Q', '갑옷', '옷', '구리', '주석', '철', '대장', '광부', '재봉', '소멸', '확장셀', '국고현금'];
const W = [5, 6, 6, 7, 6, 6, 7, 7, 6, 5, 5, 5, 5, 7, 9];
const line = (cells) => cells.map((c, i) => String(c).padStart(W[i])).join('');
console.log(`\n[v2 CLI 회귀] ${DAYS}일 · 마을 ${VILLAGES} · picker=rational · tickWorldV2 (프로덕션 동형)`);
console.log(line(H));
for (const r of rows) {
  if (r.err) { console.log(`  ${r.s} 실패 — ${r.msg || ''}`); continue; }
  console.log(line([r.s, r.pop, r.weap, r.weapQ, r.armor, r.cloth, r.cu, r.tin, r.iron, r.smith, r.miner, r.tailor, r.dead, r.exSeen ? r.ex : '-', r.cash]));
}
const ok = rows.filter(r => !r.err);
const S = (k) => ok.reduce((a, r) => a + r[k], 0);
if (ok.length) console.log(line(['합계', S('pop'), S('weap'), S('weapQ'), S('armor'), S('cloth'), S('cu'), S('tin').toFixed(1), S('iron'), S('smith'), S('miner'), S('tailor'), S('dead'), S('ex'), S('cash')]));
if (ok.length < rows.length) { console.error(`\n❌ ${rows.length - ok.length}개 시드 실패`); process.exit(1); }
