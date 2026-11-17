#!/usr/bin/env bash
# === scripts/t1361-birth-red.sh — 태어난 커밋 옛 코드 빨강 전수 [T1361 · S13 · 2026-11-17] =====================
# (@regress 없음 — 러너 밖 · 판 도구)
#
# ★무엇: 2026-11-01 뒤 처음 들어온 `scripts/test-*.js` 마다 **태어난 커밋 B** 를 찾아, 임시 워크트리를 B 로 꺼내고
#   (하네스 · lib · 픽스처는 B 것) 제품 코드(`server sim public lab`)만 `B^`(첫 부모) 것으로 되돌린 뒤 그 하네스를 돈다.
#   판정은 `scripts/pm-old-code-red.sh` 그대로 — RC≠0 + ✗ 줄 = 빨강 ○ · RC≠0 + ✗ 0 = 크래시 △ · RC=0 = 초록 ✗ · 시한 = 모름.
# ★이어 돌기: 줄은 `$OUT/rows.tsv` 에 하나씩 붙는다 — 이미 있는 하네스는 건너뛴다(재기동 뒤 그대로 다시 부르면 된다).
# ★자리: 워크트리 · TMPDIR 은 `$WORK`(기본 /dev/shm/t1361) — 하네스가 os.tmpdir() 에 남기는 DB 는 하네스마다 지운다(제 디렉터리만).
# ★표: `bash scripts/t1361-birth-red.sh --table` → `$OUT/표.md`(손으로 세지 않는다).
#
#   OUT=계측/T1361_2026-11-17 TIMEOUT_SEC=900 nohup bash scripts/t1361-birth-red.sh > log 2>&1 &
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:-계측/T1361_2026-11-17}"; mkdir -p "$OUT"
ROWS="$OUT/rows.tsv"; LIST="$OUT/list.tsv"
TIMEOUT_SEC="${TIMEOUT_SEC:-900}"
SINCE="${SINCE:-2026-11-01}"
PROD="server sim public lab"
WORK="${WORK:-/dev/shm/t1361}"

if [ "${1:-}" = "--table" ]; then
  awk -F'\t' -v since="$SINCE" -v list="$LIST" '
    BEGIN{ while((getline l < list)>0) n++ }
    { tot++; v=$1; c[v]++
      if (v=="초록") { g++; if ($6=="제품차0") z++; else if ($5=="제품부름") s++; else u++; gl[g]=$0 } }
    END{
      printf "# T1361 — %s 뒤 태어난 하네스 · 태어난 커밋 B 의 하네스 + B^ 제품\n\n", since
      printf "| 목록 | 돈 줄 | 빨강 ○ | 크래시 △ | 초록 ✗ | 모름 |\n|---:|---:|---:|---:|---:|---:|\n"
      printf "| %d | %d | %d | %d | %d | %d |\n\n", n, tot, c["빨강"], c["크래시"], c["초록"], c["모름"]
      printf "초록 %d = 제품 무관 %d · 제품 차 0 %d · ★자명 통과 의심(제품을 부름 · 제품 차 있음) %d\n\n", g+0, u+0, z+0, s+0
      printf "## 초록 목록\n\n| 하네스 | 태어난 커밋 | 카드 | 제품을 부르는가 | 제품 차 | ✓ | 초 |\n|---|---|---|---|---|---:|---:|\n"
      for(i=1;i<=g;i++){ split(gl[i],f,"\t"); printf "| %s | `%s` | %s | %s | %s | %s | %s |\n", f[2], f[3], f[4], f[5], f[6], f[8], f[10] }
    }' "$ROWS" > "$OUT/표.md"
  printf '\n## 전 줄\n\n| 판정 | 하네스 | B | 카드 | 제품 | 제품 차 | RC | ✓ | ✗ | 초 | 첫 실패 줄 |\n|---|---|---|---|---|---|---:|---:|---:|---:|---|\n' >> "$OUT/표.md"
  awk -F'\t' '{ w=$11; gsub(/\|/,"/",w); printf "| %s | %s | `%s` | %s | %s | %s | %s | %s | %s | %s | %s |\n",$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,w }' "$ROWS" >> "$OUT/표.md"
  awk -F'\t' '{s+=$10} END{printf "\n걸린 시간 합(하네스) %.2f 시간\n", s/3600}' "$ROWS" >> "$OUT/표.md"
  head -12 "$OUT/표.md"; exit 0
fi

# 목록 — 하네스마다 가장 이른 추가 커밋(태어난 커밋)
if [ ! -s "$LIST" ]; then
  git log --reverse --diff-filter=A --since="$SINCE" --format='C %H' --name-only -- 'scripts/test-*.js' |
    awk '/^C /{c=$2;next} /^scripts\//{ if(!seen[$1]++) print c "\t" $1 }' > "$LIST"
fi
touch "$ROWS"
mkdir -p "$WORK"
W="$WORK/w"
if [ ! -d "$W/.git" ] && [ ! -f "$W/.git" ]; then git worktree prune; git worktree add -q --detach "$W" HEAD || exit 2; fi

while IFS=$'\t' read -r B path; do
  t="$(basename "$path")"
  grep -q -P "^[^\t]*\t${t//./\\.}\t" "$ROWS" && continue
  Bs="$(git rev-parse --short=9 "$B")"
  card="$(git log -1 --format=%s "$B" | grep -oE 'T[0-9]{3,4}' | head -1)"; [ -z "$card" ] && card="—"
  git -C "$W" checkout -q -f --detach "$B" || { printf '모름\t%s\t%s\t%s\t-\t-\t-\t0\t0\t0\tcheckout 실패\n' "$t" "$Bs" "$card" >> "$ROWS"; continue; }
  git -C "$W" clean -fdxq -e node_modules
  # shellcheck disable=SC2086
  git -C "$W" restore --source="$B^" --worktree -- $PROD
  # shellcheck disable=SC2086
  if git diff --quiet "$B^" "$B" -- $PROD; then pd="제품차0"; else pd="제품차있음"; fi
  # 제품을 부르는가 — 카드 글자(`require('../server` · `spawn(…server/`)에 더해 제품 경로 글자(`'server/…'` · `'../sim/…'` · `path.join(…, 'lab', …)`)도 본다
  #   (T1361: 많은 하네스가 `fs.readFileSync(path.join(ROOT, 'server/…'))` · vm 으로 제품을 읽는다 — 카드 글자만 보면 그것을 "안 부름"으로 센다)
  if grep -qE "require\(['\"]\.\./(server|sim|public|lab)|spawn\(.*server/|['\"\`](\.\./)?(server|sim|public|lab)/|['\"](server|sim|public|lab)['\"]" "$W/$path"; then cp="제품부름"; else cp="제품안부름"; fi
  [ -d "$ROOT/node_modules" ] && [ ! -e "$W/node_modules" ] && ln -s "$ROOT/node_modules" "$W/node_modules"
  td="$WORK/tmp"; mkdir -p "$td"; log="$WORK/$t.log"
  s0=$(date +%s)
  ( cd "$W" && TMPDIR="$td" timeout "$TIMEOUT_SEC" node "$path" >"$log" 2>&1 ); rc=$?
  sec=$(( $(date +%s) - s0 ))
  rm -rf "$td"
  nf=$(grep -cE '^\s*(✗|❌|FAIL)' "$log"); np=$(grep -cE '^\s*(✓|✅|PASS)' "$log")
  why="$(grep -m1 -E '^\s*(✗|❌|FAIL)' "$log" | cut -c1-160 | tr '\t' ' ')"
  [ -z "$why" ] && why="$(grep -m1 -E 'Error|Cannot find|is not defined|not a function' "$log" | cut -c1-160 | tr '\t' ' ')"
  if [ "$rc" = 124 ]; then v="모름"; elif [ "$rc" = 0 ]; then v="초록"; elif [ "$nf" -gt 0 ]; then v="빨강"; else v="크래시"; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$v" "$t" "$Bs" "$card" "$cp" "$pd" "$rc" "$np" "$nf" "$sec" "$why" >> "$ROWS"
  echo "$(date -u +%H:%M) $(wc -l < "$ROWS")/$(wc -l < "$LIST") $v $t ${sec}s"
done < "$LIST"
git -C "$W" checkout -q -f --detach HEAD 2>/dev/null
echo "끝 $(date -u +%FT%TZ)"
