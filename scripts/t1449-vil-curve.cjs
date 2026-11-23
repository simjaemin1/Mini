// (@regress 없음 — 계측 훅 · 러너 밖 · T1449 할 일 0 · 판정 0)
// === scripts/t1449-vil-curve.cjs — 서버 판(t577 · 가상 시계) 마을 곡선: 마을마다 날마다 사람 · 먹을 것 · 주석 · 구리 · 청동 · 굶주림 · 직업 (존 아이 프리로드 · 제품 무접촉) ===
//   T1449_CURVE_OUT=<파일> — 판 끝에 JSON 한 덩이 { names, days: [[날, [마을마다 [사람, 먹을 것(food + cooked_food), 나무, 주석, 구리, 원석, 근접검, 청동 근접검, 허기 평균, 어제보다 준 사람, 전사, 직업 줄]]]] }.
//     읽는 문 = 서버 장부 `scanDay`(econ 하루 끝 · `server-baseline-check` 훅과 같은 문) — 세계에 아무것도 안 쓴다.
//   T1449_NUDGE=<마을>:<칸>:<더할 수>[,…] — **흔들림 판**(카드 덧붙임 셋 "옛 지도에 아무 뜻 없는 작은 흔들림 세 가지"): 첫 장부 날(1일) 끝에 그 마을 곳간 칸 하나에 그 수를 더한다(난수 무소비).
//     흔들림이 없으면(빈 값) 관찰만 — 같은 판이 기준선 지문과 같아야 한다.
'use strict';
const OUT = process.env.T1449_CURVE_OUT;
if (OUT && /zone\.js$/.test(process.argv[1] || '')) {   // 존 아이만(t577 바깥 판은 장부가 없다 — 끝에 빈 글자로 덮지 않게)
  const path = require('path'), fs = require('fs');
  const ROOT = process.cwd();   // 존 아이의 뿌리(t577 이 cwd = 그 트리로 띄운다 — 다른 작업 트리 판에서도 그 트리의 장부 모듈을 문다)
  const NUDGE = String(process.env.T1449_NUDGE || '').split(',').filter(Boolean).map((s) => { const [v, k, d] = s.split(':'); return { v, k, d: +d }; });
  const R = (x) => Math.round((+x || 0) * 100) / 100;
  const days = [];
  let last = -1, names = null, nudged = false;
  const dead = new Map();   // 마을 → 앞날 사람 수(줄면 죽음 · 떠남으로 센다)
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const V = world.villages || [];
          if (!names) names = V.map((v) => v.name);
          const row = [];
          for (const v of V) {
            const st = v.storage || {}, np = v.npcs || [];
            let hu = 0; const jobs = {};
            for (const n of np) { if (n && typeof n === 'object') { hu += +n.hunger || 0; const j = n.currentJob || '-'; jobs[j] = (jobs[j] || 0) + 1; } }
            const pop = np.length, p0 = dead.has(v.name) ? dead.get(v.name) : pop;
            dead.set(v.name, pop);
            const sw = (+st.weapon || 0) * (v._swordFrac != null ? v._swordFrac : 0.5);   // 근접검 곳간(경제 장부 꼴 — `weapon × _swordFrac`)
            row.push([pop, R((+st.food || 0) + (+st.cooked_food || 0)), R(st.wood), R(st.tin), R(st.copper), R(st.ore), R(sw), R(sw * Math.max(0, Math.min(1, +v._t1344Q || 0))),
              pop ? R(hu / pop) : 0, Math.max(0, p0 - pop), (v.counts && v.counts.warrior) || 0, Object.entries(jobs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([j, n]) => j + n).join(' ')]);
          }
          days.push([d, row]);
          if (!nudged && NUDGE.length && d >= 1) {
            nudged = true;
            for (const n of NUDGE) { const v = V.find((x) => x.name === n.v); if (v) { v.storage = v.storage || {}; v.storage[n.k] = (+v.storage[n.k] || 0) + n.d; } }
          }
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ names, nudge: NUDGE, days })); } catch (e) {} });
}
