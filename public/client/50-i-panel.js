// ★★[T38 2026-09-01] 아이콘이 없을 때 **키를 그대로 찍지 않는다.**
//   `itemIconHtml(k, 18, k)` 의 셋째 인자는 "아이콘이 없으면 대신 이걸 찍어라"인데
//   거기에 키를 넣어 둔 자리가 이 파일에 12곳, `51-s-side.js` 에 2곳 있었다.
//   ⇒ 자염처럼 아이콘이 아직 없는 새 품목이 들어온 날 화면에 `brine` 이 떴다(실측: e2e-salt).
//   이름표 정본은 서버다(`ITEM_LABEL_SERVER` + `itemlabel.js`). 클라에는 표가 없다(T61).
// ★★[T55 2026-09-02 · T61 2026-09-03] **정본 하나 → 키.** 사본은 없다(T61 이 지웠다).
//   `ITEM_LABEL_SRV` 는 `welcome.itemLabels` 다. 화면에 이름을 찍는 자리는 전부 이 함수를 통과한다
//   (자리마다 `|| k` 를 쓰면 새 품목이 올 때마다 자리 수만큼 빠뜨린다 — T38·자염·갯벌이 그 셋이다).
function itemKo(k) {
  return (typeof ITEM_LABEL_SRV !== 'undefined' && ITEM_LABEL_SRV && ITEM_LABEL_SRV[k]) || k;
}
// @@split:50-i-panel — I 인벤 — 주조·요리·패널
  // ══ 주조(鑄造): 금속 여러 개를 배합해 녹인다 [재민 확정] ══════════════════
  // "금속 3개까지 합금을 자유롭게. 그거에 따른 성질을 화학적으로 잘 반영. 값에 따라 연속적으로."
  // 여기(클라)는 **슬라이더와 그림만** 담당한다. 경도·인성·융점·주조성은 서버가 낸다.
  const CAST_KO = { copper: '구리', tin: '주석', lead: '납', silver: '은', gold: '금', zinc: '아연', iron: '철', nickel: '니켈' };
  function castKindsList() { return (equipmentMeta && equipmentMeta.castKinds) || []; }
  function castMaxKinds() { return (equipmentMeta && equipmentMeta.castMaxKinds) || 3; }
  function ensureCastMix(type) {
    if (!castMix[type]) castMix[type] = {};
    const m = castMix[type];
    for (const k in m) if (!(m[k] > 0)) delete m[k];
    if (!Object.keys(m).length) {   // 기본값 = 표준 청동. 구리가 없으면 가진 금속 아무거나.
      const kinds = castKindsList();
      if (kinds.includes('copper') && (inventory.copper || 0) > 0) {
        m.copper = 88; if (kinds.includes('tin') && (inventory.tin || 0) > 0) m.tin = 12;
      } else { const f = kinds.find(k => (inventory[k] || 0) > 0); if (f) m[f] = 100; }
    }
    return m;
  }
  function castPct(type) {
    const m = castMix[type] || {}; let tot = 0;
    for (const k in m) tot += m[k];
    const out = {}; for (const k in m) out[k] = tot > 0 ? m[k] / tot : 0;
    return out;
  }
  let _castTimer = {};
  function requestCastPreview(type) {
    clearTimeout(_castTimer[type]);
    _castTimer[type] = setTimeout(() => {
      const m = castMix[type]; if (!m || !Object.keys(m).length) return;
      sendPrimary({ type: 'cast_preview', itemType: type, mix: m });
    }, 90);   // 슬라이더 드래그 중 폭주 방지
  }
  // 서버 응답을 읽어 **그 줄만** 다시 그린다(패널 전체를 다시 그리면 드래그 중인 슬라이더가 튄다).
  function paintCastReadout(type) {
    const pv = castPv[type];
    const pct = castPct(type);
    for (const k in pct) {
      const el = document.getElementById('castPct-' + type + '-' + k);
      if (el) el.textContent = Math.round(pct[k] * 100) + '%';
    }
    const box = document.getElementById('castRead-' + type);
    if (!box) return;
    if (!pv) { box.innerHTML = '<span style="color:var(--dim-2)">계산 중…</span>'; return; }
    if (pv.err) { box.innerHTML = '<span style="color:var(--hp)">' + pv.err + '</span>'; return; }
    const p = pv.props || {};
    const gCol = pv.grade >= 1 ? 'var(--stam)' : (pv.grade >= 0.7 ? 'var(--accent)' : 'var(--hp)');
    const warn = [];
    if (p.brittle > 0.02) warn.push('취성 — 잘 부러진다');
    if (p.split > 0.02) warn.push('층이 갈린다');
    if (p.mp > 1150) warn.push('노가 못 녹인다');
    const useTxt = Object.entries(pv.use || {}).map(([k, v]) => (CAST_KO[k] || k) + ' ' + v).join(' · ');
    box.innerHTML =
      '<b style="color:' + gCol + '">등급 ' + (pv.grade == null ? '?' : pv.grade.toFixed(2)) + '</b>'
      + ' · <b style="color:var(--thirst)">' + (pv.attr != null ? pv.attr : '?') + '</b>'
      + (pv.dura != null ? ' · 내구 ' + pv.dura : '')
      + '<div style="color:var(--dim);font-size:10px;margin-top:2px">경도 ' + (p.hardness != null ? p.hardness : '?')
      + ' · 인성 ' + (p.tough != null ? p.tough.toFixed(2) : '?')
      + ' · 융점 ' + (p.mp != null ? p.mp + '℃' : '?')
      + ' · 주조성 ' + (p.cast != null ? p.cast.toFixed(2) : '?') + '</div>'
      + '<div style="color:var(--stam);font-size:10px">소모 ' + useTxt + '</div>'
      + (warn.length ? '<div style="color:var(--hp);font-size:10px">' + warn.join(' · ') + '</div>' : '')
      + (pv.lack ? '<div style="color:var(--hp);font-size:10px">재료 부족: ' + (CAST_KO[pv.lack] || pv.lack) + '</div>' : '');
  }
  function castBlockHtml(type, rc) {
    if (!rc.cast || !castKindsList().length) return '';
    const on = !!castOn[type];
    const btn = '<button data-castoggle="' + type + '" style="margin-top:4px;padding:1px 6px;font-size:11px;border-radius: 0;cursor:pointer;border:1px solid '
      + (on ? 'var(--accent)' : 'var(--line)') + ';background:' + (on ? 'var(--inset)' : 'var(--head)') + ';color:var(--fg-strong)">주조 배합' + (on ? ' ' : ' ') + '</button>';
    if (!on) return btn;
    const m = ensureCastMix(type), pct = castPct(type);
    const nSel = Object.keys(m).length;
    const chips = castKindsList().map(k => {
      const have = inventory[k] || 0, sel = m[k] > 0;
      const dis = (!sel && (have <= 0 || nSel >= castMaxKinds()));
      const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius: 0;font-size:11px;cursor:pointer;border:1px solid '
        + (sel ? 'var(--accent)' : 'var(--line)') + ';background:' + (sel ? 'var(--inset)' : 'var(--head)') + ';color:' + (have > 0 ? 'var(--fg-strong)' : 'var(--line-2)');
      return '<button data-castmetal="' + k + '" data-casttype="' + type + '" ' + (dis ? 'disabled' : '')
        + ' style="' + st + '" title="' + (CAST_KO[k] || k) + ' 보유 ' + (+have).toFixed(2) + '">'
        + (CAST_KO[k] || k) + (have > 0 ? ' ' + (+have).toFixed(1) : '') + '</button>';
    }).join('');
    const sliders = Object.keys(m).map(k =>
      '<div style="display:flex;align-items:center;gap:5px;margin-top:3px">'
      + '<span style="width:28px;font-size:11px;color:var(--dim)">' + (CAST_KO[k] || k) + '</span>'
      + '<input type="range" min="0" max="100" value="' + m[k] + '" data-castslider="' + k + '" data-casttype="' + type + '" style="flex:1;height:14px">'
      + '<span id="castPct-' + type + '-' + k + '" style="width:34px;text-align:right;font-size:11px;color:var(--thirst)">' + Math.round(pct[k] * 100) + '%</span>'
      + '</div>').join('');
    return btn
      + '<div style="margin-top:4px;padding:5px 6px;border:1px solid var(--line);border-radius: 0;background:var(--pane-solid)">'
      + '<div style="font-size:10px;color:var(--dim-2);margin-bottom:2px">도가니 — 최대 ' + castMaxKinds() + '종. 이 시대의 노가 녹일 수 있는 금속만.</div>'
      + chips + sliders
      + '<div id="castRead-' + type + '" style="margin-top:5px;font-size:11px">계산 중…</div>'
      + '<button data-castcraft="' + type + '" style="margin-top:5px;width:100%">주조</button>'
      + '</div>';
  }
  // 장비 제작+보유목록 HTML(양쪽 크래프트 패널 공유). 미리보기 = 서버 공식과 동일.
  function equipmentSectionHtml() {
    if (!equipmentRecipes || !Object.keys(equipmentRecipes).length || !equipmentMeta) return '<div class="hint">장비 데이터 로딩 중…</div>';
    let html = '';
    for (const [type, rc] of Object.entries(equipmentRecipes)) {
      const lvl = equipSkillLevel(rc.skill);
      const owned = rc.accepts.filter(m => (inventory[m] || 0) > 0);
      let sel = craftEquipSel[type];
      if (!owned.includes(sel)) sel = owned[0] || rc.accepts[0];
      craftEquipSel[type] = sel;
      const pv = equipPreview(type, sel, lvl);
      // ★★[T12 지게 2026-09-01] **곁재료(`extra`)** — 늘 같이 드는 재료(지게의 밀삐).
      //   종전엔 주재료만 셌다 ⇒ 지게처럼 재료가 둘인 장비는 **버튼이 켜져 있는데 서버가 거절**한다.
      //   표는 서버가 보낸 그대로 읽는다(클라가 "무엇이 곁재료인가"를 적으면 그게 사본이다).
      const _extra = rc.extra || {};
      const canCraft = (inventory[sel] || 0) >= rc.qty + (_extra[sel] || 0)
        && Object.entries(_extra).every(([k, n]) => (inventory[k] || 0) >= n + (k === sel ? rc.qty : 0));
      const extraStr = Object.entries(_extra).map(([k, n]) => ` · ${itemIconHtml(k, 18, itemKo(k))} ${n}<span style="color:${(inventory[k] || 0) >= n ? 'var(--dim-2)' : 'var(--hp)'}"> (${Math.floor(inventory[k] || 0)})</span>`).join('');
      const matBtns = rc.accepts.map(m => {
        const has = (inventory[m] || 0), on = (m === sel);
        const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius: 0;font-size:11px;cursor:pointer;border:1px solid ' + (on ? 'var(--thirst)' : 'var(--line)') + ';background:' + (on ? 'var(--thirst)' : 'var(--head)') + ';color:' + (has > 0 ? 'var(--fg-strong)' : 'var(--line-2)');
        return `<button data-eqtype="${type}" data-eqmat="${m}" ${has > 0 ? '' : 'disabled'} style="${st}" title="${m} 보유 ${has}">${itemIconHtml(m, 18, itemKo(m))}${has ? ` ${has}` : ''}</button>`;
      }).join('');
      const pvStr = pv ? `<b style="color:var(--thirst)">${pv.attrLabel} ${pv.attr} · 내구 ${pv.dura}</b>` : '';
      html += `<div class="craft-recipe ${canCraft ? 'can-make' : 'cant-make'}">
        <div class="cr-icon">${itemPic(EQUIP_ICONS[type] || type, 22)}</div>
        <div class="cr-info">
          <div class="cr-name">${rc.label} <span style="color:var(--stam);font-weight:normal">${rc.skill} Lv${lvl}</span></div>
          <div class="cr-cost">${sel ? itemIconHtml(sel, 18, itemKo(sel)) : '?'} ×${rc.qty}${extraStr} ${pvStr}</div>
          <div style="margin-top:3px">${matBtns}</div>
          ${castBlockHtml(type, rc)}
        </div>
        <button data-eqcraft="${type}" ${canCraft ? '' : 'disabled'}>제작</button>
      </div>`;
    }
    if (equipment && equipment.length) {
      html += '<div class="hint" style="margin-top:10px;font-weight:bold">— 내 장비 —</div>';
      for (const inst of equipment) {
        const rc = equipmentRecipes[inst.type] || {};
        const slot = rc.slot || inst.type;
        const isEq = equipSlots[slot] === inst.id;
        const broken = inst.broken || inst.dura === 0;
        const durPct = (inst.durMax ? Math.round(100 * inst.dura / inst.durMax) : 100);
        const durCol = durPct > 50 ? 'var(--stam)' : (durPct > 20 ? 'var(--accent)' : 'var(--hp)');
        const attrParts = [];
        for (const a in (inst.attrs || {})) attrParts.push(`${(equipmentMeta.types[inst.type] && equipmentMeta.types[inst.type].attr) || a} ${inst.attrs[a]}`);
        const durBar = inst.durMax ? `<div style="height:4px;background:var(--inset);border-radius: 0;margin-top:3px;overflow:hidden"><div style="height:100%;width:${durPct}%;background:${durCol}"></div></div>` : '';
        const repairBtn = (inst.durMax && inst.dura < inst.durMax) ? `<button data-eqrepair="${inst.id}" style="margin-left:4px">수선</button>` : '';
        html += `<div class="craft-recipe ${isEq ? 'can-make' : ''}">
          <div class="cr-icon">${itemPic(EQUIP_ICONS[inst.type] || inst.type, 22)}</div>
          <div class="cr-info">
            <div class="cr-name">${rc.label || inst.type} ${broken ? '<span style="color:var(--hp)">파손</span>' : ''}<span style="color:var(--dim-2);font-weight:normal"> · Lv${inst.craftedSkill || 0} 제작</span></div>
            <div class="cr-cost">${attrParts.join(' · ')}${inst.dura != null ? ` · 내구 ${inst.dura}/${inst.durMax}` : ''}</div>
            ${durBar}
          </div>
          <button data-eqtoggle="${inst.id}" data-slot="${slot}" ${broken ? 'disabled' : ''}>${isEq ? '해제' : '장착'}</button>${repairBtn}
        </div>`;
      }
    }
    return html;
  }
  // 장비 섹션 버튼 핸들러(root 안에서). rerender = 재료 선택 후 다시 그릴 함수.
  function wireEquipmentHandlers(root, rerender) {
    root.querySelectorAll('[data-eqmat]').forEach(b => b.onclick = () => { craftEquipSel[b.dataset.eqtype] = b.dataset.eqmat; if (rerender) rerender(); });
    root.querySelectorAll('[data-eqcraft]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_equipment', itemType: b.dataset.eqcraft, material: craftEquipSel[b.dataset.eqcraft] }));
    // ── 주조 배합 ──
    root.querySelectorAll('[data-castoggle]').forEach(b => b.onclick = () => {
      const t = b.dataset.castoggle; castOn[t] = !castOn[t];
      if (castOn[t]) { ensureCastMix(t); requestCastPreview(t); }
      if (rerender) rerender();
    });
    root.querySelectorAll('[data-castmetal]').forEach(b => b.onclick = () => {
      const t = b.dataset.casttype, k = b.dataset.castmetal, m = ensureCastMix(t);
      if (m[k] > 0) { if (Object.keys(m).length > 1) delete m[k]; }
      else if (Object.keys(m).length < castMaxKinds()) m[k] = 10;
      requestCastPreview(t); if (rerender) rerender();
    });
    root.querySelectorAll('[data-castslider]').forEach(s => {
      s.oninput = () => {   // 패널을 다시 그리지 않는다 — 드래그 중이라 DOM 을 갈면 손이 놓친다
        const t = s.dataset.casttype, k = s.dataset.castslider, m = ensureCastMix(t);
        m[k] = Number(s.value);
        let tot = 0; for (const kk in m) tot += m[kk];
        if (!(tot > 0)) { m[k] = 1; }                      // 전부 0 은 금지(배합이 사라진다)
        const pct = castPct(t);
        for (const kk in pct) { const el = document.getElementById('castPct-' + t + '-' + kk); if (el) el.textContent = Math.round(pct[kk] * 100) + '%'; }
        requestCastPreview(t);
      };
    });
    root.querySelectorAll('[data-castcraft]').forEach(b => b.onclick = () => {
      const t = b.dataset.castcraft, m = castMix[t];
      if (m && Object.keys(m).length) sendPrimary({ type: 'craft_equipment', itemType: t, mix: m });
    });
    for (const t in castOn) if (castOn[t]) { paintCastReadout(t); requestCastPreview(t); }
    root.querySelectorAll('[data-eqtoggle]').forEach(b => b.onclick = () => {
      const id = b.dataset.eqtoggle, slot = b.dataset.slot;
      if (equipSlots[slot] === id) sendPrimary({ type: 'unequip_item', slot });
      else sendPrimary({ type: 'equip_item', id });
    });
    root.querySelectorAll('[data-eqrepair]').forEach(b => b.onclick = () => sendPrimary({ type: 'repair_equipment', id: b.dataset.eqrepair }));
  }
  // 요리 인스턴스 목록(신선도·버프). 갓 지은 것 우선 — 식으면 신선도·효과↓.
  function dishesListHtml() {
    if (!dishes || !dishes.length) return '';
    let h = '<div class="hint" style="margin-top:10px;font-weight:bold">— 내 요리 (신선할 때 먹자) —</div>';
    for (const d of dishes) {
      const fresh = d.freshness;
      const fcol = fresh > 60 ? 'var(--stam)' : (fresh > 30 ? 'var(--accent)' : 'var(--hp)');
      h += `<div class="craft-recipe can-make">
        <div class="cr-icon"></div>
        <div class="cr-info">
          <div class="cr-name">${d.label} <span style="color:var(--dim-2);font-weight:normal">품질 ${Math.round((d.q || 0) * 100)}%</span></div>
          <div class="cr-cost">영양 ${d.nutrition} · 버프 ${Math.round((d.buff || 0) * 100)}% · <span style="color:${fcol}">신선도 ${fresh}</span></div>
        </div>
        <button data-eatdish="${d.id}">먹기</button>
      </div>`;
    }
    return h;
  }
  function wireDishHandlers(root) {
    root.querySelectorAll('[data-eatdish]').forEach(b => b.onclick = () => sendPrimary({ type: 'eat_dish', id: b.dataset.eatdish }));
  }
  // 마을 거래(구매=마을 품질 실체화·판매=용해). shopVillage = shop_info 응답.
  const TRADE_QKEY = { clothes: 'clothQ', weapon: 'weapQ', armor: 'weapQ', tool: 'toolQ' };
  function tradeSectionHtml() {
    const v = shopVillage;
    if (!v) return '<div class="hint" style="padding:12px">마을광장 근처에서 열면 마을 장인의 품질이 표시됩니다.<br>(거래 반경 밖이면 비어 있음 — 마을로 가까이)</div>';
    let h = `<div class="hint" style="margin:6px 0;font-weight:bold">${v.name} <span style="color:var(--dim-2);font-weight:normal">· ${v.dist}px${v.pop != null ? ` · 인구 ${v.pop}` : ''}</span></div>`;
    if (equipmentRecipes && equipmentMeta) {
      for (const [type, rc] of Object.entries(equipmentRecipes)) {
        const vq = v[TRADE_QKEY[type]];
        const owned = rc.accepts.filter(m => (inventory[m] || 0) > 0);
        let sel = craftEquipSel[type];
        if (!owned.includes(sel)) sel = owned[0] || rc.accepts[0];
        craftEquipSel[type] = sel;
        const canBuy = (inventory[sel] || 0) >= rc.qty;
        const qStr = (vq != null) ? `마을품질 ${Math.round(vq * 100)}%` : '이 마을은 아직 안 만듦';
        const matBtns = rc.accepts.map(m => {
          const has = (inventory[m] || 0), on = (m === sel);
          const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius: 0;font-size:11px;cursor:pointer;border:1px solid ' + (on ? 'var(--thirst)' : 'var(--line)') + ';background:' + (on ? 'var(--thirst)' : 'var(--head)') + ';color:' + (has > 0 ? 'var(--fg-strong)' : 'var(--line-2)');
          return `<button data-eqtype="${type}" data-eqmat="${m}" ${has > 0 ? '' : 'disabled'} style="${st}">${itemIconHtml(m, 18, itemKo(m))}${has ? ` ${has}` : ''}</button>`;
        }).join('');
        h += `<div class="craft-recipe ${canBuy ? 'can-make' : 'cant-make'}">
          <div class="cr-icon">${itemPic(EQUIP_ICONS[type] || type, 22)}</div>
          <div class="cr-info">
            <div class="cr-name">${rc.label} <span style="color:var(--thirst);font-weight:normal">${qStr}</span></div>
            <div class="cr-cost">재료 ${sel ? itemIconHtml(sel, 18, itemKo(sel)) : '?'} ×${rc.qty} 지불</div>
            <div style="margin-top:3px">${matBtns}</div>
          </div>
          <button data-buy="${type}" ${canBuy && vq != null ? '' : 'disabled'}>구매</button>
        </div>`;
      }
    }
    if (equipment && equipment.length) {
      h += '<div class="hint" style="margin-top:10px;font-weight:bold">— 판매 —</div>';
      for (const inst of equipment) {
        const rc = equipmentRecipes[inst.type] || {};
        const refund = rc.qty ? Math.max(1, Math.floor(rc.qty / 2)) : 1;
        // ★철기는 **위세품**으로 넘길 수 있다(재민 확정 2026-08-02b) — 성능이 아니라 처음 보는
        //   물건이라 값이 선다. 청동기 마을엔 철기가 없다. 주괴·정광은 해당 없음(완성품만).
        const _fe = (() => {
          if (inst.mat === 'iron' || inst.mat === 'meteoric_iron') return true;
          if (inst.mix) { let t = 0, f = 0; for (const k in inst.mix) { t += inst.mix[k]; if (k === 'iron' || k === 'meteoric_iron') f += inst.mix[k]; } return t > 0 && f / t > 0.5; }
          return false;
        })();
        h += `<div class="craft-recipe">
          <div class="cr-icon">${itemPic(EQUIP_ICONS[inst.type] || inst.type, 22)}</div>
          <div class="cr-info"><div class="cr-name">${rc.label || inst.type} <span style="color:var(--dim-2);font-weight:normal">Lv${inst.craftedSkill || 0}</span>${_fe ? ' <span style="color:var(--accent-hi)">철기</span>' : ''}</div>
          <div class="cr-cost">용해 ${inst.mat ? itemIconHtml(inst.mat, 18, itemKo(inst.mat)) : '재료'} ×${refund} 회수${_fe ? ' &nbsp;/&nbsp; <span style="color:var(--accent-hi)">위세품으로 넘기면 마을이 값을 친다</span>' : ''}</div></div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <button data-sell="${inst.id}">용해</button>
            ${_fe ? `<button data-relic="${inst.id}" style="background:var(--accent);border-color:var(--accent)">위세품 판매</button>` : ''}
          </div>
        </div>`;
      }
    }
    return h;
  }
  function wireTradeHandlers(root, rerender) {
    root.querySelectorAll('[data-eqmat]').forEach(b => b.onclick = () => { craftEquipSel[b.dataset.eqtype] = b.dataset.eqmat; if (rerender) rerender(); });
    root.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_buy', itemType: b.dataset.buy, material: craftEquipSel[b.dataset.buy] }));
    root.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_sell', id: b.dataset.sell }));
    root.querySelectorAll('[data-relic]').forEach(b => b.onclick = () => sendPrimary({ type: 'sell_relic', id: b.dataset.relic }));   // 철제 위세품
  }
  function renderCraftPanel() {
    const list = document.getElementById('craftList');
    if (!list) return;
    list.innerHTML = '';
    // ★★[T66 2차] 도구도 **아이템**이다 ⇒ 어디서나 같은 그림(`itemPic`)이고, 없으면 점선 칸이다
    //   (재민 확정 4·5). 1차 판은 여기에 아이콘 **이름**을 글자로 찍고 있었다 — `axe 도끼`.
    const eqEl = document.getElementById('equippedNow');
    if (eqEl) {
      eqEl.innerHTML = equipped
        ? itemPic(equipped, 14) + ' ' + (TOOL_LABELS[equipped] || equipped)
        : '없음';
    }
    for (const [name, r] of Object.entries(recipes)) {
      const have = hasToolAlive(name) ? 1 : 0;
      const canCraft = !hasToolAlive(name) && (inventory.wood || 0) >= r.wood && (inventory.stone || 0) >= r.stone;
      const isEq = equipped === name;
      const row = document.createElement('div');
      row.className = 'craft-row' + (isEq ? ' eq' : '');
      row.innerHTML = `
        <div class="craft-icon">${itemPic(name, 26)}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} <span class="craft-have">×${have}</span></div>
          <div class="craft-cost">${r.wood} · ${r.stone}</div>
        </div>
        <button class="craft-btn" data-craft="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        <button class="equip-btn" data-equip="${name}" ${have > 0 ? '' : 'disabled'}>${isEq ? '해제' : '장착'}</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft', recipe: b.dataset.craft }));
    list.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
      const t = b.dataset.equip;
      sendPrimary({ type: 'equip', tool: equipped === t ? null : t });
    });
    // 14.50: 아이템 가공 (plank — 통나무→판자, 톱 필요)
    if (itemRecipes && Object.keys(itemRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid var(--inset);font-weight:bold';
      hdr.textContent = '— 아이템 가공 (목공) —';
      list.appendChild(hdr);
      for (const [name, ir] of Object.entries(itemRecipes)) {
        const hasTool = !ir.requiresTool || hasToolAlive(ir.requiresTool);
        const canCraft = hasTool && Object.entries(ir.from).every(([k, v]) => (inventory[k] || 0) >= v);
        const fromStr = Object.entries(ir.from).map(([k, v]) => `${itemIconHtml(k, 18, itemKo(k))} ${v}`).join(' · ');
        const toStr = Object.entries(ir.to).map(([k, v]) => `${itemIconHtml(k, 18, itemKo(k))} ×${v}`).join(' ');
        const toolStr = ir.requiresTool ? ` (${ir.requiresTool} 필요)` : '';
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon"></div>
          <div class="craft-info">
            <div class="craft-name">${ir.label}${toolStr}</div>
            <div class="craft-cost">${fromStr} ${toStr}</div>
          </div>
          <button class="craft-btn" data-craftitem="${name}" ${canCraft ? '' : 'disabled'}>가공</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftitem]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_item', recipe: b.dataset.craftitem }));
    }
    // 14.51: 건축물 제작 (제작 → 인벤 → 건축 모드에서 배치)
    if (buildingRecipes && Object.keys(buildingRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid var(--inset);font-weight:bold';
      hdr.textContent = '— 건축물 제작 (만들면 인벤 건축 모드에서 배치) —';
      list.appendChild(hdr);
      for (const [name, br] of Object.entries(buildingRecipes)) {
        const hasHammer = !br._needHammer && !br._useHammer || hasToolAlive('hammer');
        const cost = {};
        for (const [k, v] of Object.entries(br)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        const canCraft = hasHammer && Object.entries(cost).every(([k, v]) => (inventory[k] || 0) >= v);
        const costStr = Object.entries(cost).map(([k, v]) => `${itemIconHtml(k, 18, itemKo(k))} ${v}`).join(' · ');
        const hammerStr = br._needHammer ? ' ' : '';
        const have = inventory[name] || 0;
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon">${itemIconHtml(name, 34, '')}</div>
          <div class="craft-info">
            <div class="craft-name">${br.label} <span class="craft-have">×${have}</span>${hammerStr}</div>
            <div class="craft-cost">${costStr || '-'}</div>
          </div>
          <button class="craft-btn" data-craftbuild="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftbuild]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_building', recipe: b.dataset.craftbuild }));
    }
    // ── 플레이어 장비 제작 (숙련·재료로 품질↑ — "방한 62·내구 85" 미리보기) ──
    if (equipmentRecipes && Object.keys(equipmentRecipes).length && equipmentMeta) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid var(--inset);font-weight:bold';
      hdr.textContent = '— 장비 제작 (숙련·재료로 품질) —';
      list.appendChild(hdr);
      const wrap = document.createElement('div');
      wrap.innerHTML = equipmentSectionHtml();
      list.appendChild(wrap);
      wireEquipmentHandlers(list, renderCraftPanel);
    }
  }
  function renderChestUi(id, data) {
    if (id !== openChestId) return;
    const wood = data?.wood || 0, stone = data?.stone || 0;
    document.getElementById('chestWood').textContent = wood;
    document.getElementById('chestStone').textContent = stone;
  }

  // === Cook 패널 ===
  let cookOpen = false;
  function toggleCookPanel() {
    cookOpen = !cookOpen;
    const panel = document.getElementById('cookPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !cookOpen);
    if (cookOpen) renderCookPanel();
  }
  function renderCookPanel() {
    const list = document.getElementById('cookList');
    if (!list) return;
    list.innerHTML = '';
    const entries = Object.entries(cookRecipes || {});
    if (entries.length === 0) {
      list.innerHTML = '<div class="hint">요리 레시피 없음</div>';
      return;
    }
    for (const [name, r] of entries) {
      const canCook = Object.entries(r.cost).every(([k, v]) => (inventory[k] || 0) >= v);
      const costStr = Object.entries(r.cost).map(([k, v]) => `${itemIconHtml(k, 18, itemKo(k))} ${v}`).join(' · ');
      const prodStr = Object.entries(r.produces).map(([k, v]) => `${itemIconHtml(k, 18, itemKo(k))} ×${v}`).join(' ');
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.innerHTML = `
        <div class="craft-icon">${itemIconHtml(name, 34, '')}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} ${prodStr}</div>
          <div class="craft-cost">${costStr}</div>
        </div>
        <button class="craft-btn" data-cook="${name}" ${canCook ? '' : 'disabled'}>요리</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-cook]').forEach(b => b.onclick = () => sendPrimary({ type: 'cook', recipe: b.dataset.cook }));
    // 요리 인스턴스(신선도·버프) 목록
    if (dishes && dishes.length) {
      const dwrap = document.createElement('div');
      dwrap.innerHTML = dishesListHtml();
      list.appendChild(dwrap);
      wireDishHandlers(list);
    }
  }
  // 인벤토리 바뀌면 패널 열려있을 때 갱신
  function rerenderPanelsIfOpen() {
    if (craftOpen) renderCraftPanel();
    if (cookOpen) renderCookPanel();
  }

  // === Phase 14.41: 다운 / 부활 패널 ===
  function showDownPanel() {
    const panel = document.getElementById('downPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderDownPanel();
  }
  function hideDownPanel() {
    const panel = document.getElementById('downPanel');
    if (panel) panel.classList.add('hidden');
  }
  function renderDownPanel() {
    const optBox = document.getElementById('downOptions');
    if (!optBox) return;
    optBox.innerHTML = '';
    // 우선순위 정렬: personal > temporary > guild > home
    const KIND_ORDER = { personal: 0, temporary: 1, guild: 2, home: 3 };
    const KIND_LABEL = { personal: '개인', temporary: '임시', guild: '길드', home: '마을광장' };
    const sorted = [...myRespawnOptions].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    if (sorted.length === 0) {
      const none = document.createElement('div');
      none.className = 'down-opt-none';
      none.innerHTML = '부활 가능한 지점이 없습니다.<br/>사유지를 만들거나 길드에 가입하세요.<br/><span style="font-size:10px;opacity:0.7">길드원이 R 키로 구조해줄 수 있음</span>';
      optBox.appendChild(none);
    } else {
      for (const o of sorted) {
        const btn = document.createElement('button');
        btn.className = `down-opt ${o.kind}`;
        const kindLabel = KIND_LABEL[o.kind] || o.kind;
        btn.innerHTML = `<span class="kind-badge">${kindLabel}</span> (${Math.round(o.x)}, ${Math.round(o.y)})에서 부활`;
        btn.onclick = () => sendPrimary({ type: 'respawn_choice', kind: o.claimId });
        optBox.appendChild(btn);
      }
    }
    // 첫 렌더 시 hint 초기화
    const hint = document.getElementById('downRescueHint');
    if (hint) hint.classList.remove('expired');
  }
  // 1초마다 타이머 업데이트 + 윈도우 만료 시 hint 회색
  setInterval(() => {
    if (!myIsDown) return;
    const elapsedMs = performance.now() - myDownedAt;
    const remainMs = Math.max(0, myDownRescueWindowMs - elapsedMs);
    const sec = Math.ceil(remainMs / 1000);
    const tEl = document.getElementById('downTimer');
    const hint = document.getElementById('downRescueHint');
    if (remainMs > 0) {
      if (tEl) tEl.textContent = sec;
      if (hint) hint.classList.remove('expired');
    } else {
      if (hint) {
        hint.classList.add('expired');
        hint.innerHTML = '구조 가능 시간 지남. 사유지를 선택해 부활하세요.';
      }
    }
  }, 500);

  // === 길드 패널 ===
  let tribeOpen = false;
  function toggleTribePanel() {
    if (typeof togglePanel === 'function') return togglePanel('tribe'); // 14.16
    tribeOpen = !tribeOpen;
    const panel = document.getElementById('tribePanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !tribeOpen);
    if (tribeOpen) renderTribePanel();
  }
  async function renderTribePanel() {
    const body = document.getElementById('tribeBody');
    if (!body) return;
    body.innerHTML = '<div class="hint">로딩 중...</div>';
    if (!myUsername || myUsername.startsWith('anon_')) {
      body.innerHTML = '<div class="hint">게스트 모드는 길드 사용 불가 — 로그인 필요</div>';
      return;
    }
    if (myTribeId) {
      // 내 길드 정보
      try {
        const r = await fetch(`/tribe/${myTribeId}`);
        const data = await r.json();
        const members = (data.members || []).map(m =>
          `<div class="craft-row"><span style="background:${m.color};display:inline-block;width:10px;height:10px;border-radius: 0;margin-right:6px"></span>${m.name}${m.player_id === data.tribe.leader_id ? ' ' : ''}</div>`
        ).join('');
        // Phase 14.2 — 길드 vp + treasury + behavior_tier
        const vp = data.tribe.vp || 0;
        let tierLabel, tierColor;
        if (vp < 30) { tierLabel = '청정 (clean)'; tierColor = 'var(--stam)'; }
        else if (vp < 80) { tierLabel = '보통 (normal)'; tierColor = 'var(--accent)'; }
        else { tierLabel = '악성 (evil)'; tierColor = 'var(--hp)'; }
        const treasury = data.treasury || {};
        const trItems = Object.entries(treasury).filter(([k,v]) => v > 0)
          .map(([k,v]) => `${itemIconHtml(k, 18, itemKo(k))} ${v}`).join(' · ') || '(비어있음)';
        const isNpc = data.tribe.is_npc;
        const tierBadge = isNpc ? `<span class="badge" style="background:var(--thirst)">NPC길드 (${data.tribe.behavior_tier})</span>` : '';
        // Phase 14.9 — 전쟁 선포 대상 목록 (내 길드 X, 이미 전쟁중 X)
        let warsHtml = '';
        let declareHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          const myWars = (wd.wars || []).filter(w => w.attacker_guild_id === myTribeId || w.defender_guild_id === myTribeId);
          if (myWars.length > 0) {
            warsHtml = '<div class="hint" style="margin-top:8px">진행 중 전쟁:</div>' + myWars.map(w => {
              const other = w.attacker_guild_id === myTribeId ? `[${w.defender_name}] (공격)` : `[${w.attacker_name}] (방어)`;
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">${other}</div><div class="craft-cost">tier=${w.tier} · loot=${(w.loot_rate*100).toFixed(0)}% · damage=${(w.damage_rate*100).toFixed(0)}%</div></div><button class="craft-btn" data-end-war="${w.id}">종전</button></div>`;
            }).join('');
          }
          // 선포 대상 — NPC 길드 우선 (플레이어 길드끼리도 가능)
          const allR = await fetch('/tribes');
          const allD = await allR.json();
          const candidates = (allD.tribes || []).filter(t => t.id !== myTribeId &&
            !(wd.wars || []).some(w => (w.attacker_guild_id === myTribeId && w.defender_guild_id === t.id) || (w.defender_guild_id === myTribeId && w.attacker_guild_id === t.id))
          );
          if (candidates.length > 0) {
            declareHtml = '<div class="hint" style="margin-top:8px">선전포고 대상:</div>' + candidates.slice(0, 10).map(t => {
              const v = t.vp || 0;
              const tag = v < 30 ? '청정 (침략시 적대감)' : v < 80 ? '보통' : '악성 (토벌!)';
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${t.is_npc?' ':''}</div><div class="craft-cost">${tag} vp=${v.toFixed(0)}</div></div><button class="craft-btn" data-declare="${t.id}">선포</button></div>`;
            }).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">소속 길드: <b>[${myTribeName}]</b> (멤버 ${data.members.length}명) ${tierBadge}</div>
          <div class="hint" style="margin-top:6px">길드 명성: <b style="color:${tierColor}">${vp.toFixed(0)}/200 · ${tierLabel}</b></div>
          <div class="hint" style="font-size:11px;opacity:0.7">청정=침략 시 약함·침략자 +대량적대감 / 악성=토벌 대상</div>
          <div class="hint" style="margin-top:6px">길드 금고: <b>${trItems}</b></div>
          <div class="hint" style="margin-top:6px">사유지 슬롯 (Phase 14.18): <b>${countMyClaimsClient()}</b><br/><span style="font-size:10px;opacity:0.7">C=개인 (길드영토 안만) · T=임시 (어디든) · Shift+C=길드영토 (멤버만)</span></div>
          <button class="craft-btn" id="tribeGranaryBtn" style="margin-top:8px;background:var(--accent)">길드 곳간 건설 (판자12·돌8 — 길드영토 안, 리더)</button>
          <div class="hint" style="font-size:10px;opacity:0.7">내 위치 북쪽 3칸에 5×3 밀폐 곳간 — 멤버 공유 창고, 전쟁 시 약탈 목표</div>
          ${warsHtml}
          ${declareHtml}
          <div class="hint" style="margin-top:8px">멤버 목록:</div>
          ${members}
          <div class="hint" style="margin-top:8px">길드 채팅: <b>Enter /t 메시지</b></div>
          <button class="craft-btn" id="tribeLeaveBtn" style="margin-top:12px;background:var(--hp)">길드 탈퇴</button>
        `;
        // 선포 버튼 핸들러
        body.querySelectorAll('[data-declare]').forEach(b => b.onclick = async () => {
          const did = parseInt(b.dataset.declare, 10);
          if (!confirm('선전포고하면 침략자 적대감이 부과될 수 있어요. 진행할까요?')) return;
          const r = await fetch('/war/declare', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ attacker_guild_id: myTribeId, defender_guild_id: did, declared_by: myUsername }) });
          const d = await r.json();
          if (d.ok) { showNotice(`전쟁 선포! tier=${d.tier} loot=${(d.loot_rate*100).toFixed(0)}%`); renderTribePanel(); }
          else alert(d.error || '선포 실패');
        });
        body.querySelectorAll('[data-end-war]').forEach(b => b.onclick = async () => {
          const wid = parseInt(b.dataset.endWar, 10);
          const r = await fetch('/war/end', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ war_id: wid }) });
          const d = await r.json();
          if (d.ok) { showNotice('전쟁 종료'); renderTribePanel(); }
          else alert(d.error || '종전 실패');
        });
        const grBtn = document.getElementById('tribeGranaryBtn');
        if (grBtn) grBtn.onclick = () => { buildMode = true; placementMode = { special: 'guild_granary' }; toggleTribePanel(); showNotice('길드 곳간 배치 모드 — 길드영토 안 클릭 (5×3 밀폐 · 밖에서 지으세요 · B=취소)'); };
        document.getElementById('tribeLeaveBtn').onclick = async () => {
          if (!confirm('정말 탈퇴하시겠습니까?')) return;
          const r = await fetch('/tribe/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername }) });
          const d = await r.json();
          if (d.ok) { myTribeId = null; myTribeName = null; sendPrimary({ type: 'tribe_set', tribeId: null, tribeName: null }); renderTribePanel(); }
          else alert(d.error || '탈퇴 실패');
        };
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    } else {
      // 길드 없음 — 만들기 또는 가입
      try {
        const r = await fetch('/tribes');
        const data = await r.json();
        const list = (data.tribes || []).map(t => {
          const vp = t.vp || 0;
          let tag, col;
          if (vp < 30) { tag = '청정'; col = 'var(--stam)'; }
          else if (vp < 80) { tag = '보통'; col = 'var(--accent)'; }
          else { tag = '악성'; col = 'var(--hp)'; }
          const npcBadge = t.is_npc ? ' ' : '';
          return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${npcBadge}</div><div class="craft-cost">멤버 ${t.member_count} · <span style="color:${col}">${tag} ${vp.toFixed(0)}</span></div></div><button class="craft-btn" data-join="${t.id}">가입</button></div>`;
        }).join('');
        // Phase 14.9 — 전쟁 활성 목록 표시
        let warsHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          if ((wd.wars || []).length > 0) {
            warsHtml = '<div class="hint" style="margin-top:12px">활성 전쟁:</div>' +
              wd.wars.map(w => `<div class="craft-row" style="font-size:12px"><div class="craft-info">[${w.attacker_name}] [${w.defender_name}] (${w.tier})</div></div>`).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">새 길드 만들기:</div>
          <div style="display:flex;gap:6px;margin:4px 0 12px">
            <input id="tribeNameInput" maxlength="20" placeholder="길드 이름" style="flex:1;padding:4px 6px"/>
            <button class="craft-btn" id="tribeCreateBtn">만들기</button>
          </div>
          <div class="hint">또는 기존 길드 가입:</div>
          ${list || '<div class="hint">(길드 없음)</div>'}
          ${warsHtml}
        `;
        document.getElementById('tribeCreateBtn').onclick = async () => {
          const name = document.getElementById('tribeNameInput').value.trim();
          if (!name) return;
          const r = await fetch('/tribe/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, name }) });
          const d = await r.json();
          if (d.ok) { myTribeId = d.tribe_id; myTribeName = d.name; sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name }); renderTribePanel(); }
          else alert(d.error || '생성 실패');
        };
        body.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
          const tid = parseInt(b.dataset.join, 10);
          const r = await fetch('/tribe/join', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, tribe_id: tid }) });
          const d = await r.json();
          if (d.ok) {
            myTribeId = d.tribe_id; myTribeName = d.name;
            sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name });
            if (d.promoted) showNotice(`[${d.name}] 길드 운영권 인수! 당신이 새 리더입니다`);
            renderTribePanel();
          }
          else alert(d.error || '가입 실패');
        });
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    }
  }

  let noticeTimer;
  // ★[2026-08-25 사건 레이어] `ms` 인자 추가 — 게시판 목록은 한 줄보다 오래 떠야 읽힌다.
  //   새 패널을 만들지 않는다(설계 §3.2 "대시보드 UI 금지" · 배치 지시 "기존 HUD 문법 재사용").
  //   여러 줄은 `\n` 그대로 — `#notice` 에 `white-space: pre-line` 을 줬다.
  function showNotice(text, ms) {
    // ★진단 훅(읽기 전용): 최근 알림 40건 — 하네스가 '재료 부족/의뢰 성공' 같은 서버 응답을 실측하는 통로.
    (window.__notices = window.__notices || []).push(text); if (window.__notices.length > 40) window.__notices.shift();
    document.getElementById('notice').textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      document.getElementById('notice').textContent = '';
    }, ms || 2500);
  }

  boot();

  // === Phase 14.17: 좀보이드 정통 — 좌측 사이드바 + 상단 인벤 드롭다운 ===
  // 사이드 아이콘 4개(제작/건축/길드/거래소) + 인벤은 상단 드롭다운(별개)
  let activeSide = null; // 좌측 패널 (한 번에 1개)
  let invOpen = false;

  function openSide(name) {
    activeSide = name;
    document.getElementById('sidePanel').classList.add('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.toggle('active', t.dataset.side === name));
    document.getElementById('spTitle').textContent = ({
      craft: '제작', build: '건축', tribe: '길드', market: '시세',
      skills: '스킬', claims: '사유지', body: '상태', trade: '거래소',
      facility: (myFacility && myFacility.near) ? `${myFacility.near.ko}` : '제작창',
      chronicle: '연대기',   // [T18] §8.2 3단계 중 — 이 표에 없으면 영문 키가 제목에 뜬다
    })[name] || name;
    // ★[§8.2 패널 프레임 규약] 이 표에 없는 이름은 **영문 키가 그대로 제목에 뜬다**(실제로 `body` 가 그랬다).
    //   다음 패널을 붙이는 사람에게: ①`#sidebar` 에 `.sb-icon[data-side]` 한 줄(단축키 병기)
    //   ②이 표에 한글 제목 ③`renderSide` 에 분기 — 셋을 다 해야 탭이 완성된다.
    // ★거래소는 **열 때 서버에 물어본다** — 시세를 클라가 캐시해 두면 그게 곧 낡은 시세다.
    if (name === 'trade') {
      const vid = window.__evNearVid;
      if (vid == null) { myTrade = null; }
      else window.__sendPrimary({ type: 'village_trade', vid });
    }
    // ★[T18] 연대기도 **열 때 서버에 묻는다** — 역사는 클라가 캐시할 것이 아니다(캐시는 정본 쪽 하나).
    if (name === 'chronicle') chronAsk(null);
    renderSide(name);
  }
  function closeSide() {
    activeSide = null;
    document.getElementById('sidePanel').classList.remove('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.remove('active'));
  }
  function toggleSide(name) {
    if (activeSide === name) closeSide();
    else openSide(name);
  }
  // 호환: 옛 togglePanel(name)이 inv면 인벤 토글, 나머지는 좌측 패널
  function togglePanel(name) {
    if (name === 'inv') return toggleInv();
    return toggleSide(name);
  }

  function openInv() {
    if (invOpen) return;
    invOpen = true;
    document.getElementById('invDropdown').classList.add('open');
    renderInvPanel(document.getElementById('invBody'));
  }
  function closeInv() {
    if (!invOpen) return;
    invOpen = false;
    document.getElementById('invDropdown').classList.remove('open');
  }
  function toggleInv() { invOpen ? closeInv() : openInv(); }
  // ★[정비 배치] 하네스가 인벤을 열고 닫는 창구 — 새 능력 0(키 이벤트와 같은 함수를 부른다).
// @@moved:13719
  window.__closeInv = () => { closeInv(); return true; };
  window.__invOpen = () => invOpen;
  // ★[정비 배치] 유령 클라 하네스용 — primary 소켓 자체를 내준다(읽기 전용 진단 훅).
  //   왜 소켓이 필요한가: "소켓은 살아 있는데 **틱만** 안 오는" 상태를 재현해야 이 감시가 검증된다.
  //   소켓을 닫아 버리면 옛 감시(onclose→재연결)가 먼저 잡아 새 감시를 안 거친다.
  window.__primaryWs = () => { const c = conns.get(primaryZoneId); return c ? c.ws : null; };

  document.querySelectorAll('.sb-icon').forEach(t => {
    t.addEventListener('click', () => toggleSide(t.dataset.side));
  });

  // Phase 14.21: 인벤 hover-open (mouseleave 자동닫힘 폐기 — outside click만 닫음)
  const invToggleEl = document.getElementById('invToggle');
  const invDropEl = document.getElementById('invDropdown');
  invToggleEl.addEventListener('mouseenter', openInv);
  invToggleEl.addEventListener('click', toggleInv);
  // 빈 화면 클릭에서만 닫음 (아래 mousedown handler)

  // 빈 화면 클릭 → 인벤·사이드 패널 둘 다 닫음
  document.addEventListener('mousedown', (e) => {
    const inInv = invDropEl.contains(e.target) || invToggleEl.contains(e.target);
    const inSide = document.getElementById('sidePanel').contains(e.target) || document.getElementById('sidebar').contains(e.target);
    const inChat = document.getElementById('chatPanel')?.contains(e.target);
    if (!inInv && !inSide && !inChat) {
      if (invOpen) closeInv();
      if (activeSide) closeSide();
    }
  });

  document.getElementById('spClose').addEventListener('click', closeSide);

  // Esc 처리
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e)) return;   // [T61 ] 규약 하나 — 글자를 치는 중이면 게임 키는 없다
    if (e.key === 'Escape') {
      if (placementMode) { placementMode = null; showNotice('배치 모드 취소'); e.stopPropagation(); return; }
      if (invOpen) { closeInv(); e.stopPropagation(); }
      else if (activeSide) { closeSide(); e.stopPropagation(); }
    }
  });
  // 단축키 (I=인벤 / K=제작 / Shift+B=건축) — 채팅 input focused 아닐 때만
  document.addEventListener('keydown', (e) => {
    // ★[T61 ⓪] 종전엔 **채팅칸 하나만** 봤다(`activeElement === chatInput`) — 로그인 칸에서
    //   `i`·`k` 가 패널을 열던 자리다. 술어 하나로 바꾼다(채팅칸도 그 안에 있다).
    if (isTypingTarget(e)) return;
    const k = e.key.toLowerCase();
    // ★★[T55 2026-09-02] 여기도 **머리에서 한 번** 가른다(99-main.js 와 같은 구조 — 규약을 둘로 두지 않는다).
    //   종전엔 `Shift+I`·`Shift+Y`·`Shift+P`·`Shift+Q` 가 맨손 분기를 그대로 밟았다
    //   (그리고 그 순간 99-main 의 맨손 체인도 같이 밟혀 **패널이 열리면서 밭이 갈렸다**).
    if (e.shiftKey) {
      if (k === 'k') { toggleSide('facility'); e.preventDefault(); }   // [시설 제작창] 시설의 창(자동으로도 열린다)
      else if (k === 'h') { toggleSide('body'); e.preventDefault(); }  // [신체 상태] 상태 패널
      else if (k === 't') { toggleSide('trade'); e.preventDefault(); } // [거래소] 마을 시세표
      else if (k === 'b') { toggleSide('build'); e.preventDefault(); }
      else if (k === 'j') { toggleSide('chronicle'); e.preventDefault(); }   // [T18] 연대기()
      return;
    }
    if (k === 'i') { toggleInv(); e.preventDefault(); }
    else if (k === 'k') { toggleSide('craft'); e.preventDefault(); }
    else if (k === 'y') { toggleSide('claims'); e.preventDefault(); }
    else if (k === 'p') { toggleSide('skills'); e.preventDefault(); }
    else if (k === 'q') { toggleSide('market'); e.preventDefault(); }
  });

  // ★★[신체 상태 §8.3] 무들 — **서버가 매긴 단계만** 그린다. 3단계에서만 가장자리 한 겹.
  // ★★[T66] 무들 아이콘 — **축 이름**으로 고른다. 서버가 실어 보내는 `emo` 는 이모지라 안 쓴다
  //   (지우려면 서버 접점이 필요하고 이 카드의 예산은 한 줄이다 — 그 한 줄은 ⓪ 이 썼다. 회부).
  const MOODLE_ICO = { hunger: 'food', thirst: 'drop', cold: 'snow', fatigue: 'bolt',
    injury: 'heart', morale: 'star', carry: 'weight', aftermath: 'heart' };
  function renderMoodles() {
    const box = document.getElementById('moodles');
    if (!box) return;
    // ★[무게 배치] **무거움**은 신체 무들과 같은 프레임에 얹는다(§8.3 — 겉은 계단).
    //   단계는 서버가 매겨 보낸다(클라가 다시 양자화하면 히스테리시스가 두 벌이 되어 깜빡인다).
    const ms = ((myBody && myBody.moodles) || []).slice();
    if (myCarry && myCarry.stage > 0) ms.push({ axis: 'carry', ko: '무거움', stage: myCarry.stage });
    // ★★[T61 2026-09-03] **후유증 한 칸** — 쓰러졌다 깨어난 뒤 스태미나 **상한**이 눌린 동안(T43).
    //   계약은 T56 이 정한다: `aftermath { days, cap }`(남은 게임일 · 지금의 상한 0..1).
    //   ⚠**계약이 안 왔으면 안 그린다.** 서버가 그 칸을 아직 안 실어 보내는 동안 화면은 종전 그대로다
    //     — 없는 값을 클라가 유도하면 그게 사본이고, T56 이 착지하는 날 두 수가 갈린다.
    //   ⚠**단계를 클라가 매기지 않는다**(§8.3 — 단계는 서버 몫). 그래서 늘 1단계로 두고,
    //     정도는 **글자**로 말한다(남은 날 · 상한 %). 3단계가 아니므로 비네트도 안 켜진다 — 후유증은
    //     위급이 아니라 회복 중이라는 표시다.
    const _am = (myBody && myBody.aftermath) || null;
    if (_am && (_am.days | 0) > 0) {
      const _capTx = (typeof _am.cap === 'number' && _am.cap < 0.999) ? ` · 힘 ${Math.round(_am.cap * 100)}%` : '';
      ms.push({ axis: 'aftermath', ko: `후유증 ${_am.days | 0}일${_capTx}`, stage: 1 });
    }
    box.innerHTML = ms.map((m) =>
      `<div class="moodle s${m.stage}" data-axis="${m.axis}" data-stage="${m.stage}">`
      + `<span class="mo-emo">${uiIcon(MOODLE_ICO[m.axis] || 'star', 13)}</span><span>${m.ko}</span>`
      + `<span class="mo-dots">${[1,2,3].map((i) => `<span class="mo-dot${i <= (m.stage|0) ? ' on' : ''}"></span>`).join('')}</span></div>`).join('');
    // ★★[정비 배치 2026-08-30 재민 확정 §3] **비네트가 원인 축을 말한다.**
    //   실기 실측: 화면이 붉은데 재민이 원인을 **무게로 오독**했다. 방금 판자를 버린 사람이
    //   붉은 화면을 보면 당연히 무게를 의심한다 — 그런데 무게는 1단계였고 3단계는 다른 축이었다.
    //   아날로그 채널이 "심각함"만 외치고 **"무엇이"** 를 안 말한 것이 결함이다.
    //   수리 둘: ⓐ 3단계 축 아이콘을 화면 가장자리에 **크게** ⓑ 비네트 **색조를 축 계열로**.
    //   ★새 아트 금지 — 기존 무들 이모지를 키워 쓴다. §7 동시 표시 상한(`moodleShowMax`)을 그대로 지킨다.
    const sev3 = ms.filter((m) => m.stage >= 3)
      .sort((a, b) => (b.sev || 0) - (a.sev || 0))
      .slice(0, Math.max(1, uiCfg.moodleShowMax | 0));
    const vg = document.getElementById('bodyVignette');
    if (vg) {
      vg.classList.toggle('on', sev3.length > 0);
      const tint = (uiCfg.vignetteTint && sev3.length) ? (VIGNETTE_RGB[sev3[0].axis] || VIGNETTE_RGB._) : VIGNETTE_RGB._;
      vg.style.setProperty('--vg-rgb', tint);
      vg.dataset.axis = sev3.length ? sev3[0].axis : '';
    }
    const bigBox = document.getElementById('vgAxes');
    if (bigBox) {
      bigBox.innerHTML = sev3.map((m) =>
        `<div class="vg-axis" data-axis="${m.axis}" data-stage="${m.stage}" style="--vg-rgb:${VIGNETTE_RGB[m.axis] || VIGNETTE_RGB._}">`
        + `<span class="vg-emo">${uiIcon(MOODLE_ICO[m.axis] || 'warn', 34)}</span><span class="vg-ko">${m.ko || m.axis}</span></div>`).join('');
      bigBox.classList.toggle('on', sev3.length > 0);
    }
  }
  // ★§8.6 이 창의 존재 이유: **"왜 내가 지금 이렇지"에 답하는 것.**
  //   그래서 수치를 나열하지 않고 **효과를 원인과 함께** 적는다 — "이속 −8% (피로 0.62)".
  //   그 문장의 재료(parts)는 서버가 계산해 보낸다(하네스도 클라도 곡선을 다시 안 푼다).
  function renderBodyPanel(body) {
    const b = myBody;
    if (!b) { body.innerHTML = '<div class="bd-none">몸 상태를 아직 못 받았다 — 잠시 뒤 다시 열어 보라.</div>'; return; }
    const pct = (v) => Math.max(0, Math.min(100, v));
    const need = (emo, name, v) => {
      const cls = v < 25 ? 'bad' : (v < 50 ? 'warn' : '');
      return `<div class="bd-row"><span class="bd-emo">${uiIcon(emo, 14)}</span><span class="bd-name">${name}</span>`
        + `<span class="bd-bar"><span class="bd-fill ${cls}" style="width:${pct(v)}%"></span></span>`
        + `<span class="bd-num">${Math.round(v)}%</span></div>`;
    };
    const sev = (emo, name, v) => {
      const p2 = pct(v * 100), cls = v > 0.7 ? 'bad' : (v > 0.4 ? 'warn' : '');
      return `<div class="bd-row"><span class="bd-emo">${uiIcon(emo, 14)}</span><span class="bd-name">${name}</span>`
        + `<span class="bd-bar"><span class="bd-fill ${cls}" style="width:${p2}%"></span></span>`
        + `<span class="bd-num">${Math.round(p2)}%</span></div>`;
    };
    let h = '<div class="bd-sec">욕구</div>';
    h += need('food', '배고픔', b.hunger) + need('drop', '목마름', b.thirst);
    // ★★[신체 3층 재배선 2026-08-30] 스태미나는 **욕구가 아니라 힘**이다 — 따로 세운다.
    //   그리고 "왜 안 차는가"를 여기서 답한다: 허기·갈증이 하는 일은 **이것 하나**다.
    h += '<div class="bd-sec">힘</div>';
    if (typeof b.stam === 'number') {
      const sp = pct(b.stam * 100), scls = b.stamLock ? 'bad' : (b.stam < 0.35 ? 'warn' : '');
      h += `<div class="bd-row"><span class="bd-emo">${uiIcon('bolt', 14)}</span><span class="bd-name">스태미나</span>`
        + `<span class="bd-bar"><span class="bd-fill ${scls}" style="width:${sp}%"></span></span>`
        + `<span class="bd-num">${Math.round(sp)}%</span></div>`;
      h += `<div class="bd-why">달리기는 이걸 쓴다 — <b>짐이 무거우면 더 빨리</b> 준다. `
        + (b.stamLock ? '<b>지금은 바닥나 숨을 고르는 중</b>이다(어느 정도 차야 다시 달린다).'
                      : (b.canSprint === false ? '지금은 달릴 수 없다.' : '지금은 달릴 수 있다.')) + '</div>';
      const rp = (b.recoverParts || []).filter((x) => x.recover < 0.999);
      if (typeof b.recover === 'number' && b.recover < 0.999) {
        // ★[T66 2차] 서버 `emo` 안 쓴다 — 축 표에서 그림을 고른다(위 "지금 걸린 효과"와 같은 규약).
        const why = rp.map((x) => `${uiIcon(MOODLE_ICO[x.axis] || 'warn', 12)}${x.ko} ×${x.recover.toFixed(2)}`).join(' · ');
        h += `<div class="bd-why">회복 속도 <b>×${b.recover.toFixed(2)}</b>${why ? ` — ${why}` : ''}`
          + `<br>배고픔·목마름은 <b>걸음을 늦추지 않는다</b>. 대신 <b>숨 고르기와 아묾</b>이 느려진다.`
          + (b.recover <= 0 ? ' <b>지금은 아예 멈춰 있다</b>(그래도 체력이 깎이지는 않는다).' : '') + '</div>';
      }
    }
    h += '<div class="bd-sec">몸</div>';
    h += sev('snow', '추위', b.cold) + sev('bolt', '피로', b.fatigue) + sev('heart', '부상', b.injury);
    if (b.injury > 0.01) {
      h += `<div class="bd-why">부상은 시간이 낫게 한다${b.herb ? ' · <b>약초가 듣는 중</b>(회복 빨라짐)' : ' — <b>약초(herb)</b>를 먹으면 빨라진다'}</div>`;
    }
    h += '<div class="bd-sec">지금 걸린 효과</div>';
    const parts = (b.parts || []).filter((x) => x.move < 0.999 || x.work < 0.999 || x.axis === 'morale');
    if (!parts.length) h += '<div class="bd-none">없다 — 몸이 성하다.</div>';
    else {
      for (const x of parts) {
        const bits = [];
        if (x.move < 0.999) bits.push(`이속 ${Math.round((x.move - 1) * 100)}%`);
        if (x.work < 0.999) bits.push(`작업 ${Math.round((x.work - 1) * 100)}%`);
        if (x.work > 1.001) bits.push(`작업 +${Math.round((x.work - 1) * 100)}%`);
        // ★★[T66 2차] 서버가 같이 보내는 `emo`(😩🥶🩹 …)는 **안 쓴다** — 화면 규칙 B(UI 이모지 0).
        //   그림은 무들과 **같은 축 표**(`MOODLE_ICO`)에서 고른다. 문장은 서버가 준 `ko` 하나 그대로다.
        //   ⚠1차 판이 여기를 놓쳤다: `e2e-ui ⑪ⓒ` 가 `#hud`·레일·무들만 봤고 **상태창은 안 봤다**.
        //     그래서 ⓒ 에 상태창을 더했다 — 실기 화면이 검사보다 먼저 알려 준 자리다.
        h += `<div class="bd-why">${uiIcon(MOODLE_ICO[x.axis] || 'warn', 13)} ${bits.join(' · ')} <b>(${x.ko} ${x.sev.toFixed(2)})</b></div>`;
      }
    }
    // ★★[무게 배치 2026-08-27 · §8.6 확정 항목] **총 무게 → 이동 배율**.
    //   "왜 내가 지금 이렇지"의 답이 몸만이 아니라 **짐**일 수 있다 — 그 자리를 여기 만든다.
    if (myCarry) {
      const c = myCarry;
      h += '<div class="bd-sec">짐</div>';
      h += `<div class="bd-why"><b>${(c.kg || 0).toFixed(1)}kg</b> / 용량 ${c.cap}kg`
        + `${c.over ? ` — <b>${Math.round((c.ratio - 1) * 100)}% 초과</b>` : ''}</div>`;
      if (c.moveMult < 0.999) h += `<div class="bd-why">이속 ${Math.round((c.moveMult - 1) * 100)}% · 피로 ×${(c.fatigueMult || 1).toFixed(2)} <b>(짐 ${(c.ratio).toFixed(2)}배)</b></div>`;
      if (c.floored) h += '<div class="bd-floor">과적 바닥 — 더 실어도 이보다 느려지진 않는다(대신 피로는 계속 는다).</div>';
    }
    h += `<div class="bd-sec">합계</div><div class="bd-why">이속 <b>×${(myCarry && typeof myCarry.combined === 'number' ? myCarry.combined : b.moveMult).toFixed(2)}</b>`
      + `${myCarry && myCarry.moveMult < 0.999 ? ` <span class="bd-dim">(몸 ×${b.moveMult.toFixed(2)} × 짐 ×${myCarry.moveMult.toFixed(2)})</span>` : ''}`
      + ` · 작업속도 <b>×${b.workMult.toFixed(2)}</b></div>`;
    if (b.floored) h += '<div class="bd-floor">바닥이 걸렸다 — 아무리 나빠져도 이보다 느려지지 않는다(죽음의 나선 방지).</div>';
    body.innerHTML = h;
  }

  // ★★[거래소 §8.5 문법] 세 클릭 안에 끝난다: **낼 것 고르기 → 받을 것 고르기 → 확정**.
  //   수치는 전부 서버가 준 것을 그대로 그린다 — 클라가 비율을 다시 풀면 그게 사본이고,
  //   화면과 실제가 갈리는 순간 그게 "보이지 않는 손"이 된다(일관성 원칙).
  function renderTradePanel(body) {
    if (!myTrade) {
      body.innerHTML = '<div class="bd-none">거래소는 <b>마을 중심 가까이</b>에서만 열린다 — 이웃 마을 시세는 걸어가서 보는 것이다.</div>';
      return;
    }
    const t = myTrade;
    const kg = (r) => r.ko || r.res;
    let h = `<div class="tr-head"><span><b>${t.name}</b> 거래소</span>`
      + `<span>시세는 <b>${t.numeraireKo}</b> 환산 · 마을 몫 ${Math.round(t.spread * 100)}%</span></div>`;
    // ★★[T11 2026-09-02] **소속 한 줄** — 새 패널이 아니라 이 창의 머리 한 줄이다.
    //   값은 전부 서버가 준 `t.member` 그대로다(클라 재계산 0 — 한도 곡선을 여기서 다시 풀면 그게 사본이다).
    const mb = t.member || null;
    if (mb) {
      if (mb.vid != null) {
        h += `<div class="tr-head" style="border-top:1px solid var(--inset)"><span><b>${mb.name || '마을'}</b> 사람`
          + ` <span style="opacity:.7">· 기여 ${mb.contrib}</span></span>`
          + `<span>곳간 몫 <b>${mb.remain}</b>/${mb.limit}`
          + (mb.remain > 0 ? ` <button class="tr-btn" id="mbWd" style="padding:2px 8px">꺼낸다</button>` : '')
          + `</span></div>`;
      } else if (mb.offer != null) {
        h += `<div class="tr-head" style="border-top:1px solid var(--inset)"><span>촌장이 마을 사람으로 받아 주겠다 한다</span>`
          + `<span>채팅에 <b>/소속</b></span></div>`;
      } else {
        h += `<div class="tr-head" style="border-top:1px solid var(--inset)"><span>아직 이 마을 사람이 아니다</span>`
          + `<span>누적 기여 <b>${mb.contrib}</b>/${mb.need}</span></div>`;
      }
    }
    h += '<div class="tr-hdr"><span></span><span>품목</span><span class="tr-num">시세</span>'
      + '<span class="tr-num">마을</span><span class="tr-num">내것</span></div>';
    for (const r of t.rows) {
      const cls = (trGive === r.res) ? ' give' : (trTake === r.res ? ' take' : '');
      const off = (!r.canGive && !r.canTake) ? ' off' : '';
      // ★★[재민 확정 2026-08-27] **넘침 딱지** — 가격 바닥에 붙어 "아무리 팔아도 값이 안 내려가는" 품목.
      //   판정은 서버가 정본 가격 함수에 직접 물어본 결과다(클라가 다시 풀지 않는다).
      h += `<div class="tr-row${cls}${off}${r.glut ? ' glut' : ''}" data-res="${r.res}">`
        + `<span>${trGive === r.res ? '' : (trTake === r.res ? '' : '')}</span>`
        + `<span>${kg(r)}${r.glut ? ' <i class="tr-glut" title="이 마을엔 이미 남아돈다 — 더 갖다 줘도 값이 더 내려가지 않는다">넘침</i>' : ''}</span>`
        + `<span class="tr-num">${r.num == null ? '—' : r.num}</span>`
        + `<span class="tr-num">${r.sell}</span>`
        + `<span class="tr-num">${r.mine}</span></div>`;
    }
    h += '<div class="tr-deal">';
    if (!trGive) h += '<div class="tr-line">낼 물건을 고르라 ()</div>';
    else if (!trTake) h += `<div class="tr-line"><b>${kg(t.rows.find((r) => r.res === trGive) || {})}</b> — 이제 <b>받을</b> 물건을 고르라 ()</div>`;
    else if (trQuote && trQuote.err) h += `<div class="tr-line">${trQuote.err}</div>`;
    else if (trQuote && trQuote.ok) {
      const gk = kg(t.rows.find((r) => r.res === trGive) || {}), tk = kg(t.rows.find((r) => r.res === trTake) || {});
      h += `<div class="tr-line">${gk} <b>${trQuote.give}</b> ${tk} <b>${trQuote.take}</b></div>`;
      h += `<div class="tr-line">한 개당 ${trQuote.ratio}${trQuote.avgRatio && Math.abs(trQuote.avgRatio - trQuote.ratio) > 1e-4
        ? ` · 이 물량 평균 <b>${trQuote.avgRatio}</b>(많이 낼수록 값이 나빠진다)` : ''}</div>`;
      if (trQuote.capped) h += `<div class="tr-warn">마을이 내줄 수 있는 건 ${trQuote.cap}까지 — ${trQuote.maxGive}개만 받는다</div>`;
      // ★★[무게 배치] **용량 초과 경고** — 막지는 않는다(과적은 플레이어 선택이다).
      //   넘치게 사서 뒤뚱거리며 나르는 것도 플레이라, 화면은 사실만 말하고 결정은 사람이 한다.
      if (myCarry && itemWeights) {
        const wIn = (itemWeights[trQuote.takeRes] || 0) * (trQuote.take || 0);
        const wOut = (itemWeights[trGive] || 0) * (trQuote.give || 0);
        const after = Math.max(0, (myCarry.kg || 0) + wIn - wOut);
        if (after > (myCarry.cap || 0)) {
          h += `<div class="tr-warn">받으면 <b>${after.toFixed(1)}kg</b> — 용량 ${myCarry.cap}kg 를 넘는다(느려지고 피로가 빨리 찬다). 그래도 살 수 있다.</div>`;
        }
      }
    } else h += '<div class="tr-line">…</div>';
    h += `<div class="tr-qty"><input id="trQty" type="number" min="1" value="${trQty}">`
      + `<button class="tr-btn" id="trGo"${(trGive && trTake && trQuote && trQuote.ok && trQuote.take > 0) ? '' : ' disabled'}>바꾼다</button></div>`;
    h += '<div class="tr-hint">시세 = 이 마을이 지금 매기는 값이다. 내가 팔면 흔해져 떨어지고, 사면 귀해져 오른다.<br>'
      + '마을이 원하는 물건은 게시판(Shift+G)에 걸린다 — 그쪽이 늘 값이 낫다.</div>';
    h += '</div>';
    body.innerHTML = h;
    const vid = window.__evNearVid;
    const ask = () => {
      if (trGive && trTake) window.__sendPrimary({ type: 'village_trade_quote', vid, give: trGive, take: trTake, qty: trQty });
    };
    body.querySelectorAll('.tr-row').forEach((el) => {
      el.onclick = () => {
        const res = el.dataset.res;
        const row = t.rows.find((r) => r.res === res);
        if (!row) return;
        if (trGive === res) { trGive = null; }
        else if (trTake === res) { trTake = null; }
        else if (!trGive && row.canGive) trGive = res;
        else if (!trTake && row.canTake && res !== trGive) trTake = res;
        else if (row.canGive) { trGive = res; if (trTake === res) trTake = null; }
        trQuote = null; renderSide('trade'); ask();
      };
    });
    const qi = document.getElementById('trQty');
    if (qi) qi.onchange = () => { trQty = Math.max(1, parseInt(qi.value, 10) || 1); ask(); };
    const go = document.getElementById('trGo');
    if (go) go.onclick = () => {
      window.__sendPrimary({ type: 'village_trade_exec', vid, give: trGive, take: trTake, qty: trQty });
      trQuote = null;
    };
    // ★[T11] 곳간에서 꺼내기 — 수량은 **서버가 오늘 남은 몫만큼** 준다(클라는 요청만 한다).
    const wd = document.getElementById('mbWd');
    if (wd) wd.onclick = () => { window.__sendPrimary({ type: 'village_withdraw', vid, res: 'food' }); };
  }

  function renderSide(name) {
    const body = document.getElementById('spBody');
    if (name === 'trade') renderTradePanel(body);
    else if (name === 'body') renderBodyPanel(body);
    else if (name === 'craft') renderCraftPanel2(body);
    else if (name === 'build') renderBuildPanel(body);
    else if (name === 'claims') renderClaimsPanel(body);
    else if (name === 'tribe') { body.innerHTML = '<div id="tribeBody"></div>'; renderTribePanel(); }
    else if (name === 'market') renderMarketPanel(body);
    else if (name === 'skills') renderSkillsPanel(body);
    else if (name === 'facility') renderFacilityPanel(body);
    else if (name === 'chronicle') renderChroniclePanel(body);   // [T18] 연대기 — 본체는 65-s-chronicle.js
  }

  // ★★[시설 제작창 · 재민 확정 2026-08-29 · §8.5] **제작창 = 시설의 창.**
  //   전 레시피 대목록을 만들지 않는다 — 지금 내 앞에 선 시설이 **자기 레시피만** 편다.
  //   정렬은 서버(정본)가 이미 해서 준다: 가능 → **하나 모자람** → 나머지.
  //   "하나 모자람"이 오늘의 할 일이고, 그게 시장에 갈 이유다.
  function renderFacilityPanel(el) {
    const F = myFacility;
    if (!F || !F.near) { el.innerHTML = '<div class="hint">시설 앞에 서면 그 시설의 제작창이 열린다 — 모닥불(요리·훈제) · 작업대(도구·절임) · 노(제련) · 건조대(말리기)</div>'; return; }
    if (!F.near.mine) { el.innerHTML = `<div class="hint">${F.near.ko}은(는) 내 것이 아니다 — 남의 시설 사용권은 아직 없다.</div>`; return; }
    const secs = Math.round((F.near.craftMs || 0) / 1000);
    let h = `<div class="hint" style="margin-bottom:8px"><b>${F.near.ko}</b> — 여기서 만들 수 있는 것만 보인다 · 한 개 ${secs}초</div>`;
    // ── 대기열 ──
    const q = (F.queue || []).find((x) => x.bid === F.near.bid);
    if (q && q.jobs.length) {
      h += '<div class="hint" style="font-weight:bold;margin:6px 0 4px">— 걸어 둔 것 —</div>';
      for (const j of q.jobs) {
        const left = Math.ceil(j.leftMs / 1000);
        h += `<div class="craft-recipe ${j.done ? 'can-make' : ''}">
          <div class="cr-icon">${j.done ? '' : ''}</div>
          <div class="cr-info"><div class="cr-name">${j.label}</div>
          <div class="cr-cost">${j.done ? '다 됐다 — 받아 가라' : `${left}초 남음`}</div></div>
          ${j.done ? '<button data-fcollect="1">받기</button>' : ''}</div>`;
      }
    }
    // ── 레시피 ──
    h += '<div class="hint" style="font-weight:bold;margin:10px 0 4px">— 만들 수 있는 것 —</div>';
    for (const r of (F.recipes || [])) {
      const pick = facilityPick[r.id] || (r.options && (r.options.find((o) => o.can) || r.options[0]) || {}).material;
      // ★★[T38 2026-09-01] 아이콘이 없는 품목의 **폴백이 영문 키였다.**
      //   `itemIconHtml(k, 18, itemKo(k))` 의 셋째 인자는 아이콘이 없을 때 대신 찍는 것인데 거기에 키를 넣어 뒀다
      //   ⇒ 자염처럼 아이콘이 아직 없는 품목이 화면에 `brine` 으로 떴다(실측: e2e-salt).
      //   이름표는 **서버가 준다**(`r.costKo` · `m.ko` — zone.js `_facilityRecipes`). 클라 표는 폴백일 뿐이다.
      const koOf = (k) => (r.costKo && r.costKo[k]) || itemKo(k);   // [T55] 서버 `costKo` 이름표 정본 사본 키
      let costStr, q2 = null;
      if (r.options) {
        const o = r.options.find((x) => x.material === pick) || r.options[0] || {};
        costStr = `${itemIconHtml(o.material, 18, koOf(o.material))} ${o.need} <span style="color:var(--dim-2)">(보유 ${o.have})</span>`
          // ★[T12 지게] 곁재료도 같이 적는다 — `r.can`·버튼은 이미 `r.cost`(곁재료 포함)로 갈리는데
          //   글자만 주재료를 보여 주면 "왜 못 만들지"가 화면에 안 적힌다.
          //   이름표는 T38 규약대로 **서버가 준 `costKo`** 를 통해 찾는다(클라 표는 폴백이다).
          + Object.entries(r.extra || {}).map(([k, n]) => ` · ${itemIconHtml(k, 18, koOf(k))} ${n}`).join('');
        q2 = o.q;
      } else {
        costStr = Object.entries(r.cost).map(([k, n]) => `${itemIconHtml(k, 18, koOf(k))} ${n}`).join(' · ');
      }
      // 모자란 재료 칸은 이름표를 **아예 안 찾고 있었다**(`m.item` 을 그대로 찍었다).
      const lack = r.missing.length ? `<span style="color:var(--hp)">— ${r.missing.map((m) => `${m.ko || m.item} ${m.have}/${m.need}`).join(' · ')}</span>` : '';
      h += `<div class="craft-recipe ${r.can ? 'can-make' : ''}">
        <div class="cr-icon">${r.preserve ? '' : r.kind === 'cook' ? '' : ''}</div>
        <div class="cr-info">
          <div class="cr-name">${r.label}${q2 != null ? ` <span style="color:var(--dim-2);font-weight:normal">· 예상 품질 ${Math.round(q2 * 100)}%${r.lvl != null ? ` (${r.skill} Lv${r.lvl})` : ''}</span>` : ''}${
            /* ★[보존 배치 2026-08-31] 재료 선택이 판단이 되게 — 지금 재료의 신선도와 수율·보관일을 미리 보여 준다.
               도구의 "예상 품질 %"와 같은 자리다(새 컴포넌트 없음). 수치는 전부 서버 정본이 계산해 보낸 것. */
            r.preserve ? ` <span style="color:var(--dim-2);font-weight:normal">· ${r.outKo} · ${r.days}일`
              + (r.stageKo ? ` · 재료 ${r.stageKo}` : '')
              + (r.yieldPct != null ? ` 수율 ${r.yieldPct}%` : '')
              // ★[T38 2026-09-01] 보존 행이 `보관 ${shelfDays}일` 을 **무조건** 찍고 있었다.
              //   소금은 안 썩어서 서버가 '∞' 를 넣는데, 그러면 화면에 "보관 ∞일" 이 뜬다(회부 D-2).
              //   ⇒ 값에 따라 갈래를 나눈다. 서버는 그대로 두고 **표기만** 고친다.
              + (r.shelfDays == null ? ''
                 : r.shelfDays === '∞' ? ' · 안 상함'
                 : ` · 보관 ${r.shelfDays}일`) + '</span>' : ''}</div>
          <div class="cr-cost">${costStr} ${lack}</div>
          ${r.options ? `<div class="cr-cost" style="margin-top:3px">${r.options.map((o) => `<button data-fpick="${r.id}" data-fmat="${o.material}" style="margin:1px 2px 1px 0;${o.material === pick ? 'outline:1px solid var(--stam)' : ''}" ${o.can ? '' : 'disabled'}>${koOf(o.material)} ${o.q != null ? Math.round(o.q * 100) + '%' : ''}</button>`).join('')}</div>` : ''}
        </div>
        <button data-fmake="${r.id}" ${r.can ? '' : 'disabled'}>만들기</button>
      </div>`;
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-fpick]').forEach((b) => b.onclick = () => { facilityPick[b.dataset.fpick] = b.dataset.fmat; renderSide('facility'); });
    el.querySelectorAll('[data-fcollect]').forEach((b) => b.onclick = () => sendPrimary({ type: 'craft_collect', buildingId: F.near.bid }));
    el.querySelectorAll('[data-fmake]').forEach((b) => b.onclick = () => {
      const id = b.dataset.fmake;
      const r = (F.recipes || []).find((x) => x.id === id);
      if (!r) return;
      if (r.options) sendPrimary({ type: 'craft_equipment', itemType: id, material: facilityPick[id] || (r.options.find((o) => o.can) || {}).material });
      // ★[보존 배치 2026-08-31] 한 번에 한 단위 — 요리와 같은 규약이다(수량 선택은 다음 층 · 회부 F).
      else if (r.preserve) sendPrimary({ type: 'preserve', recipe: id, amount: 1 });
      else sendPrimary({ type: 'cook', recipe: id });
      setTimeout(() => sendPrimary({ type: 'facility_ask' }), 400);
    });
  }
