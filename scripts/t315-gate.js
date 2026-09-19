#!/usr/bin/env node
// === scripts/t315-gate.js — T315 계측기: **살리기 게이트와 반례 쌍** ==================
//   (러너 밖 — `@regress` 표 없음. 끝난 판의 DB 를 읽을 뿐 세계를 돌리지 않는다.)
//
// ★왜 [재민 확정 2026-09-19 · T315]
//   `_mapBeds` 를 심으면 `_hcap = min(housing, _mapBeds)`(`sim/economy-sim.js:3140`)가 **좁아진다**.
//   T298 ⓓ 는 켠 세계에서도 9~12곳이 그 순간 출생 정지한다고 셈으로 말했다. 카드 §②의 "심는 날 게이트"는
//   그 수가 **0** 이어야 한다는 것이고, 반례 쌍은 *"간격을 좁히면 그 수가 준다"* 를 보이는 것이다.
//
// ★이 계측기가 하는 일 — **세계를 안 돌린다 · 코드 0 · 새 수 0**:
//   끝난 판의 존 DB 를 읽어(읽기 전용) 팔마다 셈하고, 팔 둘을 나란히 놓는다.
//     · 침상 = 완공 `house` 행의 층합 × `VillageLayout.HOUSE_CAP_PER_FLOOR` (**정본을 불러 쓴다**)
//     · `_hcap` = min(`housing`, `_mapBeds`) — `_mapBeds` 가 없으면 `housing`(지금 서버가 접히는 그 꼴)
//     · **즉시 출생 정지** = 인구 ≥ `_hcap` 인 마을(그날 새 아이가 안 선다)
//   그리고 ⓒ: 적힌 `_mapBeds` 가 **완공층 × 정본 상수**와 한 마을도 안 다른지 전수.
//
// 실행: node scripts/t315-gate.js 라벨=DB경로 [라벨=DB경로 …]
//       node scripts/t315-gate.js 간격18=/tmp/a-z.db 간격15=/tmp/b-z.db
'use strict';
const path = require('path');
const VL = require(path.join(__dirname, '..', 'server', 'village-layout.js'));
const CAP = VL.HOUSE_CAP_PER_FLOOR;   // ★정원을 하네스에 적지 않는다 — 모듈이 정본

let fail = 0;
const chk = (c, m, extra) => { c || fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

function readArm(label, dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const vrows = db.prepare('SELECT id, name, population, econ_state, day FROM villages').all();
  const brows = db.prepare("SELECT village_id, floors, COUNT(*) n FROM village_buildings WHERE type = 'house' GROUP BY village_id, floors").all();
  db.close();
  const fl = new Map();
  for (const r of brows) fl.set(r.village_id, (fl.get(r.village_id) || 0) + (r.floors | 0) * r.n);
  const V = [];
  for (const v of vrows) {
    let ec = null; try { ec = v.econ_state ? JSON.parse(v.econ_state) : null; } catch (e) {}
    const floors = fl.get(v.id) || 0;
    const beds = floors * CAP;
    const housing = ec && ec.housing != null ? +ec.housing : null;
    const pop = ec && ec.npcs ? ec.npcs.length : (v.population | 0);
    const mapBeds = ec && ec._mapBeds !== undefined ? +ec._mapBeds : undefined;
    const hcap = housing == null ? null : (mapBeds === undefined ? housing : Math.min(housing, mapBeds));
    // ★셈의 뜻은 T212·T298 ⓓ 표의 그 세 열 그대로다(새 지표를 만들지 않는다):
    //   · `hcap 작아짐`   = 침상 < `housing`  — 살리면 상한이 실제로 좁아지는 마을
    //   · `즉시 출생 정지` = 그 중 **인구 ≥ 침상** — 심는 순간 새 아이가 안 서는 마을
    //   · `새로 막힘`     = 인구 ≥ 침상 **이면서** 인구 < `housing` — 지금은 안 막히는데 살리면 막히는 마을
    const narrows = housing != null && beds < housing;
    V.push({ id: v.id, name: v.name, day: v.day | 0, pop, housing, floors, beds, mapBeds, hcap, narrows,
             stopped: narrows && pop >= beds,
             newly: housing != null && pop >= beds && pop < housing,
             bedsOk: pop > 0 && beds >= pop });
  }
  V.sort((a, b) => a.id - b.id);
  const sum = (f) => V.reduce((s, x) => s + (f(x) || 0), 0);
  return { label, dbPath, V,
    day: V.length ? Math.max(...V.map((x) => x.day)) : 0,
    n: V.length, pop: sum((x) => x.pop), floors: sum((x) => x.floors), beds: sum((x) => x.beds),
    planted: V.filter((x) => x.mapBeds !== undefined).length,
    narrows: V.filter((x) => x.narrows).length,
    stopped: V.filter((x) => x.stopped).length,
    newly: V.filter((x) => x.newly).length,
    bedsOk: V.filter((x) => x.bedsOk).length,
    dead: V.filter((x) => x.pop === 0).length };
}

const args = process.argv.slice(2).filter((a) => a.includes('='));
if (!args.length) { console.error('쓰는 법: node scripts/t315-gate.js 라벨=DB경로 [라벨=DB경로 …]'); process.exit(2); }
const arms = args.map((a) => { const i = a.indexOf('='); return readArm(a.slice(0, i), a.slice(i + 1)); });

console.log('\n=== T315 살리기 게이트 · 반례 쌍 (끝난 판의 DB 만 읽는다) ===');
console.log(`  침상 정본: VillageLayout.HOUSE_CAP_PER_FLOOR = ${CAP} (모듈에서 읽음 — 사본 아님)`);
console.log(`  집 간격 정본: HOUSE_GAP_DERIVED = ${VL.HOUSE_GAP_DERIVED} · HOUSE_GAP_LOT = ${VL.HOUSE_GAP_LOT}\n`);
console.log('  팔            일수 마을  인구  완공층 침상 침상/인구 적힌마을 hcap작아짐 **즉시정지** 새로막힘 침상≥인구 소멸');
for (const a of arms) {
  console.log(`  ${a.label.padEnd(12)} ${String(a.day).padStart(4)} ${String(a.n).padStart(4)} ${String(a.pop).padStart(5)} ${String(a.floors).padStart(6)} ${String(a.beds).padStart(4)} ${(a.pop ? (100 * a.beds / a.pop).toFixed(0) : '-').padStart(8)}% ${String(a.planted).padStart(8)} ${String(a.narrows).padStart(9)} ${String(a.stopped).padStart(11)} ${String(a.newly).padStart(8)} ${String(a.bedsOk).padStart(9)} ${String(a.dead).padStart(4)}`);
}

// ── ⓒ 적힌 명부가 완공층 × 정본 상수인가 — **전수**(한 마을도 안 다르다) ───────────────
console.log('\nⓒ `_mapBeds` = 완공층 × 정본 상수 (전수 대조)');
for (const a of arms) {
  const on = a.V.filter((x) => x.mapBeds !== undefined);
  if (!on.length) { chk(true, `${a.label}: 적힌 마을 **0** — 손잡이 끔 판(되돌림: econ 은 \`housing\` 만 본다)`); continue; }
  const bad = on.filter((x) => x.mapBeds !== x.floors * CAP);
  chk(bad.length === 0, `${a.label}: 적힌 ${on.length}마을 전부 \`_mapBeds\` = 완공층 × ${CAP}`,
    bad.length ? `어긋남 ${bad.length}곳 · 예: ${bad[0].name} ${bad[0].mapBeds} ≠ ${bad[0].floors * CAP}` : `예: ${on[0].name} ${on[0].floors}층 × ${CAP} = ${on[0].mapBeds}`);
  const nz = on.filter((x) => x.floors > 0);
  chk(nz.length > 0, `  (자명 통과 금지) 완공집이 0채가 아닌 마을이 있다 — ${nz.length}/${on.length}곳`);
}

// ── ⓑ 반례 쌍 — 간격을 좁히면 정지 마을 수가 주나 · 게이트(정지 0)에 닿나 ────────────
if (arms.length >= 2) {
  console.log('\nⓑ 반례 쌍 — 순서가 카드다(간격 → 살리기)');
  const [A, B] = arms;
  chk(true, `${A.label} 즉시 정지 **${A.stopped}곳** ↔ ${B.label} 즉시 정지 **${B.stopped}곳**`, `Δ ${B.stopped - A.stopped}`);
  chk(A.stopped > 0 || B.stopped > 0,
    '  (자명 통과 금지) 적어도 한 팔에서 정지가 **일어난다** — 둘 다 0 이면 이 쌍이 아무 말도 안 한다');
  for (const a of arms) console.log(`  ⇒ 게이트(즉시 출생 정지 0): ${a.label} — ${a.stopped === 0 ? '**통과**' : `**미달 ${a.stopped}곳**`} · 새로막힘 ${a.newly} · 소멸 ${a.dead} · 침상≥인구 ${a.bedsOk}/${a.n}`);
  for (const a of arms) {
    const s = a.V.filter((x) => x.stopped).sort((p, q) => (q.pop - q.beds) - (p.pop - p.beds)).slice(0, 12);
    if (s.length) console.log(`  ${a.label} 정지 마을: ` + s.map((x) => `${x.name}(인구 ${x.pop} ≥ 침상 ${x.beds} · housing ${x.housing == null ? '?' : x.housing.toFixed(0)})`).join(' · '));
  }
}

console.log(`\n=== ${fail === 0 ? 'PASS' : `FAIL (${fail}건)`} ===\n`);
process.exit(fail ? 1 : 0);
