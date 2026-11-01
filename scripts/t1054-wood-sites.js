'use strict';
// (@regress 없음 — 러너 밖 · T1054 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1054-wood-sites.js — 곳간 목재를 바꾸는 **코드 자리**(파일:줄)마다 첫해 합 · 틱 안 ↔ 틱 밖 · 서버 ↔ 랩 같은 자 ===
//   랩:   T1054_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1054-wood-sites.js" node scripts/t17-metrics.js 365 1020
//   서버: NODE_OPTIONS="-r $PWD/scripts/t1054-wood-sites.js" node scripts/t577-server-run.js 365 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1054.json`)
//   어떻게(값 무변 — 쓰기를 가로채 그대로 적는다):
//     econ 마을 곳간(`v.storage`)의 `wood` 칸을 같은 이름의 접근자 칸으로 바꿔 둔다(읽기 = 그 값 · 쓰기 = 그 값을 적고 차(새 값 − 옛 값)를 센다).
//     차는 그 쓰기를 한 **코드 자리**(호출 스택에서 이 파일 밖 첫 칸의 파일:줄 ← 그 다음 칸 — 부른 자리)에 쌓는다. 틱 안(`tickVillage` 안) ↔ 틱 밖을 가른다.
//     곳간 객체가 바뀌면(통째 갈음) 다음 틱 · 하루 끝에서 다시 단다 — 그 사이 몫은 하루 끝 곳간 차 − 센 차 = `unseen` 으로 남긴다(0 이어야 다 셌다).
//   적는 것(첫해 = 날 < 365 · 그 뒤 = rest): 자리별 {틱 안 +, 틱 안 −, 틱 밖 +, 틱 밖 −, 쓰기 수} · 마을별 자리 합 · 날 364 곳간 목재.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1054_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1054.json' : '') : process.env.T1054_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const SELF = __filename;
//   관찰기 몸(다른 프리로드가 같은 함수를 감싼 겹)은 자리로 안 센다 — 그 아래 진짜 부른 자리를 적는다
const SKIP = /[\/\\]scripts[\/\\](t\d+-observe|t\d+-house|t1054-wood-sites|lib-day-deaths|lab-diverge-ctl|diverge-ctl|t\d+-probe)\.js$/;
let curDay = 0, inTick = 0;
const rec = { where: SERVER ? 'server' : path.basename(A1), y1: { sites: {}, byV: {}, unseen: 0 }, rest: { sites: {}, byV: {}, unseen: 0 }, snap: {}, lastDay: -1, err: null };
const B = () => rec[curDay < 365 ? 'y1' : 'rest'];
function site() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 14;
  const st = new Error().stack || ''; Error.stackTraceLimit = L;
  const out = [];
  for (const line of st.split('\n').slice(1)) {
    const m = line.match(/\(?([^\s()]+\.js):(\d+):\d+\)?\s*$/);
    if (!m || m[1] === SELF || SKIP.test(m[1])) continue;
    out.push(path.relative(ROOT, m[1]) + ':' + m[2]);
    if (out.length === 2) break;   // 쓴 자리 ← 부른 자리(공용 문 — `addProduce` · `actFromGranary` · `tickSubsistence` — 의 몫을 부른 쪽으로 가른다)
  }
  return out.length ? out.join(' ← ') : '?';
}
const HOOKED = new WeakSet(), counted = new WeakMap();
function hook(v) {
  const S = v && v.storage; if (!S || HOOKED.has(S)) return;
  HOOKED.add(S);
  let cur = S.wood;   // 칸 값(이 곳간 하나의 닫힘 — 곳간 객체에 새 칸 0)
  Object.defineProperty(S, 'wood', {
    configurable: true, enumerable: true,
    get() { return cur; },
    set(nv) {
      const ov = cur; cur = nv;
      try {
        const d = (+nv || 0) - (+ov || 0); if (!d) return;
        const k = site(), b = B();
        const r = b.sites[k] || (b.sites[k] = { tickP: 0, tickN: 0, outP: 0, outN: 0, n: 0 });
        if (inTick) { if (d > 0) r.tickP += d; else r.tickN += d; } else { if (d > 0) r.outP += d; else r.outN += d; }
        r.n++;
        const vn = v.name || '?', bv = b.byV[vn] || (b.byV[vn] = {}); bv[k] = (bv[k] || 0) + d;
        counted.set(v, (counted.get(v) || 0) + d);
      } catch (e) { rec.err = String(e && e.message); }
    },
  });
}
const tv = V1.tickVillage;
V1.tickVillage = function (v) { hook(v); inTick++; try { return tv.apply(this, arguments); } finally { inTick--; } };
const lastW = new WeakMap();
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d > rec.lastDay) {
        const b = rec[d < 365 ? 'y1' : 'rest'];
        let wood = 0;
        for (const v of world.villages || []) {
          hook(v);
          const w = (v.storage && v.storage.wood) || 0; wood += w;
          if (lastW.has(v)) b.unseen += (w - lastW.get(v)) - (counted.get(v) || 0);
          lastW.set(v, w); counted.set(v, 0);
        }
        if (d === 89 || d === 364) rec.snap[d] = { wood: +wood.toFixed(2) };
        rec.lastDay = d; curDay = d + 1;
      }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { for (const k of ['y1', 'rest']) rec[k].unseen = +rec[k].unseen.toFixed(4); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
