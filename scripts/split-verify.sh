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
# ★정본 커밋을 **해시로 박지 않는다.** 리베이스하면 해시가 바뀌고, 새 클론엔 옛 객체가 없어
#   검사기가 조용히 죽는다(실제로 리베이스 직후 그럴 뻔했다 — 로컬에 dangling 으로 남아 통과했다).
#   ⇒ `public/client.js` 를 **지운 커밋**(=분할 커밋 ⑵)을 찾아 그 부모가 분할 전 정본이다.
BASE="${BASE:-}"
if [ -z "$BASE" ]; then
  DEL="$(git log --diff-filter=D -1 --format=%H -- public/client.js 2>/dev/null)"
  [ -n "$DEL" ] && BASE="${DEL}^"
fi
if [ -z "$BASE" ] || ! git rev-parse -q --verify "${BASE}:public/client.js" >/dev/null 2>&1; then
  echo "분할 전 정본을 못 찾았다. BASE=<커밋> 으로 지정해라." >&2; exit 2
fi
# ★★[T49 2026-09-02 · PM 승인] **이 검사기는 분할 커밋 전용이다 — 스스로 그렇게 말하게 한다.**
#   계약이 "조각을 이어 붙이면 **분할 전** 정본과 바이트 동일" 이라, 클라를 한 글자라도 고치면
#   그 계약은 **영원히** 깨진다(T18 이 첫 배치, T38 이 두 번째였다).
#   종전엔 그때도 `exit 1` 이라 다음 사람이 **회귀로 오독**할 자리였다.
#   ⇒ 분할 커밋 이후 조각이 바뀌었으면 그 사실을 말하고 **중립 종료(0)** 한다.
#     조각이 안 바뀌었는데 differ 면 그건 진짜 회귀다 — 그때만 빨갛게 죽는다.
SPLIT="${DEL:-}"                       # 분할 커밋 ⑵ = client.js 를 지운 커밋
CHANGED=""
if [ -n "$SPLIT" ]; then
  CHANGED="$(git diff --name-only "$SPLIT" -- public/client/ 2>/dev/null)"
fi

rebuild() {                        # 조각 → 재결합본을 stdout 으로
  node -e '
    // ★`cmp -s` 는 첫 차이에서 바로 끝난다 ⇒ 이쪽 stdout 이 EPIPE 로 죽으며 스택을 토한다.
    //   결과에는 영향이 없지만 화면이 에러로 보인다 — 조용히 끝낸다(T49).
    process.stdout.on("error", () => {});
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
      // ★★[T18 2026-09-01] **분할 이후 새로 만든 조각은 결합 대상이 아니다.**
      //   공통 규약이 "새 기능 = 새 파일 + 등록 1줄" 인데 이 검사기는 등록된 것을 **전부** 이어
      //   붙여 분할 전 정본과 바이트 비교한다 ⇒ **첫 새 파일이 생기는 순간 영원히 differ** 가 된다
      //   (T18 이 그 첫 파일이었다). 검사기의 뜻은 "분할이 여전히 충실한가" 이므로,
      //   새 조각은 머리에 이 표를 달고 빠진다. 그러면 검사기는 계속 자기 일을 한다.
      if (lines[0] && /^\/\/ @@split-added\b/.test(lines[0])) continue;
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
if [ -n "$CHANGED" ]; then
  echo "분할 커밋 이후 조각이 바뀌었다 — **이 검사는 분할 커밋 전용이라 differ 가 정상이다.**"
  echo "  바뀐 조각: $(echo "$CHANGED" | sed 's|public/client/||' | tr '\n' ' ')"
  echo "  ⇒ 여기서 볼 것은 '같은가'가 아니라 **'의도한 줄만 바뀌었는가'** 다:  git diff $SPLIT -- public/client/"
  echo "  (분할이 여전히 충실한지 보려면 분할 커밋을 체크아웃해 이 검사기를 그 자리에서 돌려라.)"
  echo
  echo "참고 — 결합본과 분할 전 정본의 차이 줄 수: $(diff <(rebuild) <(git show "$BASE:public/client.js") | grep -cE '^[<>]')"
  exit 0
fi
echo "differ — 아래는 첫 차이"
echo "  ★조각은 분할 커밋 이후 **한 글자도 안 바뀌었다.** 그런데 결합본이 다르다 —"
echo "    이건 정상이 아니다(검사기·index.html 등록 순서·마커 복원 중 하나가 깨졌다)." 
# ★★[T18 2026-09-01 관측] **이 검사기는 일회성 증명이지 상시 게이트가 아니다.**
#   공통 규약(§8.2)은 새 패널을 붙일 때 `50-i-panel.js`(제목표·renderSide 분기)를 **반드시** 건드리게
#   돼 있다. 그러면 결합본이 분할 전 정본과 달라지고 여기서 differ 가 난다 — **정상이다.**
#   즉 이 검사기가 초록인 구간은 "분할 직후, 아무도 조각을 고치지 않은 동안"뿐이다.
#   ⇒ differ 를 보면 먼저 `git diff public/client/` 로 **의도한 줄만 바뀌었는지**를 봐라.
#     (분할 뒤 새로 만든 조각은 머리에 `// @@split-added` 를 달면 결합에서 빠진다.)
diff <(rebuild) <(git show "$BASE:public/client.js") | head -20
exit 1
