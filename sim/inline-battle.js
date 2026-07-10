// battle-core.js 를 대상 HTML(전쟁실험실.html)의 <!-- BATTLE-CORE --> 마커 사이에 인라인.
//   전쟁실험실.html은 file://로 직접 열리는 자체완결 프로토타입이라, 외부 src 대신 인라인이 안전.
//   sim/inline-engine.js(economy-engine → 마을실험실) 형제 패턴.
//   전투 코어 수정 후: node sim/inline-battle.js  (대상 기본 = ../../전쟁실험실.html, 인자로 경로 지정 가능)
//   ★ 전투실험실.html은 절대 대상 아님(읽기·복사 전용). 대상은 전쟁실험실.html.
const fs = require('fs');
const path = require('path');

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', '..', '전쟁실험실.html');
const corePath = path.join(__dirname, 'battle-core.js');

if (path.basename(target) === '전투실험실.html') {
  throw new Error('전투실험실.html은 인라인 대상이 될 수 없음(0리스크 원칙: 읽기·복사 전용).');
}
if (!fs.existsSync(target)) {
  console.error(`[inline-battle] 대상 HTML 없음: ${target}`);
  console.error('  전쟁실험실.html을 먼저 만들고, 코어를 넣을 자리에 아래 마커 한 쌍을 두세요:');
  console.error('    <!-- BATTLE-CORE -->');
  console.error('    <!-- /BATTLE-CORE -->');
  process.exit(1);
}

let H = fs.readFileSync(target, 'utf8');
// </script>가 HTML 파싱을 깨지 않게 이스케이프(코어는 순수 JS라 보통 없음)
const core = fs.readFileSync(corePath, 'utf8').replace(/<\/script>/g, '<\\/script>');
const block =
  '<!-- BATTLE-CORE · durango-mini/sim/battle-core.js 인라인 · 재생성: node durango-mini/sim/inline-battle.js -->\n' +
  '<script>\n' + core + '\n</scr' + 'ipt>\n' +
  '<!-- /BATTLE-CORE -->';

// 기존 마커 쌍이 있으면 그 사이(마커 포함)를 교체, 없으면 첫 <script> 앞에 삽입.
const pairRe = /<!-- BATTLE-CORE[\s\S]*?<!-- \/BATTLE-CORE -->/;
if (pairRe.test(H)) {
  H = H.replace(pairRe, block);
  console.log('[inline-battle] 기존 BATTLE-CORE 블록 교체');
} else {
  const i = H.indexOf('<script>');
  if (i < 0) throw new Error(`${path.basename(target)}에 <script>가 없음 — 마커를 둘 위치를 찾지 못함`);
  H = H.slice(0, i) + block + '\n' + H.slice(i);
  console.log('[inline-battle] 첫 <script> 앞에 BATTLE-CORE 블록 삽입');
}
fs.writeFileSync(target, H);
console.log(`[inline-battle] 완료: ${target} (${(H.length / 1024).toFixed(0)} KB)`);
