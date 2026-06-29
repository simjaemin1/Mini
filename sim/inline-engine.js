// economy-engine.browser.js 를 ../../마을실험실.html 의 <script> 블록으로 인라인.
// 마을실험실.html은 file://로 직접 열리는 자체완결 프로토타입이라, 외부 src 대신 인라인이 안전.
// 엔진(economy-sim) 수정 후: node sim/build-econ-bundle.js && node sim/inline-engine.js
const fs = require('fs');
const path = require('path');
const lab = path.join(__dirname, '..', '..', '마을실험실.html');
const bundlePath = path.join(__dirname, 'economy-engine.browser.js');

let H = fs.readFileSync(lab, 'utf8');
// </script>가 HTML 파싱을 깨지 않게 이스케이프(번들은 순수 JS라 보통 없음)
const bundle = fs.readFileSync(bundlePath, 'utf8').replace(/<\/script>/g, '<\\/script>');
const block =
  '<!-- ENGINE-BUNDLE-START · durango-mini/sim/economy-engine.browser.js 인라인 · 재생성: node durango-mini/sim/inline-engine.js -->\n' +
  '<script>\n' + bundle + '\n</scr' + 'ipt>\n' +
  '<!-- ENGINE-BUNDLE-END -->\n';

if (/<!-- ENGINE-BUNDLE-START[\s\S]*?ENGINE-BUNDLE-END -->\n/.test(H)) {
  H = H.replace(/<!-- ENGINE-BUNDLE-START[\s\S]*?ENGINE-BUNDLE-END -->\n/, block);
  console.log('[inline] 기존 엔진 블록 교체');
} else {
  const i = H.indexOf('<script>');
  if (i < 0) throw new Error('마을실험실.html에 <script>가 없음');
  H = H.slice(0, i) + block + H.slice(i);
  console.log('[inline] 첫 <script> 앞에 엔진 블록 삽입');
}
fs.writeFileSync(lab, H);
console.log(`[inline] 완료: ${lab} (${(H.length / 1024).toFixed(0)} KB)`);
