#!/usr/bin/env node
// === 11차 T3 — 환호(도랑) 검증 하네스 ===
// 계약(server/village-layout.js ditchRing 상단 주석 = 유일한 정의):
//   · 검단리 규약: 폭 2셀 타원 링(장/단 = 118/70), 출입구 = **도랑을 파지 않은 셀** 남·북 각 1곳(폭 3칸).
//   · 콜라이더는 다리 층 규약 동형: 서버 단일 술어(isTerrainBlockedLocal) + 클라 미러(_ditchAbs) + welcome 페이로드.
//   · ★핵심 불변식: 링은 **4연결**이어야 한다. 대각으로만 닿으면 연속 좌표 이동이 모서리로 새어 방어선이 뚫린다.
//   · 소급 금지: generate()는 도랑을 만들지 않는다(시범 마을만 villages.js가 실체화).
//
// 실행: node scripts/test-ditch.js
const path = require('path');
const fs = require('fs');
const VL = require(path.join(__dirname, '..', 'server', 'village-layout'));

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// 합성 마을 — 실제 시딩과 같은 모양(중심 + 집 N채가 HALL_CLEAR 밖에 흩어짐)
function mkVillage(n, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const houses = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = 18 + rnd() * 16;
    houses.push({ cx: Math.round(Math.cos(a) * r / 2) * 2, cy: Math.round(Math.sin(a) * r / 2) * 2 });
  }
  return houses;
}
const flatTerrain = { isBlocked: () => false, isWater: () => false };

console.log('=== 11차 T3 · 환호(도랑) 검증 ===');

console.log('\n[① 링 기하 — 폭 2셀·타원비·집 전부 안쪽]');
const RINGS = [];
for (const [n, seed] of [[6, 11], [10, 22], [14, 33]]) {
  const houses = mkVillage(n, seed);
  const r = VL.ditchRing(0, 0, { houses, terrain: flatTerrain, axis: { toWater: { x: 0, y: 1 } } });
  RINGS.push({ n, r, houses });
  const ratio = r.a / r.b;
  chk(Math.abs(ratio - VL.DITCH_AXIS_RATIO) < 0.06,
    `집 ${n}채 — 장/단 ${ratio.toFixed(3)} ≈ 검단리 ${VL.DITCH_AXIS_RATIO.toFixed(3)} (a=${r.a}·b=${r.b}, 도랑 ${r.cells.length}셀)`);
  // 집 부지(원 r=LOT_R) 전부가 안쪽 타원 안
  let out = 0;
  for (const h of houses) {
    const pu = h.cx * r.frame.u.x + h.cy * r.frame.u.y, pv = h.cx * r.frame.v.x + h.cy * r.frame.v.y;
    const rr = Math.sqrt(Math.pow((Math.abs(pu) + VL.LOT_R) / r.a, 2) + Math.pow((Math.abs(pv) + VL.LOT_R) / r.b, 2));
    if (rr > 1.02) out++;
  }
  chk(out === 0, `  집 부지 ${n}채 전부 링 안쪽 — 밖 ${out}채`);
}

console.log('\n[② ★4연결 불변식 — 대각 누수 0(모서리로 사람이 새면 방어선이 아니다)]');
for (const { n, r } of RINGS) {
  const c = VL.ditchConnectivity(r.cells);
  chk(c.diagOnly === 0, `집 ${n}채 — 대각으로만 이어진 지점 ${c.diagOnly}곳(0이어야 함)`);
  chk(c.comps === 2, `  4연결 성분 ${c.comps}개 = 출입구 2곳으로 끊긴 반쪽 링 2개(고증: 남북 각 1개소)`);
}

console.log('\n[③ 출입구 — "도랑을 파지 않은 셀"이 실제로 뚫려 있다]');
for (const { n, r } of RINGS) {
  const S = new Set(r.cells.map((c) => c.cx + ',' + c.cy));
  // 출입구 후보 = ditchRing이 gates로 돌려준 셀. 그 셀은 도랑 집합에 없어야 한다.
  const bad = r.gates.filter((g) => S.has(g.cx + ',' + g.cy)).length;
  chk(bad === 0, `집 ${n}채 — 출입구 ${r.gates.length}셀이 전부 안 파여 있음(도랑 집합 침범 ${bad})`);
  // 남·북 두 곳으로 갈라지는지(단축 부호가 양/음 둘 다)
  const pos = r.gates.filter((g) => (g.cx * r.frame.v.x + g.cy * r.frame.v.y) > 0).length;
  chk(pos > 0 && pos < r.gates.length, `  출입구가 남·북 두 곳으로 갈림 — 양(+) ${pos} / 음(−) ${r.gates.length - pos}`);
}

console.log('\n[④ 도달성 — 밖에서 큰집까지 갈 수 있고, 그 길은 반드시 출입구를 지난다]');
for (const { n, r } of RINGS) {
  const S = new Set(r.cells.map((c) => c.cx + ',' + c.cy));
  const R = r.ao + 6;
  const bfs = (blockGates) => {                    // 밖(모서리)에서 중심까지 4방 BFS
    const G = new Set(S);
    if (blockGates) for (const g of r.gates) G.add(g.cx + ',' + g.cy);
    const start = (-R) + ',' + (-R), seen = new Set([start]), q = [[-R, -R]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === 0 && y === 0) return true;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, ny = y + ay;
        if (nx < -R || ny < -R || nx > R || ny > R) continue;
        const k = nx + ',' + ny;
        if (seen.has(k) || G.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return false;
  };
  chk(bfs(false) === true, `집 ${n}채 — 출입구 열림: 밖 → 큰집 도달 ○`);
  chk(bfs(true) === false, `  출입구를 막으면 도달 ✗ (= 통행이 오직 출입구로만 이뤄진다는 증명)`);
}

console.log('\n[⑤ 대각 이동(8방)으로도 링을 못 뚫는다 — 연속 좌표 이동 방어]');
for (const { n, r } of RINGS) {
  const S = new Set(r.cells.map((c) => c.cx + ',' + c.cy));
  const R = r.ao + 6;
  const G = new Set(S); for (const g of r.gates) G.add(g.cx + ',' + g.cy);   // 출입구까지 막고
  const seen = new Set(['' + (-R) + ',' + (-R)]), q = [[-R, -R]];
  let reached = false;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === 0 && y === 0) { reached = true; break; }
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + ax, ny = y + ay;
      if (nx < -R || ny < -R || nx > R || ny > R) continue;
      const k = nx + ',' + ny;
      if (seen.has(k) || G.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  chk(reached === false, `집 ${n}채 — 8방 이동으로도 못 뚫음(대각 새기 없음)`);
}

console.log('\n[⑥ 소급 금지 — generate()는 도랑을 만들지 않는다]');
{
  // 지형 스텁으로 generate를 부르는 건 계약 밖(elev·isForest 등 전체 인터페이스 필요) →
  // **정적 검사**로 본다: generate 본문에 ditchRing 호출이 없어야 하고, 산출물 필드에도 없어야 한다.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'village-layout.js'), 'utf8');
  const gs = src.indexOf('function generate('), ge = src.indexOf('// 강가(land 인접 water) 셀');
  const body = src.slice(gs, ge > gs ? ge : src.length);
  chk(gs > 0 && !/ditchRing\s*\(/.test(body), 'generate 본문에 ditchRing 호출 없음(레이아웃은 도랑을 모른다)');
  chk(!/ditch/.test(body.slice(body.lastIndexOf('return {'))), 'generate 반환 객체에 도랑 필드 없음 = 기존 50마을 무영향');
  // 실체화도 시범 마을로 제한되는가(수 상한 상수 실재)
  const vsrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  chk(/DITCH_PILOT_MAX/.test(vsrc) && /VILLAGE_DITCH_MAX/.test(vsrc), '실체화가 시범 수(VILLAGE_DITCH_MAX)로 제한됨');
}

console.log('\n[⑦ 콜라이더 3중 규약 — 서버 술어·클라 미러·welcome 페이로드가 전부 실재]');
{
  const zone = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  const cli = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const vil = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  chk(/function isDitchTileLocal/.test(zone) && /if \(isDitchTileLocal\(x, y\)\) return true;/.test(zone),
    '서버: isTerrainBlockedLocal 안에서 도랑 차단(모든 이동층 공유 단일 술어)');
  chk(/refreshDitchCells\(\)/.test(zone), '서버: SimVillages.init 직후 콜라이더 적재(유령 도랑 방지)');
  chk((zone.match(/ditches: ditchPayload\(\)/g) || []).length === 2, `서버: welcome 2곳 모두 ditches 페이로드 (${(zone.match(/ditches: ditchPayload\(\)/g) || []).length}/2)`);
  chk(/const _ditchAbs = new Set\(\)/.test(cli) && /if \(isDitchAtAbs\(x, y\)\) return true;/.test(cli),
    '클라: _ditchAbs 미러 + isTerrainBlockedAtAbs 반영(러버밴딩 방지)');
  chk(/msg\.ditches/.test(cli), '클라: welcome ditches 수신');
  chk(/kind: 'ditch'/.test(cli) && /item\.kind === 'ditch'/.test(cli), '클라: 도랑 타일 렌더 경로');
  chk(/function ditchCells\(\)/.test(vil) && /ditchCells,/.test(vil), '마을: ditchCells 원천 export');
  chk(/type: 'ditch'/.test(vil), '마을: village_buildings ditch 행 영속(사물 층 — 지형 재빌드 없음)');
  chk(/_ditchInitAll\(\)/.test(vil), '마을: 부팅 자가치유 실체화(DB 리셋 없이 반영)');
}

console.log('\n[⑧ 규모 고증 대조 — 검단리 총길이 298m·폭 2m]');
{
  const { r } = RINGS[1];
  // 타원 둘레 근사(라마누잔) × 폭 2 = 도랑 셀 수의 이론값
  const a = (r.a + r.ao) / 2, b = (r.b + r.bo) / 2;
  const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const est = per * VL.DITCH_W;
  const got = r.cells.length + r.gates.length;
  chk(Math.abs(got - est) / est < 0.25, `둘레 ${per.toFixed(0)}m × 폭 ${VL.DITCH_W} = 이론 ${est.toFixed(0)}셀 vs 실측 ${got}셀 (오차 ${(Math.abs(got - est) / est * 100).toFixed(1)}%)`);
  console.log(`     └ 검단리 실측 298m(폭 2m ≒ 596셀)과 같은 자릿수 — 1셀=1m 실축이라 환산 없이 비교된다`);
}

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
