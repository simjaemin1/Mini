#!/usr/bin/env bash
# === scripts/split-verify.sh — 분할 결합 검사 =================================
#
# 조각(public/client/*.js)을 **등록 순서**로 이어 붙이고 마커를 걷어내면
# 분할 전 정본과 **바이트 단위로 같아야** 한다. 그게 "행동 변경 0"의 증명이다.
#
# ★이 검사기는 자기가 실패할 줄 아는지 먼저 보였다(자명 통과 금지):
#   조각 하나에서 한 글자를 바꾸면 `differ` 를 낸다 — 그 확인 없이는 검사기가 아니다.
#
# 쓰는 법:
#   bash scripts/split-verify.sh                 # 정본 = 분할 전 커밋의 client.js
#   BASE=<git-rev> bash scripts/split-verify.sh  # 정본 커밋 지정
#   bash scripts/split-verify.sh --selftest      # ★검사기 자신을 검사(한 글자 오염)
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE:-95c873c}"            # 커밋 ⑴ — 껍데기 제거본(분할 전 정본)

rebuild() {                        # 조각 → 재결합본을 stdout 으로
  node -e '
    const fs=require("fs"),path=require("path");
    const html=fs.readFileSync("public/index.html","utf8");
    // ★순서는 index.html 등록 순 그대로 읽는다 — 하네스가 순서를 따로 적으면 두 정본이 된다
    const order=[...html.matchAll(/<script[^>]*\ssrc="(client\/[^"?]+)/g)].map(m=>m[1]);
    if(!order.length){ console.error("index.html 에 client/ 조각 등록이 없다"); process.exit(2); }
    // ★조각은 전부 끝 개행으로 끝난다 ⇒ split 결과 마지막에 인공 빈칸("")이 하나 붙는다.
    //   그걸 안 떼면 조각 수만큼 빈 줄이 결합본에 섞인다(첫 판이 정확히 그래서 differ 였다).
    const read=(f)=>{ const a=fs.readFileSync(path.join("public",f),"utf8").split("\n");
                      if(a.length&&a[a.length-1]==="") a.pop(); return a; };
    // 99-main 의 @@moved 블록을 id → 원문으로
    const main=read(order.find(f=>/99-main/.test(f))||"client/99-main.js");
    const blocks=new Map();
    for(let i=0;i<main.length;i++){
      const m=main[i].match(/^\/\/ @@moved-begin:(\d+)$/); if(!m) continue;
      const j=main.findIndex((l,k)=>k>i && l===`// @@moved-end:${m[1]}`);
      blocks.set(m[1], main.slice(i+1,j)); i=j;
    }
    const out=[];
    for(const f of order){
      if(/99-main/.test(f)) continue;               // 99-main 은 마커 자리로 되돌아간다
      const lines=read(f);
      for(const l of lines){
        if(/^\/\/ @@split:/.test(l)) continue;      // 조각 머리 마커
        const mv=l.match(/^\/\/ @@moved:(\d+)$/);
        if(mv){ const b=blocks.get(mv[1]); if(!b){ console.error("복원 실패: @@moved:"+mv[1]); process.exit(2);} out.push(...b); continue; }
        out.push(l);
      }
    }
    process.stdout.write(out.join("\n")+"\n");
  '
}

if [ "${1:-}" = "--selftest" ]; then
  echo "=== 검사기 자가 검사 — 한 글자 오염이 differ 를 내는가 ==="
  V="public/client/32-m-render.js"
  cp "$V" /tmp/_sv_backup.js
  # 코드 한 글자만 바꾼다(주석 아님 — 주석은 결합본에 그대로 실려 어차피 differ 지만, 코드가 정직하다)
  perl -0pi -e 's/const /donst /' "$V"
  if rebuild | cmp -s - <(git show "$BASE:public/client.js"); then
    cp /tmp/_sv_backup.js "$V"; echo "  ✗ ★검사기가 오염을 못 잡는다 — 이 검사기를 믿지 마라"; exit 1
  fi
  cp /tmp/_sv_backup.js "$V"
  echo "  ✓ 오염된 조각에서 differ — 검사기가 실패할 줄 안다"
  echo "  (원복 확인)"
fi

if rebuild | cmp -s - <(git show "$BASE:public/client.js"); then
  echo "identical — 조각을 이어 붙이면 $BASE 의 client.js 와 바이트 동일"
  exit 0
fi
echo "differ — 아래는 첫 차이"
diff <(rebuild) <(git show "$BASE:public/client.js") | head -20
exit 1
