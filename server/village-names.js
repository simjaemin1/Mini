'use strict';
// === server/village-names.js — 마을 이름 짓기(T1187 · ★재민 11-05 "한반도는 정말 한국식 · 닛폰은 정말 일본식 · 근처 지형 이름 따라가도 되고") ===
//   순수 함수다(세계 · 경제 무접촉). 같은 지형 절 · 같은 후보 자리면 같은 이름 — 자리가 바뀌면(T1178 전체 재배치) 그 자리로 다시 짓는다.
//
//   ★규칙(보고 T1187 §1 · 근거 표):
//     ① 줄기 — 마을 자원권(`LAND_SCAN_R` 140칸 · villages.js 의 그 수) 안에서 **가장 가까운 이름 있는 지형**의 이름 줄기.
//        줄기 = 지형 이름에서 지형 꼬리를 뗀 것(한반도: 강 · 천 · 대간 · 산맥 · 산령 · 호 · 수해 · 숲 · 잡목림 · 계곡 · 치 /
//        닛폰: 가와 · 야마 · 노모리 · 모리 · 호 · 가와협곡N). 지형 이름이 그 나라 꼴이 아니면(닛폰 절의 한국어 이름 · 숫자 · 마을 이름을 딴 방죽) 줄기로 안 쓴다.
//        자원권 안에 없으면 가장 가까운 것(거리를 근거 칸에 적는다).
//     ② 꼬리 — 마을 갈래(지형 json `type`)마다 하나:
//        한반도 = 말(마을 · plain) · 나루(배 건너는 곳 · riverside) · 골(골짜기 마을 · mining) · 터(마을 자리 · forest)
//          출처: 국토지리정보원 2020-10-06 순우리말 땅이름 분석(새터 273 · 절골 142 · 새말 110 · 안골 96 · 큰골 68 · 뒷골 66 · 말 = 마을) ·
//                나루 = 배 건너는 곳(곰나루 → 고마나루 · 나룻배 = 나루 + ㅅ + 배).
//        닛폰 = 다(田 · plain) · 츠(津 · riverside) · 사와(沢 · mining) · 오카(岡 · forest)
//          출처: 『和名類聚抄』(931~938) 향 이름의 형태소 — 新田 · 海田 · 塩田(田) · 石津 · 田津(津) · 片岡 · 岡本(岡) · 沢(산골 물길 · 동쪽에 많다는 통설) — 설계/고증_동쪽지명.md(T628) 표.
//     ③ 겹침 0 — 같은 이름이 이미 섰으면 다음으로 가까운 지형의 줄기 · 그래도 겹치면 앞붙이
//        (한반도 큰 · 안 · 뒷 · 새 — 위 국토지리정보원 표의 큰골 · 안골 · 뒷골 · 새말 / 닛폰 오오 · 코 · 나카 — 와묘쇼 大島 · 小野 · 中島).
//        지형 이름 · 다른 마을 이름과 같은 글자도 겹침으로 센다. 차례 = 지형 json 후보 차례(결정론).
//   ⚠청동기 당시의 실제 땅이름은 남아 있지 않다 — 이 이름들은 "그럴듯한 고유어 꼴"이다(보고에 적는다).
const SZ = 32;   // 칸 크기(px) — villages.js `SZ` 와 같은 칸(자원권 반경은 부르는 쪽이 villages 의 `LAND_SCAN_R` 를 넘긴다 · 사본 0)
const KO = {
  tail: { plain: '말', riverside: '나루', mining: '골', forest: '터' },
  tailMean: { 말: '마을', 나루: '배 건너는 곳', 골: '골짜기 마을', 터: '마을 자리' },
  pre: ['큰', '안', '뒷', '새'],
  // 지형 꼬리(긴 것 먼저) — 줄기에서 뗀다
  strip: { rivers: ['강', '천'], ridges: ['대간', '산맥', '산령'], lakes: ['호'], forests: ['수해', '잡목림', '숲'], valleys: ['계곡', '치'], passes: [] },
  villageTail: /(말|골|터|나루|실|들)$/,
};
const JA = {
  tail: { plain: '다', riverside: '츠', mining: '사와', forest: '오카' },
  tailMean: { 다: '田(밭 · 논)', 츠: '津(나루 · 배 대는 곳)', 사와: '沢(산골 물길)', 오카: '岡(언덕)' },
  pre: ['오오', '코', '나카'],
  preMean: { 오오: '大', 코: '小', 나카: '中' },
  strip: { rivers: ['가와'], ridges: ['야마'], lakes: ['호'], forests: ['노모리', '모리'], valleys: [], passes: [] },
  // 줄기 뜻(지형 이름이 이미 쓰는 어근만 · 모르면 비운다)
  gloss: { 시로: '白', 하야: '早', 후카: '深', 아카: '赤', 나가: '長', 오오: '大', 히로: '広', 츠키: '月', 모리: '森', 카제: '風', 소라: '空', 유키: '雪',
    후유: '冬', 아키: '秋', 하루: '春', 쿠로: '黒', 아오: '青', 미도리: '緑', 토오: '遠', 키요: '清', 호시: '星', 우미: '海', 아라: '荒', 마츠: '松' },
};
const KIND_KO = { rivers: '강', ridges: '산줄기', lakes: '호수', forests: '숲', valleys: '골짜기', passes: '고개' };
const _hasDigit = (s) => /[0-9]/.test(s);
function _segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function _distTo(kind, f, x, y) {
  if (f.path && f.path.length) {
    let best = Infinity;
    for (let i = 0; i < f.path.length; i++) {
      const a = f.path[i].pos, b = (f.path[i + 1] || f.path[i]).pos;
      const d = _segDist(x, y, a[0], a[1], b[0], b[1]); if (d < best) best = d;
    }
    return best;
  }
  if (f.center) {
    const r = kind === 'forests' ? Math.min(f.rx || 0, f.ry || 0) : (f.radius || 0);
    return Math.max(0, Math.hypot(x - f.center[0], y - f.center[1]) - r);
  }
  if (f.pos) return Math.max(0, Math.hypot(x - f.pos[0], y - f.pos[1]) - (f.radius || 0));
  return Infinity;
}
// 지형 이름 → 줄기(그 나라 꼴이 아니면 null)
function stemOf(lang, kind, name, jaStems) {   // ★닛폰 협곡 줄기도 아래 `_jaCompound` 를 탄다
  let s = String(name || '').replace(/_\d+$/, '');
  if (!s || _hasDigit(s) || /\s/.test(s)) return null;   // 숫자 · 띄어쓴 이름(마을을 딴 방죽 · 협곡N)은 줄기 아님
  const L = lang === 'ja' ? JA : KO;
  if (lang === 'ja' && kind === 'valleys') { const m = /^(.+)가와협곡\d*$/.exec(String(name)); s = m ? m[1] : null; if (!s) return null; return (jaStems.has(s) && !_jaCompound(s, jaStems)) ? s : null; }
  let cut = false;
  for (const t of (L.strip[kind] || [])) { if (s.endsWith(t) && s.length > t.length) { s = s.slice(0, -t.length); cut = true; break; } }
  if (lang === 'ko') {
    if (kind === 'valleys' && !cut && !/재$/.test(s)) return null;   // 골짜기 = 〜계곡 · 〜치 · 〜재(고개 이름은 통째로 줄기)
    if (!cut && kind !== 'valleys') return null;
    if (/닛폰|한반도/.test(s)) return null;                          // 나라 이름을 딴 줄기(닛폰대천)는 안 쓴다
    return s.length >= 2 ? s : null;                               // 한 글자 한자 줄기(옥 · 화 · 벽 · 청 …)는 안 쓴다
  }
  if (!cut) return null;
  if (!jaStems.has(s)) return null;                                 // 닛폰 = 가와 · 야마 · 모리 꼴이 쓰는 어근만(달재 · 닭밭 같은 한국어 줄기는 빠진다)
  return _jaCompound(s, jaStems) ? null : s;                        // 어근 둘을 이어 붙인 줄기(아카 + 키요 …)는 안 쓴다 — 지형 이름을 겹치지 않게 지은 꼴이다
}
function _jaCompound(s, jaStems) {
  for (let i = 2; i <= s.length - 2; i++) if (jaStems.has(s.slice(0, i)) && jaStems.has(s.slice(i))) return true;
  return false;
}
// 한 존의 후보 전부에 이름을 짓는다. zt = 지형 json 의 그 존 절. 돌려줌: [{ old, name, type, stem, tail, pre, feature, kind, distCells, inRange, mean }]
function nameZone(zoneId, zt, scanR) {
  if (!(scanR > 0)) throw new Error('village-names: scanR(villages LAND_SCAN_R) 를 넘겨야 한다');
  const lang = zoneId === 'nippon' ? 'ja' : 'ko';
  const L = lang === 'ja' ? JA : KO;
  const KINDS = ['rivers', 'ridges', 'lakes', 'forests', 'valleys', 'passes'];
  const jaStems = new Set();
  if (lang === 'ja') for (const k of ['rivers', 'ridges', 'forests']) for (const f of (zt[k] || [])) {
    const n = String(f.name || '').replace(/_\d+$/, '');
    for (const t of JA.strip[k]) if (n.endsWith(t) && n.length > t.length && !/[천산숲령림]/.test(n)) { jaStems.add(n.slice(0, -t.length)); break; }
  }
  const feats = [];
  for (const k of KINDS) for (const f of (zt[k] || [])) { const st = stemOf(lang, k, f.name, jaStems); if (st) feats.push({ kind: k, f, stem: st }); }
  const taken = new Set();
  for (const k of KINDS) for (const f of (zt[k] || [])) taken.add(String(f.name || ''));
  const out = [];
  for (const v of (zt.villages || [])) {
    const tail = L.tail[v.type] || L.tail.plain;
    const near = feats.map((F) => ({ F, d: _distTo(F.kind, F.f, v.x, v.y) })).sort((a, b) => (a.d - b.d) || (a.F.stem < b.F.stem ? -1 : a.F.stem > b.F.stem ? 1 : 0));
    const mk = (st) => (lang === 'ko' && KO.villageTail.test(st)) ? st : st + tail;   // 줄기가 이미 마을 꼬리로 끝나면(벌말) 그대로
    let pick = null, name = null, pre = '';
    for (const c of near) { const n = mk(c.F.stem); if (!taken.has(n)) { pick = c; name = n; break; } }
    if (!name && near.length) {
      pick = near[0];
      for (const p of L.pre) { const n = p + mk(pick.F.stem); if (!taken.has(n)) { name = n; pre = p; break; } }
    }
    if (!name) { name = v.name; pick = null; }   // 다 막히면 옛 이름(실제로는 안 온다 — 하네스가 0 을 잰다)
    taken.add(name);
    const dCells = pick ? Math.round(pick.d / SZ) : null, usedTail = pick && !(lang === 'ko' && KO.villageTail.test(pick.F.stem)) ? tail : '';
    const gl = lang === 'ja' && pick ? (JA.gloss[pick.F.stem] || '') : '';
    const mean = pick ? `${pre ? (lang === 'ja' ? JA.preMean[pre] + '(' + pre + ') + ' : pre + ' + ') : ''}${pick.F.stem}${gl ? '(' + gl + ')' : ''}${usedTail ? ' + ' + usedTail + '(' + L.tailMean[usedTail] + ')' : ''}` : '';
    out.push({ old: v.name, name, type: v.type, stem: pick ? pick.F.stem : null, tail: usedTail, pre, feature: pick ? pick.F.f.name : null, kind: pick ? KIND_KO[pick.F.kind] : null,
      distCells: dCells, inRange: dCells != null && dCells <= scanR, mean, x: v.x, y: v.y });
  }
  return out;
}
// 시딩이 부르는 문 — 옛 후보 이름 → 새 이름(그 존 후보 전부를 한 번에 지어 겹침 0 을 지킨다)
function nameMap(zoneId, zt, scanR) { const m = new Map(); for (const r of nameZone(zoneId, zt, scanR)) m.set(r.old, r.name); return m; }
module.exports = { nameZone, nameMap, stemOf, KO, JA };
