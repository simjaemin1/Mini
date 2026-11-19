'use strict';
// =============================================================================
// server/xzone-beast.js — 짐승이 존을 넘는 문 (T1321 · 2026-11-14 · 세션8 · T1292 회부 3 · ★재민 11-12 "동물이 자유롭게 오가")
//
// ★무엇: 존 몹(DB 행이 있는 몸 — 야생 · 맹수 · 길든 짐승)이 땅 이웃 존 쪽 존 사각 밖으로 걸어 나가면 이웃 존에 넘긴다.
//   손잡이 `T1321_XZ_BEAST`(★T1324 켬 기본 · '0' 끔 · 팔 `T525_CROSS_ZONE` 안) — 끔이면 zone.js 가 이 모듈을 **만들지도 부르지도 않는다**(main 바이트).
// ★걸음 = 사람 넘기와 같은 겹침 띠(Phase 5-K2 · `HANDOFF_COMMIT` 256px — zone-config 정본 · 새 수 0):
//   땅 이웃 쪽 변을 넘으면 띠(변 밖 COMMIT 까지) 안에서는 이 존 몸으로 걷고, COMMIT 을 넘는 걸음에서 넘긴다.
//   받는 존은 **같은 월드 자리**(받는 존 로컬 = 월드 − 받는 존 원점)에 세운다 — 순간이동 0. 되넘김은 받는 존 띠를 다시 다 건너야 한다(핑퐁 0).
//   바다 · 월드 끝 · 이웃 아닌 존 · 비우기(`drain`) 쪽 변은 종전 그대로 존 사각에서 자른다.
//   띠는 이웃 존 땅이다 — 띠 걸음 · 넘김 자리는 **그 땅의** 바위 · 물을 본다(`peerBlocked` — 지형 정본 `terrain.js` 의 이웃 존 술어 · 칸 가운데 · 존 지형 술어는 존 밖을 "막힘 없음"으로 읽는다).
//   그래서 이음매가 능선(바위)인 자리는 짐승이 못 넘고 · 고개 · 골짜기 · 사람이 넘는 길목으로 넘는다(산은 완벽한 콜라이더 — 사람 · 캐러밴과 같은 땅).
// ★문 = zone.js `/handoff_prepare` 의 `kind: 'beast'`(캐러밴 · 스냅과 같은 문 · 새 라우트 0 · 안 문 그대로).
// ★차례(T1292 캐러밴 숨김과 같은 계약 · 캐논 "순간이동 · 사라짐 · 둘 0"):
//   ① 숨김 — 보내기 직전에 세계 표(존 `mobs` · 청크)에서 뺀다(보임 · 맞음 · AI · 저장 고리 0). DB 행은 그대로(데이터 = 정본).
//      숨김 줄(열쇠 · 받는 존 · 실을 글)을 DB 에 먼저 적는다 — 보내는 존이 다시 떠도 숨김이 이어진다(재기동 판 · 회부 5 의 짐승 몫).
//   ② 답 OK(받았다 · `dup` = 이미 받았다) → DB 행 · 숨김 줄을 한 거래로 지운다.
//   ③ 받는 존이 **답했다**(본문 "안 받는다" · 오류 코드) → 드러낸다(같은 몸 · 같은 mid · 띠 끝에 · 다시 시도 창 2초 — 사람 넘기 `fireHandoff` 의 그 창 · 새 수 0).
//      받는 존은 받기 전에 열쇠를 먼저 본다(`dup`) — 그러니 "안 받는다"는 답은 "그 짐승이 저쪽에 없다"와 같다.
//   ④ 답을 못 들었다(시한 · 끊김 — 받았는지 모른다) → 숨긴 채 2초 뒤 같은 열쇠로 다시(받는 존은 열쇠로 한 번만 센다).
//      연결이 안 선 실패(받는 존 꺼짐 · 주소 없음)는 **그 글이** 안 닿은 것이 확실하다 — 앞 글이 모른 채(`unsure`)가 아니면 드러내고,
//      모른 채면 숨긴 채 다시 민다(앞 글이 닿았을 수 있다 — 연결 실패로 드러내면 둘이 된다).
//   받는 존: 열쇠를 먼저 본다(봤으면 `dup` — 세우지 않는다) → 종 · 존 칸(T622 '없음' — 길든 짐승은 거르지 않는다 · DB 적재와 같은 규칙) ·
//     자리(존 사각 안 · 지형이 막힌 칸이 아님) → 세우기(DB 행)와 열쇠 적기를 한 거래로(둘 중 하나만 남지 않는다).
// ★실리는 것: 종 · hp · 고삐(주인 칸 둘 `tameOwner` · `tameOwnerName`) · 길들임 진척 · 걸음(vx · vy · 남은 배회 시간) · 집 자리(지금 자리에서의 차이) ·
//   무리(`packId` — 처음 넘을 때 보낸 존 이름을 한 번 붙인다 · 존마다 무리 번호가 겹치지 않게) · 층. 짐 칸은 세계에 없다(길든 짐승이 짐을 안 진다 — 실을 것 0).
// ★길든 짐승(ⓒ) = 주인을 따라 같은 띠 · 같은 문으로 넘는다: 주인이 이 존에 없고 이웃 존으로 넘어간 자리를 알면(zone.js `_t1321Gone`) 그 자리로 걷는다
//   (`followTarget` — 주인이 있으면 주인 · 넘어간 자리면 그 자리 · 그 밖은 null = 종전대로 선다). 사람 넘김 글(토큰)에는 안 싣는다 —
//   사람 글은 브라우저가 받는 존에 붙어야 몸이 서고(토큰) 못 붙으면 시한에 사라진다. 짐승은 제 다리로 띠를 건너 같은 문을 지난다(멀리 있던 짐승도 순간이동 0).
// ★열쇠 = `<존>:<부팅 표지>:<차례>` — 다시 떠도 겹치지 않는다(부팅 표지 = 기동 시각 36진 · 세계 값 0 · 열쇠 글자로만).
// ★새 수 0: 띠 = HANDOFF_COMMIT · 다시 시도 = 사람 넘기 창 2초 · 받은 열쇠 보관 5,000(캐러밴 `X.seenQ` 와 같은 상한).
// =============================================================================
const COMMIT = require('./zone-config').HANDOFF_COMMIT;
//   연결이 안 섰다 — 이 글은 받는 존에 안 닿았다(T1292 `_t1292Sure` 의 연결 몫 · 오류 코드는 아래 `status` 로 따로 본다)
const NEVER_SENT = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|no zone/;
const SEEN_MAX = 5000;

function createBeastDoor(H) {
  // H = { zone, W, Hh, offX, offY, bootId, retryMs, now(), later(fn, ms), neighbors() → [존 id], findZoneAt(ax, ay) → 존,
  //       post(zoneId, payload) → Promise, mobs: { add(m), remove(m) }, spawn(b, peer) → m, delRow(m),
  //       tx(fn), pendPut(key, rec), pendDel(key), pendAll() → [{ key, mob, to, data }], seenHas(key), seenPut(key),
  //       typeOk(type), faunaOut(type), blocked(x, y), peerBlocked(이웃 존 id, 그 존 로컬 x, y) → 그 땅 바위 · 물(띠 걸음 · 넘김 자리), drain() → bool, log(s) }
  const hidden = new Map();          // 열쇠 → { key, m, to, payload, tries, unsure, at }
  const st = { hide: 0, post: 0, out: 0, dup: 0, unhide: 0, keep: 0, keepUnsure: 0, in: 0, dupIn: 0, refuse: {}, boot: 0, bootOrphan: 0, err: 0 };
  const trace = [];
  let seq = 0;
  const tr = (k, o) => { trace.push(Object.assign({ k, at: H.now() }, o)); if (trace.length > 400) trace.splice(0, trace.length - 400); };
  const lim = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

  // ── 띠 — 이 걸음이 땅 이웃 쪽 변을 넘었나. 넘었으면 out.{x,y}(띠 안 자리) · out.go(넘길 때 — 받는 존 · 받는 존 로컬 자리)를 채우고 true.
  //    false = 종전 그대로(존 사각에서 자른다 — 부르는 쪽이 종전 글자를 돈다).
  function band(m, nx, ny, out) {
    const W = H.W, HH = H.Hh;
    const oW = -nx, oE = nx - W, oN = -ny, oS = ny - HH;
    const mo = Math.max(oW, oE, oN, oS);
    if (!(mo > 0)) return false;
    //   비우기(새 넘김 0) — 띠에 이미 선 몸만 띠 안에서 걷는다(안으로 걸어 들어오면 다시 못 나간다 · 넘기 0 · 존 변으로 끌어당기는 순간이동 0)
    const drain = H.drain(), inBand = (m.x < 0 || m.y < 0 || m.x > W || m.y > HH);
    if (drain && !inBand) return false;
    const ax = H.offX + nx, ay = H.offY + ny;
    const t = H.findZoneAt(ax, ay);
    if (!t || t.id === H.zone || t.isOcean || !H.neighbors().includes(t.id)) return false;
    const horiz = (mo === oE || mo === oW);   // 가장 크게 넘은 축 하나(모서리에서 한 존으로만 — 사람 넘기와 같은 우선)
    out.go = null;
    const toLocal = (x, y) => ({ x: H.offX + x - t.worldOffsetX, y: H.offY + y - (t.worldOffsetY || 0) });   // 같은 월드 자리(받는 존 로컬)
    if (mo > COMMIT && !drain && !(m._t1321FailAt && H.now() - m._t1321FailAt < H.retryMs)) {
      out.x = horiz ? nx : lim(nx, 0, W); out.y = horiz ? lim(ny, 0, HH) : ny;
      const g = toLocal(out.x, out.y);
      if (H.peerBlocked(t.id, g.x, g.y)) { out.x = m.x; out.y = m.y; return true; }   // 그 땅(이웃 존 지형)이 막혔다 — 이 걸음은 안 간다(지형 막힘과 같은 꼴)
      out.go = { to: t.id, x: g.x, y: g.y };
      return true;
    }
    out.x = horiz ? lim(nx, -COMMIT, W + COMMIT) : lim(nx, 0, W);
    out.y = horiz ? lim(ny, 0, HH) : lim(ny, -COMMIT, HH + COMMIT);
    //   띠 = 존 사각 밖 = 이웃 존 땅 — 걸음은 그 땅의 바위 · 물을 본다(이 존 지형 술어는 존 밖을 모른다 — 존 밖 바위 = 없음). 막혔으면 이 걸음은 안 간다.
    if ((out.x < 0 || out.x > W || out.y < 0 || out.y > HH)) { const g = toLocal(out.x, out.y); if (H.peerBlocked(t.id, g.x, g.y)) { out.x = m.x; out.y = m.y; } }
    return true;
  }
  // ── 길든 짐승이 걸어갈 자리 — 주인이 이 존에 있으면 주인 · 이웃 존으로 넘어간 자리(`gone`)를 알면 그 자리 · 그 밖은 null(종전대로 선다)
  function followTarget(ownerP, gone) {
    if (ownerP) return { x: ownerP.x, y: ownerP.y, gone: false };
    if (gone && Number.isFinite(gone.x) && Number.isFinite(gone.y)) return { x: gone.x, y: gone.y, gone: true };
    return null;
  }
  function pack(m, go) {
    const now = H.now();
    return { type: m.type, hp: m.hp, maxHp: m.maxHp, x: go.x, y: go.y, vx: m.vx || 0, vy: m.vy || 0,
      wl: Math.max(0, (m.wanderUntil || 0) - now), hx: (m.homeX != null ? m.homeX : m.x) - m.x, hy: (m.homeY != null ? m.homeY : m.y) - m.y,
      pack: m.packId ? (String(m.packId).includes('@') ? String(m.packId) : `${m.packId}@${H.zone}`) : null,
      tameOwner: m.tameOwner || null, tameOwnerName: m.tameOwnerName || null, tameProgress: m.tameProgress || 0,
      floor: m.floor || 0, src: m.dbId != null ? m.dbId : null,
      ...(m._t1331 != null && H.t1331Pack ? { t1331: H.t1331Pack(m) } : {}) };   // ★[T1331] 몸 표의 몸이면 몸 칸을 싣는다(끔 = 그런 몹이 없다 · 칸 없음)
  }
  // ── 보내기 — ① 숨김 → 숨김 줄 적기 → 글
  function send(m, go) {
    const key = `${H.zone}:${H.bootId}:${++seq}`;
    const payload = { kind: 'beast', zone: H.zone, key, b: pack(m, go) };
    H.mobs.remove(m);
    hidden.set(key, { key, m, to: go.to, payload, tries: 0, unsure: false, at: H.now() });
    H.pendPut(key, { mob: m.dbId, to: go.to, data: payload });
    st.hide++;
    tr('hide', { key, to: go.to, type: m.type, src: m.dbId, tame: !!m.tameOwner, x: Math.round(m.x), y: Math.round(m.y) });
    post(key);
    return key;
  }
  function post(key) {
    const h = hidden.get(key); if (!h) return;
    h.tries++; st.post++;
    let p; try { p = Promise.resolve(H.post(h.to, h.payload)); } catch (e) { p = Promise.reject(e); }
    p.then((res) => after(key, res, null), (e) => after(key, null, e));
  }
  function after(key, res, err) {
    const h = hidden.get(key); if (!h) return;   // 이미 끝났다(늦은 답)
    if (res && res.ok) {   // ② 받았다 · 이미 받았다 — DB 행 · 숨김 줄을 한 거래로
      try { H.tx(() => { H.delRow(h.m); H.pendDel(key); }); } catch (e) { st.err++; H.log(`넘김 끝 적기 실패 ${key}: ${e.message}`); }
      hidden.delete(key); st.out++; if (res.dup) st.dup++;
      tr('out', { key, to: h.to, type: h.m.type, src: h.m.dbId, tame: !!h.m.tameOwner, dup: !!res.dup, tries: h.tries });
      return;
    }
    const why = err ? String((err && (err.message || err.code)) || err) : String((res && res.why) || 'no');
    const answered = !!res || !!(err && err.status);          // ③ 받는 존이 답했다(본문 · 오류 코드)
    const neverSent = !answered && NEVER_SENT.test(why);      // 이 글은 안 닿았다
    if (answered || (neverSent && !h.unsure)) { unhide(key, why); return; }
    if (!neverSent) h.unsure = true;                         // ④ 받았는지 모른다
    st.keep++; if (neverSent) st.keepUnsure++;
    tr('keep', { key, to: h.to, why: why.slice(0, 40), tries: h.tries, unsure: h.unsure });
    H.later(() => post(key), H.retryMs);
  }
  function unhide(key, why) {
    const h = hidden.get(key); if (!h) return;
    hidden.delete(key);
    try { H.pendDel(key); } catch (e) { st.err++; }
    const m = h.m;
    m.x = lim(m.x, -COMMIT, H.W + COMMIT); m.y = lim(m.y, -COMMIT, H.Hh + COMMIT);
    m.vx = 0; m.vy = 0; m._t1321FailAt = H.now();
    H.mobs.add(m);
    st.unhide++; st.refuse[why.slice(0, 24)] = (st.refuse[why.slice(0, 24)] || 0) + 1;
    tr('unhide', { key, to: h.to, type: m.type, src: m.dbId, why: why.slice(0, 40), tries: h.tries });
  }
  // ── 받기 — 열쇠 먼저(dup) → 거름 → 세우기 · 열쇠 적기 한 거래
  function receive(d) {
    if (!d || typeof d.key !== 'string' || !d.b || typeof d.b !== 'object') return { ok: false, why: 'bad' };
    const peer = d.zone;
    if (!H.neighbors().includes(peer)) return { ok: false, why: 'peer' };
    if (H.seenHas(d.key)) { st.dupIn++; tr('dupIn', { key: d.key, from: peer }); return { ok: true, dup: true }; }
    const refuse = (w) => { st.refuse['in:' + w] = (st.refuse['in:' + w] || 0) + 1; return { ok: false, why: w }; };
    if (H.drain()) return refuse('drain');
    const b = d.b;
    if (!H.typeOk(b.type)) return refuse('type');
    if (!b.tameOwner && H.faunaOut(b.type)) return refuse('fauna');
    if (!(b.x >= 0 && b.x <= H.W && b.y >= 0 && b.y <= H.Hh)) return refuse('out');
    if (H.blocked(b.x, b.y)) return refuse('blocked');
    let m = null;
    H.tx(() => { m = H.spawn(b, peer); H.seenPut(d.key); });
    st.in++;
    tr('in', { key: d.key, from: peer, type: b.type, src: b.src, dst: m && m.dbId, tame: !!b.tameOwner, x: Math.round(b.x), y: Math.round(b.y) });
    return { ok: true };
  }
  // ── 다시 뜬 판 — DB 몹 행을 세계에 싣기 전에 부른다: 숨김 줄이 있는 행은 세우되 곧바로 숨기고(세계 표 0) 같은 열쇠로 다시 민다(받았는지 모른다 = unsure)
  function bootPend() {
    const rows = H.pendAll() || [], byMob = new Map();
    for (const r of rows) { if (r && r.mob != null) byMob.set(+r.mob, r); }
    return byMob;
  }
  function bootHide(m, r) {
    H.mobs.remove(m);
    let payload = null; try { payload = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; } catch (e) { payload = null; }
    if (!payload) { st.err++; H.mobs.add(m); try { H.pendDel(r.key); } catch (e) {} return; }
    hidden.set(r.key, { key: r.key, m, to: r.to, payload, tries: 0, unsure: true, at: H.now() });
    st.boot++;
    tr('bootHide', { key: r.key, to: r.to, type: m.type, src: m.dbId });
    H.later(() => post(r.key), 0);
  }
  function bootOrphans(byMob, seenMob) {   // 몸 행이 없는 숨김 줄 — 앞 판이 OK 를 받고 행을 지웠다(한 거래라 안 남지만 지킨다)
    for (const [mob, r] of byMob) if (!seenMob.has(mob)) { st.bootOrphan++; try { H.pendDel(r.key); } catch (e) {} }
  }
  function perf() {
    const hid = []; for (const h of hidden.values()) hid.push({ key: h.key, to: h.to, tries: h.tries, unsure: h.unsure, type: h.m.type, src: h.m.dbId, tame: !!h.m.tameOwner });
    return { st: JSON.parse(JSON.stringify(st)), hidden: hid, trace: trace.slice(-200) };
  }
  return { band, followTarget, send, post, receive, bootPend, bootHide, bootOrphans, perf, hidden, st, trace, COMMIT };
}
module.exports = { createBeastDoor, COMMIT, NEVER_SENT, SEEN_MAX };
