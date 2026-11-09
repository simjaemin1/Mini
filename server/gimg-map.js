'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// 게임 그림 매니페스트 — ★[T1131 2026-11-04] 그림 webp 쌍둥이 + 그림 주소 내용 해시(T1123 회부 2 · 4)
//
// ★무엇: 클라가 짓는 주소(종전 그대로 — `/assets/trees/tree01.png` · `/terrain.json` …) → 내는 주소
//   (`/assets/trees/tree01.webp?v=<그 파일 내용 sha1 앞 10자>`)의 표 하나. central 이 기동 때 한 번 짓고
//   `/gimg-map.json?v=<표 자신의 sha1 앞 10자>` 로 낸다(immutable) · 그 주소는 `/zones` 칸 `gimgMap` 이 알린다.
//   ⇒ 둘째 방문은 표도 그림도 캐시에서 꺼낸다(왕복 0). 그림이 바뀌면(배포 = central 재기동) 그 파일만 새 주소가 된다.
// ★왜 앵커 json 해시 칸이 아니라 매니페스트인가(카드 "요청 수가 적은 쪽 · 근거 한 줄"):
//   앵커 json 은 제 주소에 해시가 없어 둘째 방문에도 json 마다 304 왕복이 남고(문 json 여섯 — 밭 · 자연물 · 나무 종 · 아이콘 잠금 · 산 · terrain.json),
//   앵커가 없는 무리(지면 · 건물 · 다리 · 아이콘 · 나무 열둘)는 칸을 달 자리가 없다 — 매니페스트는 첫 방문 1 · 둘째 방문 0 이다.
// ★확장자도 이 표가 든다 — 산이 앵커 `ext` 로 하던 "클라가 형식을 짐작하지 않는다"를 무리 전부에 한 자리로 편다
//   (확장자는 앵커 · 해시는 매니페스트로 두면 정본이 둘이다). png 옆에 webp 쌍둥이가 있으면 webp 주소를 낸다
//   (`scripts/webp_twins.py` 가 쓴다 · 잠금 자 화소 같음은 `scripts/asset-lock.js` 가 지킨다). 쌍둥이가 없으면 png 주소에 해시만 단다.
// 손잡이 `T1131_WEBP`(`!== '0'` 켬 · 되돌림 `=0` = /zones 칸 없음 = 클라는 종전 png 주소 · 해시 없음 — T1123 그대로).
// ⚠그림 0 · 판정 0 · 새 수 0(카드가 준 sha1 앞 10자 하나).
// ═════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SS = require('./static-serve');

const PUB = path.join(__dirname, '..', 'public');
// 문을 지나는 무리(00-const `_gsrc` · `_gfetch` — T1123 §1 문 목록) · 산은 이미 webp(앵커 뒤)
const GROUPS = ['trees', 'nature', 'buildings', 'bridge', 'crops', 'terrain', 'icons', 'mountains', 'animals'];
// ★[T1237 · T1210 회부 7] 짐승 시트(`animals` — 받은 3D 모델을 구운 8방향 시트 · 클라 40-r2 가 `_gfetch` · `_gsrc` 로 받는다)도 문을 지난다.
//   짐승은 **종마다 폴더 하나**(`animals/water_deer/body_idle.png` …)라 무리 안 폴더를 **한 겹** 더 훑는다(아래 `scan`) —
//   다른 무리엔 폴더가 없어(T1237 실측 0) 그 무리들의 표 칸 · 차례는 그대로다.
const EXTRA = [['/assets/icons.lock.json', path.join(PUB, 'assets', 'icons.lock.json')],   // 무리 밖 문 json 둘
               ['/terrain.json', path.join(__dirname, 'hanbando-terrain.json')]];
const HASH = SS.HASH_MIN;   // 10 — static-serve 가 받는 앞자리와 같은 수(한 자리)
const ROUTE = '/gimg-map.json';

function on() { return process.env.T1131_WEBP !== '0'; }

let _m = null;
function build() {
  const t0 = Date.now();
  const map = {};
  let twin = 0, png = 0, other = 0;
  const pin = (served, file) => served + '?v=' + SS.entry(file).sha.slice(0, HASH);
  const scan = (base, d) => {   // 한 폴더 — 주소 바탕 `base`(/assets/<무리>[/<폴더>])
    const files = fs.readdirSync(d).sort();
    const has = new Set(files);
    for (const f of files) {
      const u = `${base}/${f}`, ext = path.extname(f).toLowerCase(), stem = f.slice(0, f.length - ext.length);
      if (ext === '.png') {
        const w = stem + '.webp';
        if (has.has(w)) { map[u] = pin(`${base}/${w}`, path.join(d, w)); twin++; }
        else { map[u] = pin(u, path.join(d, f)); png++; }
      } else if ((ext === '.webp' && !has.has(stem + '.png')) || ext === '.json') {   // 쌍둥이 webp 는 png 칸이 낸다(두 번 안 적는다)
        map[u] = pin(u, path.join(d, f)); other++;
      }
    }
    return files;
  };
  for (const g of GROUPS) {
    const d = path.join(PUB, 'assets', g);
    if (!fs.existsSync(d)) continue;
    const files = scan(`/assets/${g}`, d);
    for (const f of files) { const dd = path.join(d, f); if (fs.statSync(dd).isDirectory()) scan(`/assets/${g}/${f}`, dd); }   // ★[T1237] 한 겹 아래(짐승 종 폴더)
  }
  for (const [u, f] of EXTRA) if (fs.existsSync(f)) { map[u] = pin(u, f); other++; }
  const body = Buffer.from(JSON.stringify(map));
  const sha = crypto.createHash('sha1').update(body).digest('hex');
  _m = { map, body, sha, url: `${ROUTE}?v=${sha.slice(0, HASH)}`, n: Object.keys(map).length, twin, png, other, ms: Date.now() - t0 };
  return _m;
}
function get() { return _m || build(); }
function url() { return get().url; }
// /zones 칸 — 표를 못 지으면 칸을 안 단다(클라는 종전 png 주소로 간다 · /zones 는 안 넘어진다)
function field() { try { return { gimgMap: get().url }; } catch (e) { return {}; } }
function serve(req, res) { const m = get(); return SS.serveMem(req, res, ROUTE, m.body, req.url, 'application/json'); }

module.exports = { on, build, get, url, field, serve, ROUTE, GROUPS, HASH };
