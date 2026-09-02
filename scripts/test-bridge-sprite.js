#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 다리 스프라이트 타일 선택 검증 하네스 ===
// 클라(public/client.js)의 타일 종류 판정식을 **원문 그대로 잘라내** 실제 다리 셀 집합(zone-config)에 돌린다.
// 검사: ①모든 셀이 6종 중 하나로 판정 ②다리 축이 실제 뻗은 방향과 일치 ③양끝만 cap, 중간은 mid
//        ④폭 2셀(평행 옆줄) 때문에 축이 뒤집히지 않는가 — 1칸만 보면 뒤집힌다(2칸 전방 판정의 존재 이유)
//        ⑤에셋 6장 실재 + 정사각 256²(크롭 금지 규약 — 이미지 중심=셀 중심)
//
// 실행: node scripts/test-bridge-sprite.js
const fs = require('fs');
const path = require('path');
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));

const SRC = require('./client-src.js').readClientSrc();

// ── 클라 원문에서 판정식 4줄을 잘라내 함수로 감싼다(드리프트 방지: 원문이 바뀌면 여기가 먼저 깨진다) ──
const m = SRC.match(/const cnt = \(dx, dy\) => \{[\s\S]*?const bs = 'bridge_'[^\n]*\n/);
if (!m) { console.error('✗ client.js에서 다리 타일 판정식을 찾지 못함 — 규약이 바뀌었는지 확인'); process.exit(1); }
const pick = new Function('bcx', 'bcy', 'c', m[0] + 'return bs;');

let fail = 0;
const chk = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };
console.log('=== 다리 스프라이트 타일 선택 검증 ===');

// ── 실제 다리 셀 ──
const flat = ZONES.hanbando.bridges || [];
const cells = [];
for (let i = 0; i + 1 < flat.length; i += 2) cells.push([flat[i], flat[i + 1]]);
const set = new Set(cells.map(([x, y]) => x + ',' + y));
const c = { bridges: set };
console.log(`다리 셀 ${cells.length}개`);

// ── 연결 성분(다리 개별체)으로 분해 ──
const seen = new Set(), groups = [];
for (const k of set) {
  if (seen.has(k)) continue;
  const q = [k]; seen.add(k); const g = [];
  while (q.length) {
    const cur = q.pop(); g.push(cur);
    const ci = cur.indexOf(','), x = +cur.slice(0, ci), y = +cur.slice(ci + 1);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (x + dx) + ',' + (y + dy);
      if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
  }
  groups.push(g);
}
console.log(`연결 성분(다리) ${groups.length}개`);

console.log('\n[① 모든 셀이 6종 중 하나로 판정된다]');
const KEYS = new Set(['bridge_mid_x', 'bridge_mid_y', 'bridge_cap0_x', 'bridge_cap0_y', 'bridge_cap1_x', 'bridge_cap1_y']);
const tally = {};
for (const [x, y] of cells) { const k = pick(x, y, c); tally[k] = (tally[k] || 0) + 1; }
chk(Object.keys(tally).every((k) => KEYS.has(k)), '판정 결과 = ' + JSON.stringify(tally));

console.log('\n[② 축 판정이 실제 뻗은 방향과 일치 · ③ 양끝만 cap]');
for (const g of groups) {
  const xs = g.map((k) => +k.slice(0, k.indexOf(','))), ys = g.map((k) => +k.slice(k.indexOf(',') + 1));
  const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
  const trueAxis = spanX >= spanY ? 'x' : 'y';
  const keys = g.map((k) => pick(+k.slice(0, k.indexOf(',')), +k.slice(k.indexOf(',') + 1), c));
  const axes = new Set(keys.map((k) => k.slice(-1)));
  const caps = keys.filter((k) => k.includes('cap')).length;
  const width = trueAxis === 'x' ? spanY + 1 : spanX + 1;      // 다리 폭(셀)
  const okAxis = axes.size === 1 && [...axes][0] === trueAxis;
  const okCaps = caps === width * 2;                            // 양끝 줄만 cap(폭만큼 ×2)
  chk(okAxis && okCaps,
    `길이 ${Math.max(spanX, spanY) + 1}·폭 ${width} ${trueAxis}축 다리 — 판정축 ${[...axes].join('/')}, cap ${caps}개(기대 ${width * 2})`);
}

console.log('\n[④ 1칸 전방만 보면 축이 뒤집힌다 — 2칸 판정의 필요성(반례 실측)]');
{
  const naive = (bcx, bcy) => {
    const n1 = (dx, dy) => (set.has((bcx + dx) + ',' + (bcy + dy)) ? 1 : 0);
    return (n1(-1, 0) + n1(1, 0)) >= (n1(0, -1) + n1(0, 1)) ? 'x' : 'y';
  };
  let flip = 0;
  for (const [x, y] of cells) if (naive(x, y) !== pick(x, y, c).slice(-1)) flip++;
  chk(flip > 0, `1칸 판정과 어긋나는 셀 ${flip}개 — 폭 2셀 평행줄 때문. 2칸 전방 판정이 이걸 막는다`);
}

console.log('\n[④-2 ★불변식: 다리는 동서남북 4방(축 직선)으로만 이어진다 — 대각 연결 금지(사용자 확정)]');
{
  // 계획기 v1·v2 모두 축 직선만 만든다. 대각으로만 이어진 셀이 있으면 **데이터 오류**다.
  //   판정: 4방 이웃이 하나도 없는데 대각 이웃은 있는 셀 = 대각 연결. 고립 셀(폭 1의 끝)도 함께 본다.
  let diagOnly = 0, isolated = 0;
  const bad = [];
  for (const [x, y] of cells) {
    const orth = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => set.has((x + dx) + ',' + (y + dy))).length;
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dx, dy]) => set.has((x + dx) + ',' + (y + dy))).length;
    if (orth === 0 && diag > 0) { diagOnly++; if (bad.length < 5) bad.push(x + ',' + y); }
    if (orth === 0 && diag === 0) { isolated++; if (bad.length < 5) bad.push('고립 ' + x + ',' + y); }
  }
  chk(diagOnly === 0, `대각으로만 이어진 셀 ${diagOnly}개${bad.length ? ' — ' + bad.join(' ') : ''}`);
  chk(isolated === 0, `고립 셀 ${isolated}개(다리는 최소 2셀 이상 이어져야 한다)`);
  // 성분별 형태: 축 직선 다리이므로 각 성분은 (길이 L × 폭 W)의 꽉 찬 직사각형이어야 한다
  let notRect = 0;
  for (const g of groups) {
    const xs = g.map((k) => +k.slice(0, k.indexOf(','))), ys = g.map((k) => +k.slice(k.indexOf(',') + 1));
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    if (w * h !== g.length) notRect++;
  }
  chk(notRect === 0, `성분 ${groups.length}개 전부 꽉 찬 직사각형(축 직선 다리의 필요조건) — 위반 ${notRect}`);
}

console.log('\n[④-3 에디터 오버레이 페이로드 — export 스크립트가 다리를 그대로 싣는가]');
{
  const e1 = fs.readFileSync(path.join(__dirname, 'export-for-editor.js'), 'utf8');
  const e2 = fs.readFileSync(path.join(__dirname, 'export-world-for-editor.js'), 'utf8');
  chk(/bridges:\s*BRIDGES/.test(e1), 'export-for-editor.js가 bridges를 싣는다(가공 없이)');
  // 11차: export-world-for-editor.js 를 게임 로드본 전 존 기반으로 재작성하면서 다리는
  // zone-config 에서 존별로 직접 싣는다(`bridges: zc.bridges || []`). 옛 즉시실행 try 형태는 사라졌다.
  chk(/bridges:\s*zc\.bridges/.test(e2) || /bridges:\s*\(\(\) => \{ try \{ return/.test(e2), 'export-world-for-editor.js가 bridges를 싣는다');
}

console.log('\n[⑤ 에셋 실재 + 정사각(크롭 금지 규약)]');
const ADIR = path.join(__dirname, '..', 'public', 'assets', 'bridge');
// ★1셀 규약 에셋 전량(다리 타일 + 곳간 짐더미·소품 + 마당 소품) — 클라 로더 목록과 실제 파일이 어긋나면 잡는다.
const CELL_KEYS = [...KEYS, 'gran_pile1', 'gran_pile2', 'gran_pile3', 'gran_prop',
  'yard_hearth', 'yard_jar1', 'yard_jar2', 'yard_garden',
  'mkt_mat', 'mkt_basket', 'mkt_jar', 'mkt_hide',   // ★10차 T4 장마당 좌판(캐러밴 체류 중에만 깔린다)
  'ditch_x', 'ditch_y', 'ditch_c'];                 // ★11차 T3 환호 도랑(가로·세로·모서리)
{
  const li = SRC.indexOf('_bridgeLoaded');
  const seg = SRC.slice(Math.max(0, li - 200), li + 900);
  const loader = seg.match(/for \(const k of \[([\s\S]*?)\]\)/);
  const listed = loader ? [...loader[1].matchAll(/'([\w]+)'/g)].map((m) => m[1]) : [];
  chk(listed.length === CELL_KEYS.length && CELL_KEYS.every((k) => listed.includes(k)),
    `클라 로더 목록(${listed.length}) = 1셀 에셋 목록(${CELL_KEYS.length})`);
  for (const k of CELL_KEYS) {
    const f = path.join(ADIR, k + '.png');
    let ok2 = false, dim = '없음';
    if (fs.existsSync(f)) { const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20); dim = `${w}×${h}`; ok2 = (w === h && w === 256); }
    chk(ok2, `${k}.png ${dim}`);
  }
}
if (0) for (const k of KEYS) {
  const f = path.join(ADIR, k + '.png');
  let ok = false, dim = '없음';
  if (fs.existsSync(f)) {
    const b = fs.readFileSync(f);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);   // PNG IHDR
    dim = `${w}×${h}`; ok = (w === h && w === 256);
  }
  chk(ok, `${k}.png ${dim}`);
}

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
