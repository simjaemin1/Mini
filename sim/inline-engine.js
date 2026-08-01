// economy-engine.browser.js 를 랩 HTML 의 <script> 블록으로 인라인.
// 랩 HTML 은 file:// 로 직접 열리는 자체완결 프로토타입이라, 외부 src 대신 인라인이 안전.
// 엔진(economy-sim) 수정 후: node sim/build-econ-bundle.js && node sim/inline-engine.js
//
// ★[2026-08-01 재민 지적 "기존에 존재하던 전쟁실험실을 수정하면 되는데?"]
//   이 스크립트는 대상이 마을실험실.html 로 **하드코딩**돼 있었다. 그래서 전쟁실험실.html 은
//   이 파이프에서 통째로 빠져 있었고, 인라인 엔진이 커밋 8ae796a 시점에 얼어붙었다
//   (그 뒤 엔진 소스 커밋 16개 — ALLOY_REF·Kocks·EFFDEM_SHARE·SMELT_YIELD·oreMix 전부 부재).
//   랩이 본 게임 엔진을 안 싣고 있으면 랩으로 잰 모든 수치가 헛것이다. 대상을 복수로 바꾼다.
//
// ★★번들은 **자동 생성물**이다. 랩에 결함 수정을 넣고 싶으면 엔진 소스(server/specialty.js ·
//   sim/economy-sim.js · sim/economy-sim-v2.js)를 고치고 build-econ-bundle 를 다시 돌린다.
//   번들이나 랩 HTML 의 인라인 블록을 **손으로 기우면**, 다음 재생성 때 조용히 사라지거나
//   (더 나쁘게) 낡은 번들이 멀쩡한 랩을 덮어쓴다. 실제로 그렇게 어긋난 적이 있다.
//   `--check` 로 어긋남을 먼저 확인하는 습관을 들인다.
//
// 사용:
//   node sim/inline-engine.js                 → 기본 대상 전부(마을실험실·전쟁실험실)
//   node sim/inline-engine.js a.html b.html   → 지정 파일만
//   node sim/inline-engine.js --check         → 갱신하지 않고 신선도만 보고(exit 1 = 낡음)
const fs = require('fs');
const path = require('path');
const bundlePath = path.join(__dirname, 'economy-engine.browser.js');
const labRoot = path.join(__dirname, '..', '..');
// ★기본 대상 = 인라인 엔진을 쓰는 랩 전부. 새 랩을 포크했으면 여기 추가한다.
const DEFAULT_LABS = ['마을실험실.html', '전쟁실험실.html'];

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const targets = (argv.filter(a => !a.startsWith('--')).length
  ? argv.filter(a => !a.startsWith('--'))
  : DEFAULT_LABS.map(f => path.join(labRoot, f)));

const bundle = fs.readFileSync(bundlePath, 'utf8').replace(/<\/script>/g, '<\\/script>');
const MARK = /<!-- ENGINE-BUNDLE-START[\s\S]*?ENGINE-BUNDLE-END -->\n/;
const block =
  '<!-- ENGINE-BUNDLE-START · durango-mini/sim/economy-engine.browser.js 인라인 · 재생성: node durango-mini/sim/inline-engine.js -->\n' +
  '<script>\n' + bundle + '\n</scr' + 'ipt>\n' +
  '<!-- ENGINE-BUNDLE-END -->\n';

let stale = 0, missing = 0;
for (const lab of targets) {
  const name = path.basename(lab);
  if (!fs.existsSync(lab)) { console.log(`[inline] ⚠ 없음: ${lab}`); missing++; continue; }
  let H = fs.readFileSync(lab, 'utf8');
  const m = H.match(MARK);
  const same = m && m[0] === block;
  if (CHECK) {
    if (!m) { console.log(`[inline] ${name}: 엔진 블록 없음 ❌`); stale++; }
    else if (!same) { console.log(`[inline] ${name}: **불일치** — 번들과 다르다 ❌`); stale++; }
    else console.log(`[inline] ${name}: 최신 ✅`);
    continue;
  }
  if (same) { console.log(`[inline] ${name}: 이미 최신 — 건너뜀`); continue; }
  if (m) { H = H.replace(MARK, block); console.log(`[inline] ${name}: 기존 엔진 블록 교체`); }
  else {
    const i = H.indexOf('<script>');
    if (i < 0) { console.log(`[inline] ⚠ ${name}: <script> 없음 — 건너뜀`); missing++; continue; }
    H = H.slice(0, i) + block + H.slice(i);
    console.log(`[inline] ${name}: 첫 <script> 앞에 엔진 블록 삽입`);
  }
  fs.writeFileSync(lab, H);
  console.log(`[inline] 완료: ${lab} (${Buffer.byteLength(H)} bytes)`);
}
if (CHECK && (stale || missing)) process.exit(1);
