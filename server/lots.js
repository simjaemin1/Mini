// === server/lots.js — 식품 로트 장부(취득일) [재민 확정 2026-08-27] ============
//
// ★★인벤 3층 구조의 가운데 층. 재민 확정:
//   *"감자·곡물·고기 등 상하는 식품 — `(품목, 취득일, 수량)` 레코드. 같은 날 얻은 것끼리는
//     동질(구별 무의미), 다른 날 것과는 로트가 갈린다. 신선도는 타이머가 아니라 조회 시
//     (오늘−취득일)로 유도한다."*
//
// ★**틱 비용 0** — 광맥 번영도·어장 재생과 같은 문법(lazy timestamp). 여기엔 setInterval 이 없다.
// ★**로트 병합 금지** — 나이를 섞으면 거짓말이다. 상한에 닿았을 때만 예외이고,
//   그때도 **오래된 쪽으로만** 뭉갠다(음식이 실제보다 **싱싱해 보이는 일은 없게**). 아래 `_cap` 참조.
//
// ✅**그 층이 앉았다 [2026-08-31]** — 곡선은 예고대로 **조회 함수 하나**(`spoil.freshnessOf`)로
//   얹혔고, **로트 레코드는 한 글자도 안 바뀌었다**(`{d, n}` 그대로 · 저장 형식 그대로).
//   이 파일이 하는 일은 종전과 같다: 수량의 나이 분포를 적는다. 신선도는 `server/spoil.js` 가
//   그 나이에서 유도한다 — 여기에 부패 상수를 적지 마라(그게 사본이다).
//
// ── 불변식 ───────────────────────────────────────────────────────────────────
//   `inventory[item] === Math.floor(Σ lots[item].n)`
//   수량의 정본은 여전히 **인벤**이다. 로트는 그 수량의 **나이 분포**를 적는다.
//   그래서 로트를 안 거치는 경로가 인벤을 건드려도 `reconcile` 이 스스로 낫는다
//   (그 몫은 "오늘 얻은 것"으로 잡힌다 — 이건 알고 하는 근사이고, 아래 주석에 못 박았다).
//   ★소수 몫은 인벤에 안 올라간다 — `oreCarry`(선광 소수분 이월)와 같은 규약이라
//     "0.75 남은 곡식은 아직 못 판다"가 자연스럽게 성립한다.
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  MAX_LOTS: Math.max(2, Math.round(_num('LOT_MAX_PER_ITEM', 12))),
  EPS: 1e-6,
};
// ★★[2026-08-31 · 부패 배치가 드러낸 잠복 결함] **게임일에 `| 0` 을 쓰면 안 된다.**
//   `| 0` 은 **int32 로 자른다**(2^31 = 21.4억). 게임일은 `(now − epoch) / dayMs` 라
//   하루가 짧은 하네스(`VILLAGE_DAY_MS=500` — `e2e-trade` 가 마을을 데울 때 쓴다)에선
//   **35.8억**이 나오고, 그 순간 `|0` 이 **−7.2억으로 감긴다**.
//   여태는 조용했다 — 취득일은 화면에 "N일 전"으로만 쓰였고, 감긴 값끼리 빼면 대개 상쇄됐다.
//   부패 곡선이 들어온 지금은 **나이가 42.9억 일**이 되어 갓 잡은 생선이 즉시 "상함"이 된다
//   (`e2e-trade` 5건이 실제로 그렇게 죽었다 — 제품이 아니라 이 한 글자가 원인이었다).
//   ⇒ 게임일은 **`_day()` 하나로만** 정수화한다. 배정도 실수는 2^53 까지 정확하다.
const _day = (x) => { const v = Math.floor(Number(x)); return Number.isFinite(v) ? v : 0; };

// ── 로트로 관리할 품목 ──────────────────────────────────────────────────────
//   상하는 식품만. 돌·장작·섬유는 무기한 벌크라 로트가 없다(나이가 뜻이 없다).
let Specialty = null;
try { Specialty = require('./specialty'); } catch (e) { Specialty = null; }
const Spoil = require('./spoil');
const LOT_CORE = new Set(['food', 'berry', 'fruit', 'vegetable', 'meat', 'meat_raw', 'meat_cooked',
  'fish', 'fish_cooked', 'berry_jam', 'cooked_food', 'mushroom', 'milk', 'egg', 'cheese', 'bread']);
// ★[부패 배치 2026-08-31] 보존식도 **로트다** — 오래 가지만 영원하진 않다.
//   목록을 여기 옮겨 적지 않고 `spoil.PRESERVED_ITEMS` 를 **읽는다**(정본 하나).
for (const k of Object.keys(Spoil.PRESERVED_ITEMS)) LOT_CORE.add(k);
// ★★[작물 층 2026-08-31] 작물과 **씨앗**도 로트다.
//   작물: 34종 중 12종은 specialty agri 라 이미 로트였지만 나머지 22종은 아니었다 — 목록을 맞춘다.
//   씨앗: 종자도 늙는다(발아율). 목록 정본은 `server/crops.js` — 여기 옮겨 적지 않는다.
if (Spoil.Crops) {
  for (const c of Spoil.Crops.list()) { LOT_CORE.add(c.id); LOT_CORE.add(Spoil.Crops.seedOf(c.id)); }
}
// ★★[T694 2026-10-11 · 손잡이 `T694_GAME_MEAT=1` — 없음 = 끔 = 이 블록이 아무것도 안 한다(main 바이트)] 사냥 고기도 **로트다**
//   (곰고기 · 구운 사슴·들짐승고기 · 삶은 곰고기 — `meat_game` 은 특산 축산이라 이미 로트). 목록 정본은 `server/game-meat.js`(옮겨 적지 않는다).
{ let _GM = null; try { _GM = require('./game-meat'); } catch (e) {}
  if (_GM && _GM.on()) for (const k of _GM.lotItems()) LOT_CORE.add(k); }
// ★★[T725 ② 2026-10-13 · 손잡이 `T725_LOT_KINDS=1` — 없음·빈 값·0 = 끔 = 아래 표를 안 읽는다(main 바이트)] **안 썩는 재료는 로트가 아니다.**
//   아래 `isLot` 의 특산 규칙(해산물·축산·작물 = 상한다)이 **먹지 않는 재료**까지 통째로 쳐서 깃털·뼈·가죽·모피·삼에
//   보관일 5일(`spoil` 특산 기본값 `D.DEFAULT`)이 붙었다 — 손에서 그렇게 상하고, 곳간 그림자 로트의 70%가 이들이었다(T716 회부 ②).
//   ⇒ 규칙을 "먹을 것 + 썩는 것"으로 좁힌다: 먹을 것은 그대로 두고, 먹지 않는 재료 중 **출처가 안 썩는다고 말하는 것**만 뺀다.
//     새 수 0 · 새 곡선 0 — 썩는가는 품목 성질이고 출처는 줄마다 적었다(전문 표 `보고/T725_2026-10-13.md` §2).
//     ⚠"안 썩는다" = 마른 채 두면 날·달 단위로 상하지 않는다. 섬유는 젖으면(상대습도 65% 넘게) 곰팡이가 슨다(CCI Notes 13/15) —
//       이 세계엔 짐의 젖음 축이 없다(회부). 무두질 전 **생가죽은 썩는다** — 그 품목은 `hide` 다(지금도 로트가 아니다 · 넓히기는 재민 칸).
//     ⚠작물 카탈로그 품목(`LOT_CORE` — 삼(대마)·쪽·차·뽕잎)은 손대지 않는다(보관일이 재민 카탈로그 저장성 축에서 온다).
const T725_KINDS = process.env.T725_LOT_KINDS !== '0';   // ★[PM 10-14] 켬 기본 · 되돌림 `=0`
const NO_ROT = Object.freeze({
  leather:  '무두질 — 가죽의 단백질 구조를 영구히 바꿔 더 질기고 덜 분해되게 한다(Wikipedia "Tanning (leather)")',
  fur:      '무두질 — 위와 같은 줄(손질한 모피)',
  feather:  '90% 넘게 케라틴 · 펩신·트립신 같은 흔한 단백질 분해효소에 분해되지 않는 난분해 고분자(Li 2019, Front. Microbiol. 10:2717)',
  wool:     '케라틴(털 — 양털 포함) · 물·유기용매에 극히 안 녹는다(Wikipedia "Keratin")',
  horn:     '케라틴(뿔·발굽)(Wikipedia "Keratin")',
  bone:     '백골화 = 분해의 마지막 단계(뼈만 남는다) · 기름진 흙의 산이 약 20년에 녹이고 중성 흙·모래에선 수백 년(Wikipedia "Skeletonization")',
  ivory:    '매머드 상아 조각상이 4만 2천~4만 년 남았다(Wikipedia "Venus of Hohle Fels")',
  silk_raw: '비단 단백질(피브로인)이 8,500년 무덤 흙에서 · 비단 천 3630 BC(Wikipedia "Silk")',
  linen:    '리넨 옷이 3482~3102 BC 부터 남았다(Wikipedia "Tarkhan dress")',
  cotton:   '셀룰로스 섬유 — 상대습도 60% 아래면 곰팡이가 슬기 어렵다(CCI Notes 13/15) · 젖으면 썩는다(RMG "Cordage")',
  flax:     '줄기에서 섬유 아닌 것을 떼어 섬유를 거둔다(retting — 섬유는 남는 쪽 · 지나치면 셀룰라아제가 섬유도 약하게 한다)(Wikipedia "Retting") · 마른 섬유(CCI Notes 13/15)',
  hemp:     '위와 같은 줄(Retting — 삼) · 밧줄 내구성 마닐라급(RMG "Cordage: its origins, construction, properties and uses in ships")',
});
function isLot(item) {
  if (!item) return false;
  if (LOT_CORE.has(item)) return true;
  if (T725_KINDS && NO_ROT[item]) return false;   // ★[T725 ②] 안 썩는 재료(위 출처 표) — 끄면 이 줄 무동작
  const sp = Specialty && Specialty.RESOURCES && Specialty.RESOURCES[item];
  // 해산물·축산·작물은 상한다. 광물·임산물(통나무·송진)·가공 내구재는 아니다.
  return !!(sp && (sp.category === 'marine' || sp.category === 'livestock' || sp.category === 'agri'));
}

function all(p) {
  if (_mNpcBox(p)) { let L = _mNpc.get(p); if (!L) { L = {}; _mNpc.set(p, L); } return L; }   // ★[T732] NPC 몸 — 곁 장부(몸 필드 0)
  if (!p.lots || typeof p.lots !== 'object') p.lots = {}; return p.lots;
}
function of(p, item) { const L = all(p); if (!Array.isArray(L[item])) L[item] = []; return L[item]; }
function sum(p, item) { let s = 0; for (const l of of(p, item)) s += l.n; return +s.toFixed(6); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ★★★[T732 2026-10-14 · 손잡이 `T732_MOMENT_LOT` — ★[T778] 켬 기본 · `=0` 만 끔 = 아래 순간 갈래를 하나도 안 탄다(main 바이트)]
//   **로트 = 얻은 순간.** 재민 10-12 · 10-14 재확인(족보 631 ①): 신선도는 아이템마다 — **같은 순간에 얻은 것만 합친다.**
//   종전 열쇠는 **날**이었다: 같은 날 · 같은 자리 것은 노출을 개수 가중 평균해 한 로트로 뭉쳤고(0시 것과 23시 것이 하나),
//   노출은 정수 날로 쌓였다(그날 얻은 것은 그날 0시부터 늙는다 — T716 ① 뭉개지는 자리 ①·⑪). 켬이면:
//     · 열쇠 `k` = 얻은 순간(게임 ms · 절대 시계 — 존이 `setClock` 으로 꽂는다) · `d` = 그 순간의 날(화면 "N일 전" · 날 문법 호환)
//     · 노출 `e` 는 정산 순간 `t`(**소수 날**)까지 — `spoil.cumExposure` 가 이미 소수 날을 받는다(새 곡선 0 · 새 수 0)
//     · 같은 순간 · 같은 자리 · 같은 노출만 합친다(평균 0 — 합치는 둘이 같은 물건일 때만)
//     · 옛 레코드 `{d, n}` 은 **그 날 0시 순간**으로 읽는다(지우지 않는다) · `{d,n,e,t,m,w}` 는 `k = d 0시` 만 붙는다(값 연속)
//     · 상한(품목당 `LOT_MAX_PER_ITEM` 12)은 남긴다 — 까닭은 메모리 · 저장 크기(보고 §1 표). 뭉갤 때 규칙은 종전 그대로:
//       **가장 오래된 둘 · 더 이른 순간 · 큰 노출** → 음식이 실제보다 싱싱해 보이는 일 0(같은 순간으로 정산한 뒤 견준다).
//     · 맞추기(`reconcile`)가 남는 몫을 "지금 얻은 것"으로 잡으면 **근사 한 번**으로 센다(`stats().approx`) — 길을 다 고쳤으면 0 이다.
//     · 몸 필드 0: NPC 몸엔 `lots` 칸이 없다 — NPC 의 로트는 몸 밖 곁 장부(`WeakMap`)에 둔다(죽음 드롭이 그 레코드를 바닥에 싣는다).
const T732_MOMENT = process.env.T732_MOMENT_LOT !== '0';   // ★[T778] 켬 기본 · 되돌림 `=0`
let _mClk = null, _mDay = 0;
const _mNpc = new WeakMap();
const _mStat = { approx: 0, approxBy: {}, coalesced: 0 };
// ★★[T1036 2026-11-01 · 손잡이 `T1036_SPOIL_WARM`(★켬 기본 · 되돌림 `=0` = 종전 — 첫 정산 때 센다)] **부패 기준 온도를 시계를 꽂는 순간(부팅) 미리 센다.**
//   `spoil.refC()` 는 "연평균 노출 = 1" 이 되는 기준 온도를 이분법(60번 × 365일 × 하루 STEPS 점)으로 **처음 물을 때 한 번** 푼다(`_ref` 에 남는다).
//   그 처음이 라이브에선 **처음 순간 로트를 정산하는 몸의 결정 틱 안**이었다 — 다시 뜬 존에서 고기를 처음 낚은 어부의 `noteNow` →
//   `exposureAt` → `cumExposure` → `dayExposure` → `rateAtC` → `refC` 가 한 틱을 통째로 먹었다(T1036 실측: 결정 113.8ms · CPU 114.9 · 오프라인 113.7ms ·
//   프로파일 129ms 묶음 · 둘째부터 0.009ms). 값은 결정론(econ 기온 곡선 · 같은 상수)이라 언제 세든 같다 — 부팅(15초) 안으로 옮길 뿐이다. 새 수 0.
const T1036_SPOIL_WARM = process.env.T1036_SPOIL_WARM !== '0';
function setClock(nowMs, dayMs) {
  _mClk = (typeof nowMs === 'function') ? nowMs : null;
  _mDay = Number(dayMs) > 0 ? Number(dayMs) : 0;
  if (typeof Spoil.setMomentClock === 'function') Spoil.setMomentClock(T732_MOMENT ? _mClk : null, _mDay);
  if (T1036_SPOIL_WARM && _mClk && typeof Spoil.rateAtC === 'function') { try { Spoil.rateAtC(0); } catch (e) {} }   // ★[T1036] 기준 온도 첫 풀이를 여기서(값 같음 · 둘째부터 표에서)
}
function _mOn() { return T732_MOMENT && _mClk !== null && _mDay > 0; }
function _mNpcBox(p) { return !!(p && p.isNpc) && _mOn(); }
function _mNowMs() { return Math.floor(Number(_mClk()) || 0); }
// 부르는 쪽이 넘긴 '날' → 순간. 지금 날이면 **지금 순간** · 다른 날이면 그 날 0시(옛 꼴 `{d, n}` 의 뜻 그대로)
function _mMsOf(day) { const d = _day(day), now = _mNowMs(); return (Math.floor(now / _mDay) === d) ? now : d * _mDay; }
function _mNowFrac(day) { const d = _day(day), now = _mNowMs(); return (Math.floor(now / _mDay) === d) ? now / _mDay : d; }
function _mK(l) { return Number.isFinite(l.k) ? l.k : _day(l.d) * _mDay; }
// 순서 = 얻은 순간(오래된 것부터 — 먹기·내기·뭉개기가 다 이 순서) · 같은 순간이면 더 늙은 것 먼저
function _mSort(arr) { arr.sort((x, y) => (_mK(x) - _mK(y)) || ((+y.e || 0) - (+x.e || 0))); return arr; }
function _mSettleOne(l, nowFrac, elevKm) {
  if (!Number.isFinite(l.k)) l.k = _day(l.d) * _mDay;                  // 옛 레코드 — 그 날 0시 순간(지우지 않는다)
  if (l.e == null) {                                                    // 옛 `{d, n}` — 나이 = 그 날 0시부터(종전 뜻 · 소수 날)
    const a = nowFrac - _day(l.d);
    l.e = a > 0 ? +a.toFixed(6) : 0; l.t = nowFrac;
    if (l.m == null) l.m = 1;
    if (l.w == null) l.w = 0;
    return l;
  }
  const t0 = (l.t == null) ? l.k / _mDay : +l.t;
  if (!(t0 < nowFrac)) return l;
  l.e = +Spoil.exposureAt(l, nowFrac, elevKm).toFixed(6);
  l.t = nowFrac;
  return l;
}
function _mCap(arr, nowFrac) {
  while (arr.length > CFG.MAX_LOTS) {
    const a = _mSettleOne(arr[0], nowFrac, 0), b = _mSettleOne(arr[1], nowFrac, 0);   // 같은 순간으로 정산한 뒤 견준다
    const m = { d: Math.floor(Math.min(_mK(a), _mK(b)) / _mDay), k: Math.min(_mK(a), _mK(b)), n: +(a.n + b.n).toFixed(6),
      e: Math.max(+a.e || 0, +b.e || 0), t: Math.max(+a.t || 0, +b.t || 0), m: a.m == null ? 1 : a.m, w: a.w == null ? 0 : a.w, coalesced: true };
    arr.splice(0, 2, m);
    _mStat.coalesced++;
  }
  return arr;
}
function _mNote(p, item, n, day, place, k) {
  if (!isLot(item) || !(n > 0)) return null;
  const arr = of(p, item);
  const kk = Number.isFinite(k) ? Math.floor(k) : _mMsOf(day);
  const pf = Spoil.placeFields(place || 'carry');
  // 같은 순간 · 같은 자리 · 아직 안 늙은 로트만 같은 물건이다(평균 0)
  const hit = arr.find((l) => _mK(l) === kk && (l.m == null ? 1 : l.m) === pf.m && (l.w == null ? 0 : l.w) === pf.w
    && !((+l.e || 0) > 0) && !(+l.t > kk / _mDay));
  if (hit) hit.n = +(hit.n + (+n)).toFixed(6);
  else arr.push({ d: Math.floor(kk / _mDay), k: kk, n: +(+n).toFixed(6), e: 0, t: kk / _mDay, m: pf.m, w: pf.w });
  _mSort(arr);
  return _mCap(arr, Math.max(kk / _mDay, _mNowFrac(day)));
}
function _mSettle(p, item, today, elevKm) { const nf = _mNowFrac(today); for (const l of of(p, item)) _mSettleOne(l, nf, elevKm); return of(p, item); }
function _mSetPlace(p, item, place, today, elevKm) {
  _mSettle(p, item, today, elevKm);
  const pf = Spoil.placeFields(place || 'carry');
  for (const l of of(p, item)) { l.m = pf.m; l.w = pf.w; }
  return of(p, item);
}
function _mReconcile(p, item, inventory, day) {
  if (!isLot(item)) return null;
  const arr = of(p, item);
  if (arr.length) _mSettle(p, item, day);
  const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
  const s = sum(p, item);
  if (Math.floor(s + CFG.EPS) < have) {
    // ★근사 — 이 몫이 어디서 왔는지 아무 길도 안 적었다. 지금 얻은 것으로 잡고 **센다**(길을 다 고쳤으면 0).
    _mStat.approx++; _mStat.approxBy[item] = (_mStat.approxBy[item] || 0) + 1;
    _mNote(p, item, have - Math.floor(s + CFG.EPS), day);
  } else if (Math.floor(s + CFG.EPS) > have) {
    let over = Math.floor(s + CFG.EPS) - have;
    while (over > CFG.EPS && arr.length) {
      const take = Math.min(over, arr[0].n);
      arr[0].n = +(arr[0].n - take).toFixed(6); over -= take;
      if (arr[0].n <= CFG.EPS) arr.shift();
    }
  }
  if (!arr.length) delete all(p)[item];
  return arr;
}
function _mRec(l, n) { const r = { d: l.d, k: _mK(l), n: +(+n).toFixed(6), e: l.e, t: l.t, m: l.m, w: l.w }; if (l.coalesced) r.coalesced = true; return r; }
function _mConsume(p, item, amount, inventory, day) {
  if (!isLot(item)) return { taken: 0, ages: [] };
  _mReconcile(p, item, inventory, day);
  const arr = of(p, item);
  let left = Math.max(0, Number(amount) || 0), taken = 0;
  const ages = [];
  while (left > CFG.EPS && arr.length) {
    const take = Math.min(left, arr[0].n);
    ages.push(_mRec(arr[0], take));
    arr[0].n = +(arr[0].n - take).toFixed(6);
    left -= take; taken += take;
    if (arr[0].n <= CFG.EPS) arr.shift();
  }
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +taken.toFixed(6), ages };
}
// 지목 소비 — 펼친 로트 줄 하나(`k` 가 오면 그 순간 · 없으면 그 날의 첫 로트). ★맞춘 뒤 고른다(종전엔 안 맞추고 골라 갓 얻은 몫이 지워질 수 있었다)
function _mConsumeFrom(p, item, day, amount, inventory, k) {
  if (!isLot(item)) return { taken: 0 };
  const today = Math.floor(_mNowMs() / _mDay);
  _mReconcile(p, item, inventory, today);
  const arr = of(p, item);
  const i = Number.isFinite(k) ? arr.findIndex((l) => _mK(l) === Math.floor(k)) : arr.findIndex((l) => l.d === _day(day));
  if (i < 0) return { taken: 0 };
  const take = Math.min(Math.max(0, Number(amount) || 0), arr[i].n);
  const ages = take > 0 ? [_mRec(arr[i], take)] : [];
  arr[i].n = +(arr[i].n - take).toFixed(6);
  if (arr[i].n <= CFG.EPS) arr.splice(i, 1);
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +take.toFixed(6), ages };
}
function _mMoveOut(p, item, amount, inventory, today, elevKm) {
  if (!isLot(item)) return [];
  _mReconcile(p, item, inventory, today);
  const arr = of(p, item);
  let left = Math.max(0, Number(amount) || 0);
  const out = [];
  while (left > CFG.EPS && arr.length) {
    const take = Math.min(left, arr[0].n);
    out.push(_mRec(arr[0], take));
    arr[0].n = +(arr[0].n - take).toFixed(6); left -= take;
    if (arr[0].n <= CFG.EPS) arr.shift();
  }
  if (!arr.length) delete all(p)[item];
  return out;
}
// 안 빼고 미리 본다 — 지금 n 개를 내면 나갈 레코드(FIFO · 정산된 복사). 곳간 문이 넣기 **전에** 장부에 실을 것을 안다.
function _mPeek(p, item, amount, inventory, today) {
  if (!isLot(item)) return [];
  _mReconcile(p, item, inventory, today);
  let left = Math.max(0, Number(amount) || 0);
  const out = [];
  for (const l of of(p, item)) {
    if (left <= CFG.EPS) break;
    const take = Math.min(left, l.n);
    if (take > 0) { out.push(_mRec(l, take)); left -= take; }
  }
  return out;
}
function _mMoveIn(p, item, recs, today, elevKm, place) {
  if (!isLot(item) || !Array.isArray(recs) || !recs.length) return of(p, item);
  const arr = of(p, item), nf = _mNowFrac(today);
  const pf = Spoil.placeFields(place || 'carry');
  for (const l of arr) _mSettleOne(l, nf, elevKm);
  for (const r0 of recs) {
    if (!(r0 && r0.n > 0)) continue;
    const r = _mSettleOne(Object.assign({}, r0), nf, elevKm);           // 그릇에 있던 구간을 **먼저** 그릇 배율로 정산(체크포인트 규약)
    const kk = _mK(r);
    const hit = arr.find((l) => _mK(l) === kk && l.m === pf.m && l.w === pf.w && Math.abs((+l.e || 0) - (+r.e || 0)) < 1e-9);
    if (hit) { hit.n = +(hit.n + (+r.n)).toFixed(6); if (r.coalesced) hit.coalesced = true; }
    else { const x = { d: Math.floor(kk / _mDay), k: kk, n: +(+r.n).toFixed(6), e: +r.e || 0, t: nf, m: pf.m, w: pf.w }; if (r.coalesced) x.coalesced = true; arr.push(x); }
  }
  _mSort(arr);
  return _mCap(arr, nf);
}
function _mSettleRecs(recs, today, elevKm) { const nf = _mNowFrac(today); for (const r of (recs || [])) if (r) _mSettleOne(r, nf, elevKm); return recs; }
function _mView(p, item, inventory, day) {
  if (!isLot(item)) return null;
  _mReconcile(p, item, inventory, day);
  const arr = of(p, item);
  if (!arr.length) return null;
  return { item, total: sum(p, item),
           lots: arr.map((l) => {
             const ageDays = Math.max(0, _day(day) - l.d);
             const fresh = Spoil.freshnessOf(item, Spoil.exposureOf(l, day));
             return { day: l.d, k: _mK(l), n: l.n, ageDays, coalesced: !!l.coalesced, fresh, stage: Spoil.stageOf(fresh) };
           }) };
}

// ★상한 — **오래된 쪽 둘을 뭉치고 더 오래된 날짜를 준다.**
//   왜 이 방향인가: 반대로 하면(새것에 붙이면) 갓 얻은 식량이 **실제보다 오래돼 보인다**.
//   어느 쪽이든 근사지만, 이 방향의 오차는 "먹을 순서"를 어기지 않고
//   **음식이 실제보다 싱싱해 보이는 일이 절대 없다**. 안전한 쪽으로만 틀린다.
function _cap(arr) {
  while (arr.length > CFG.MAX_LOTS) {
    const a = arr[0], b = arr[1];
    // ★[부패 2차 2026-09-01] 노출도 **안전한 쪽**으로 뭉친다 — 큰 쪽을 취한다.
    //   기존 `min(d)`(더 오래된 날짜)와 **같은 방향**이다: 어느 쪽이든 근사지만
    //   음식이 실제보다 싱싱해 보이는 일이 절대 없다. 평균을 쓰면 그 보장이 깨진다.
    //   (자리 배율은 둘 다 같은 자리에 있던 로트라 그대로 물려받는다 — 그릇 안에서만 뭉쳐진다.)
    const m = { d: Math.min(a.d, b.d), n: +(a.n + b.n).toFixed(6), coalesced: true };
    if (a.e != null || b.e != null) {
      m.e = Math.max(a.e == null ? 0 : +a.e, b.e == null ? 0 : +b.e);
      m.t = Math.min(_day(a.t == null ? a.d : a.t), _day(b.t == null ? b.d : b.t));
      const src = (a.e != null) ? a : b;
      if (src.m != null) m.m = src.m;
      if (src.w != null) m.w = src.w;
    }
    arr.splice(0, 2, m);
  }
  return arr;
}
// 취득 — 같은 날이면 그 로트에 더하고, 다른 날이면 **새 로트**(병합 금지).
//   ★[T732] 켬이면 같은 **순간**만 합친다(`k` 를 주면 그 순간 · 안 주면 지금) — 위 순간 갈래.
function note(p, item, n, day, place, k) {
  if (_mOn()) return _mNote(p, item, n, day, place, k);
  if (!isLot(item) || !(n > 0)) return null;
  const arr = of(p, item), d = _day(day);
  // ★[부패 2차] 새 로트는 **정산된 채로** 태어난다: 노출 0 · 정산일 = 취득일 · 자리 배율.
  const pf = Spoil.placeFields(place || 'carry');
  const hit = arr.find((l) => l.d === d && (l.m == null ? 1 : l.m) === pf.m && (l.w == null ? 0 : l.w) === pf.w);
  if (hit) {
    // 같은 날·같은 자리 = 같은 물건이다. 노출은 **개수 가중 평균**(진짜 평균이 맞는 유일한 자리).
    const e0 = hit.e == null ? 0 : +hit.e;
    const tot = hit.n + n;
    hit.e = +((e0 * hit.n + 0 * n) / tot).toFixed(6);
    hit.n = +tot.toFixed(6);
    hit.t = d;
  } else arr.push({ d, n: +(+n).toFixed(6), e: 0, t: d, m: pf.m, w: pf.w });
  arr.sort((x, y) => x.d - y.d);
  return _cap(arr);
}

// ── ★★[부패 2차 2026-09-01] 정산 — "위치 이력 없이 정확하게" ─────────────────
//   자리가 안 바뀐 구간은 배율이 상수라 적분이 **곱으로** 빠진다. 그래서 이력을 저장할 필요가 없다:
//   **읽을 때와 옮길 때만** 정산하면 값이 정확하다. 틱 0 은 그대로다.
//   ★옛 로트(`e` 없음) 마이그레이션: `e = today − d`(종전 나이) · `t = today` ⇒ **그 순간 값이 연속**.
function settle(p, item, today, elevKm) {
  if (_mOn()) return _mSettle(p, item, today, elevKm);   // ★[T732] 소수 날 정산
  const arr = of(p, item), now = _day(today);
  for (const l of arr) {
    if (l.e == null) {                                   // 옛 로트 — 종전 나이를 그대로 옮겨 적는다
      const age = now - _day(l.d);
      l.e = age > 0 ? +age.toFixed(6) : 0;
      l.t = now;
      if (l.m == null) l.m = 1;
      if (l.w == null) l.w = 0;
      continue;
    }
    if (_day(l.t == null ? l.d : l.t) >= now) continue;   // 오늘 이미 정산됐다
    l.e = +Spoil.exposureOf(l, now, elevKm).toFixed(6);
    l.t = now;
  }
  return arr;
}
// 자리를 바꾼다 — **정산 먼저**(안 그러면 지난 구간에 새 배율이 소급된다).
function setPlace(p, item, place, today, elevKm) {
  if (_mOn()) return _mSetPlace(p, item, place, today, elevKm);   // ★[T732]
  settle(p, item, today, elevKm);
  const pf = Spoil.placeFields(place || 'carry');
  for (const l of of(p, item)) { l.m = pf.m; l.w = pf.w; }
  return of(p, item);
}
// ★그릇 ↔ 사람: 로트를 **레코드째** 옮긴다(FIFO — 오래된 것부터).
//   반환한 레코드는 그대로 그릇의 장부에 적히고, 돌아올 땐 그대로 다시 꽂힌다.
//   ⇒ **상자가 부패 시계를 지우지 않는다.** (§0 실측: 여태 지우고 있었다 — f 0.20 → 1.00)
function moveOut(p, item, amount, inventory, today, elevKm) {
  if (_mOn()) return _mMoveOut(p, item, amount, inventory, today, elevKm);   // ★[T732] 레코드에 순간 `k` 를 싣는다
  if (!isLot(item)) return [];
  reconcile(p, item, inventory, today);
  settle(p, item, today, elevKm);
  const arr = of(p, item);
  let left = Math.max(0, Number(amount) || 0);
  const out = [];
  while (left > CFG.EPS && arr.length) {
    const l = arr[0];
    const take = Math.min(left, l.n);
    out.push({ d: l.d, n: +take.toFixed(6), e: l.e == null ? 0 : +l.e, t: _day(l.t == null ? l.d : l.t),
               m: l.m == null ? 1 : l.m, w: l.w == null ? 0 : l.w });
    l.n = +(l.n - take).toFixed(6); left -= take;
    if (l.n <= CFG.EPS) arr.shift();
  }
  if (!arr.length) delete all(p)[item];
  return out;
}
// 그릇에서 사람에게. `place` 는 **받는 쪽**(보통 'carry').
function moveIn(p, item, recs, today, elevKm, place) {
  if (_mOn()) return _mMoveIn(p, item, recs, today, elevKm, place);   // ★[T732] 순간째 꽂는다(같은 순간·자리·노출만 합친다)
  if (!isLot(item) || !Array.isArray(recs) || !recs.length) return of(p, item);
  const arr = of(p, item), now = _day(today);
  const pf = Spoil.placeFields(place || 'carry');
  for (const r of recs) {
    if (!(r && r.n > 0)) continue;
    // 그릇에 있던 구간을 **먼저 정산**한 뒤 새 자리 배율로 바꾼다(체크포인트 규약).
    const settled = Spoil.exposureOf(r, now, elevKm);
    arr.push({ d: _day(r.d), n: +(+r.n).toFixed(6), e: +settled.toFixed(6), t: now, m: pf.m, w: pf.w });
  }
  arr.sort((x, y) => x.d - y.d);
  return _cap(arr);
}
// 그릇 안에서 시간이 흐른다 — 그릇의 장부를 **그 자리 배율로** 정산한다(꺼낼 때 부르면 충분하다).
function settleRecs(recs, today, elevKm) {
  if (_mOn()) return _mSettleRecs(recs, today, elevKm);   // ★[T732]
  const now = _day(today);
  for (const r of (recs || [])) {
    if (!r) continue;
    if (r.e == null) { const a = now - _day(r.d); r.e = a > 0 ? +a.toFixed(6) : 0; r.t = now; if (r.m == null) r.m = 1; if (r.w == null) r.w = 0; continue; }
    if (_day(r.t == null ? r.d : r.t) >= now) continue;
    r.e = +Spoil.exposureOf(r, now, elevKm).toFixed(6);
    r.t = now;
  }
  return recs;
}
// ★인벤과 장부를 맞춘다 — 로트를 안 거친 경로가 인벤을 건드려도 스스로 낫는다.
//   남으면 **오늘 얻은 것**으로 잡고(알고 하는 근사), 모자라면 **오래된 것부터** 뺀다.
function reconcile(p, item, inventory, day) {
  if (_mOn()) return _mReconcile(p, item, inventory, day);   // ★[T732] 남는 몫을 지금으로 잡으면 근사 한 번(센다)
  if (!isLot(item)) return null;
  const arr = of(p, item);
  // ★[부패 2차] **읽는 모든 경로가 여기를 지난다** — 그래서 정산을 여기 건다.
  //   옛 로트 마이그레이션도 여기서 딱 한 번 일어난다(그 순간 신선도가 연속이다).
  if (arr.length) settle(p, item, day);
  const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
  let s = sum(p, item);
  if (Math.floor(s + CFG.EPS) < have) { note(p, item, have - Math.floor(s + CFG.EPS), day); s = sum(p, item); }
  else if (Math.floor(s + CFG.EPS) > have) {
    let over = Math.floor(s + CFG.EPS) - have;
    while (over > CFG.EPS && arr.length) {
      const take = Math.min(over, arr[0].n);
      arr[0].n = +(arr[0].n - take).toFixed(6); over -= take;
      if (arr[0].n <= CFG.EPS) arr.shift();
    }
  }
  if (!arr.length) delete all(p)[item];
  return arr;
}
// 소비 — **오래된 로트부터**. 소수 소비 허용(한 입 0.25단위).
//   반환: { taken, ages:[{d,n}] } · 인벤은 `floor(Σ)` 로 맞춘다.
function consume(p, item, amount, inventory, day) {
  if (_mOn()) return _mConsume(p, item, amount, inventory, day);   // ★[T732] 레코드에 순간 `k`
  if (!isLot(item)) return { taken: 0, ages: [] };
  reconcile(p, item, inventory, day);
  const arr = of(p, item);
  let left = Math.max(0, Number(amount) || 0), taken = 0;
  const ages = [];
  while (left > CFG.EPS && arr.length) {
    const take = Math.min(left, arr[0].n);
    // ★[부패 2차] **노출 필드를 같이 싣는다** — 부르는 쪽(`Spoil.ofAges`)이 나이가 아니라 노출로 잰다.
    //   되돌리기(`doPreserve._undo`)도 이 레코드를 그대로 다시 꽂아 **나이·노출이 정확히 복원**된다.
    ages.push({ d: arr[0].d, n: +take.toFixed(6), e: arr[0].e, t: arr[0].t, m: arr[0].m, w: arr[0].w });
    arr[0].n = +(arr[0].n - take).toFixed(6);
    left -= take; taken += take;
    if (arr[0].n <= CFG.EPS) arr.shift();
  }
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +taken.toFixed(6), ages };
}
// ★★[원장 승격 2026-08-30] **지목 소비** — 펼친 로트 줄 하나를 골라 버리는 길.
//   `consume` 은 오래된 것부터(FIFO)라 "3일 전 것만 버린다"를 표현할 수 없었다.
//   FIFO 를 없애는 게 아니라 **옆에 지목 경로를 하나 더** 낸다(먹기는 그대로 FIFO 가 맞다).
function consumeFrom(p, item, day, amount, inventory, k) {
  if (_mOn()) return _mConsumeFrom(p, item, day, amount, inventory, k);   // ★[T732] 순간 `k` 로 고르고 · 맞춘 뒤 고른다
  if (!isLot(item)) return { taken: 0 };
  const arr = of(p, item);
  const i = arr.findIndex((l) => l.d === _day(day));
  if (i < 0) return { taken: 0 };
  const take = Math.min(Math.max(0, Number(amount) || 0), arr[i].n);
  const l = arr[i];
  // ★[부패 2차] 뺀 몫의 **레코드**도 돌려준다 — 버리기가 바닥템에 나이·노출을 실으려면 필요하다.
  const ages = take > 0 ? [{ d: l.d, n: +take.toFixed(6), e: l.e, t: l.t, m: l.m, w: l.w }] : [];
  arr[i].n = +(arr[i].n - take).toFixed(6);
  if (arr[i].n <= CFG.EPS) arr.splice(i, 1);
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +take.toFixed(6), ages };
}
// ★UI 가 그릴 것 — 로트가 있는 품목만. 원장과 같은 규약(클라가 표를 안 든다).
function viewAll(p, inventory, day) {
  const out = {};
  for (const item of Object.keys(all(p))) {
    const v = view(p, item, inventory, day);
    if (v && v.lots && v.lots.length) out[item] = v.lots;
  }
  return out;
}
// 표시용 — 겹쳐 보여 주되 펼치면 로트가 보인다("감자 4.2 (0.84kg)" → 로트별 나이).
function view(p, item, inventory, day) {
  if (_mOn()) return _mView(p, item, inventory, day);   // ★[T732] 줄마다 순간 `k`
  if (!isLot(item)) return null;
  reconcile(p, item, inventory, day);
  const arr = of(p, item);
  if (!arr.length) return null;
  // ★[부패 배치 2026-08-31] 펼침에 **신선도 칸을 채운다** — 새 컴포넌트를 만들지 않는다.
  //   정비 배치가 파 둔 로트 펼침이 이미 `ageDays` 를 그리고 있었다. 그 옆에 두 칸을 더 낸다.
  return { item, total: sum(p, item),
           lots: arr.map((l) => {
             // ★나이(`ageDays`)는 **진짜 경과 일수** 그대로다 — 화면의 "N일 전"은 거짓말이 아니어야 한다.
             //   달라진 건 신선도가 **노출(E)** 에서 나온다는 것: 같은 나이라도 여름 것과
             //   상자 것이 다르게 보인다. 클라는 한 줄도 안 고쳤고, 그 차이가 저절로 드러난다.
             const ageDays = Math.max(0, _day(day) - l.d);
             const exp = Spoil.exposureOf(l, day);
             const fresh = Spoil.freshnessOf(item, exp);
             return { day: l.d, n: l.n, ageDays, coalesced: !!l.coalesced,
                      fresh, stage: Spoil.stageOf(fresh) };
           }) };
}
function toSave(p) { const L = all(p); return Object.keys(L).length ? L : null; }
function fromSave(p, saved) {
  if (saved && typeof saved === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(saved)) {
      if (!Array.isArray(v)) continue;
      // ★`coalesced` 는 **참일 때만** 남긴다 — 거짓 키를 붙이면 저장 전후가 구조적으로 달라져
      //   "재접속을 넘어 그대로인가" 판정이 자기 직렬화 때문에 실패한다(1차 실행에서 실제로 그랬다).
      const arr = v.filter((l) => l && Number.isFinite(l.d) && l.n > 0)
        .map((l) => {
          const o = { d: _day(l.d), n: +l.n };
          if (l.coalesced) o.coalesced = true;
          // ★[부패 2차] 노출 넷은 **있을 때만** 싣는다 — 없는 로트는 옛 로트로 읽혀 마이그레이션된다.
          //   (거짓 키를 붙이면 저장 전후 구조가 달라져 "재접속을 넘어 그대로인가"가 자기 직렬화로 실패한다.)
          if (Number.isFinite(l.e)) { o.e = +l.e; o.t = (_mOn() && Number.isFinite(l.t)) ? +l.t : _day(l.t == null ? l.d : l.t); o.m = Number.isFinite(l.m) ? +l.m : 1; o.w = Number.isFinite(l.w) ? +l.w : 0; }
          if (_mOn() && Number.isFinite(l.k)) o.k = Math.floor(l.k);   // ★[T732] 얻은 순간(소수 날 정산 `t` 와 함께)
          return o;
        });
      if (_mOn()) { _mSort(arr); if (arr.length) out[k] = _mCap(arr, _mNowFrac(Math.floor(_mNowMs() / _mDay))); continue; }   // ★[T732]
      arr.sort((x, y) => x.d - y.d);
      if (arr.length) out[k] = _cap(arr);
    }
    p.lots = out;
  }
  return all(p);
}
// ★[T732] 하네스·보고가 읽는 자(관측 전용 — 세계를 안 바꾼다)
function stats(reset) { const o = { approx: _mStat.approx, approxBy: Object.assign({}, _mStat.approxBy), coalesced: _mStat.coalesced }; if (reset) { _mStat.approx = 0; _mStat.approxBy = {}; _mStat.coalesced = 0; } return o; }
function peek(p, item, amount, inventory, today) { return _mOn() ? _mPeek(p, item, amount, inventory, today) : []; }
function momentOn() { return _mOn(); }
// 지금 순간에 얻었다 — 날을 모르는 쪽(마을 생활층)이 부른다. 끄면(시계 없음) 아무것도 안 한다.
function noteNow(p, item, n, place) { return _mOn() ? _mNote(p, item, n, Math.floor(_mNowMs() / _mDay), place) : null; }
function nowMs() { return _mOn() ? _mNowMs() : null; }
function dayMs() { return _mOn() ? _mDay : null; }
function msOf(day) { return _mOn() ? _mMsOf(day) : null; }
module.exports = { CFG, LOT_CORE, _day, isLot, all, of, sum, note, reconcile, consume, consumeFrom, view, viewAll, toSave, fromSave,
  T732_MOMENT, setClock, momentOn, nowMs, dayMs, msOf, peek, stats, noteNow,   // ★[T732] 순간 로트(손잡이 · 시계 · 미리 보기 · 자)
  T725_KINDS, NO_ROT,   // ★[T725 ②] 안 썩는 재료 표(하네스·보고가 읽는다)
  // ★[부패 2차 2026-09-01] 정산·자리·그릇 이동
  settle, setPlace, moveOut, moveIn, settleRecs };
