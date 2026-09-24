# BGM R&D-06 — 대금 실제 전이 bank의 판정 계약

## 목적과 이번 단계의 경계

R&D-05는 서로 다른 단음 녹음을 score 표현 곡선으로 안전하게 만나는 audition이었다.
그것이 `77 → 74 → 72`가 한 호흡으로 운지된 실제 녹음이라는 뜻은 아니다.

R&D-06은 그 빈칸을 추측으로 메우지 않는다. direct 대금 WAVE에서 **전이 후보를
찾고, 사람이 실제 연속 연주인지 판정할 수 있는 read-only catalog/label bank**를
만든다. 아직 renderer, ML 학습, 게임 asset 생성, `bgm.js` 교체는 하지 않는다.

| 이번 단계가 하는 일 | 이번 단계가 하지 않는 일 |
|---|---|
| 원본 WAVE의 hash·native frame·후보 경계를 기록 | 원본을 재인코딩·복사·수정 |
| 자동 후보와 사람 승인 label을 분리 | detector score를 자연 legato 판정으로 승격 |
| 승인된 연속 pitch-change만 미래 retrieval 후보로 허가 | 없는 음쌍을 crossfade/AI로 실제 녹음처럼 주장 |
| offline R&D metadata를 검증 | 게임 기본 BGM·runtime·asset manifest 변경 |

계약의 record definitions는
[`tools/daegeum-transitions/transition-bank.schema.json`](../tools/daegeum-transitions/transition-bank.schema.json)에
있다. 이 파일은 한 덩어리 manifest가 아니라 아래 **분리 artifact**의 JSON/JSONL
record schema 모음이다.

## 실행과 출력 묶음

input root는 개발자의 개인 Downloads 경로가 아니라 실행 시 명시적으로 준 대금 direct
WAVE directory다.

```sh
/path/to/rd-python tools/daegeum-transitions/build.py \
  --raw-daegeum-dir "$GUGAK_SANJO_ROOT/monotone-6" \
  --raw-daegeum-dir "$GUGAK_JEONGAK_ROOT/jd_new" \
  --output-dir _bgm_rnd/daegeum-transition-bank-YYYYMMDD
```

`--raw-daegeum-dir`는 한 번 이상 줄 수 있다. 별도 국악원 direct recording set을 함께
후보화할 때에도 source를 복사·symlink하지 않고 각 root를 명시한다. `--output-dir`는
반드시 새 directory여야 한다. builder는 source를 쓰지 않고 staged output을 통째로
검증한 뒤에만 그 directory를 만든다.

| 출력 | 역할 | 승인 상태 |
|---|---|---|
| `source_catalog.json` | direct WAVE의 SHA-256·native metadata·source role·rights gate | 원본 provenance |
| `candidates.jsonl` | F0/onset scan이 제안한 frame 범위 | 항상 `unreviewed` |
| `labels.template.jsonl` | 사람이 채울 label 초안 | 항상 `unreviewed` |
| `transition_bank.jsonl` | 실제 연속 pitch-change로 승인된 retrieval 행 | 승인 행만 |
| `expression_manifest.jsonl` | 승인된 표현 학습/분석 재료; candidate·review·anchor lineage 보존 | 명시적으로 허가된 행만 |
| `coverage.json` | 게임에 필요한 음쌍의 실제 coverage 상태 | 후보만으로 coverage를 닫지 않음 |
| `provenance.json` | input/output policy·rights·detector config·dependency/hash 집계 | source root 미기록 |

review용 WAV/SVG/HTML도 local output에 만들 수 있지만, 모두 source의 연속 raw crop과
frame evidence를 보여 주기 위한 것이며 게임 asset이 아니다.

## Source authority와 native frame

`source_catalog.json`의 각 source는 아래 identity를 갖는다.

- `source_id`, `sha256`, root에 대한 안전한 `relative_path`
- `source_role` — recording 전체의 보수적 설명일 뿐, 개별 후보의 연주법 판정이 아님
- `rights`: `unverified_local_rnd_only` / `license_assertion: none` / source term 확인 전
  학습·배포 금지라는 명시적 gate. 이것은 local R&D를 멈춘다는 뜻이 아니라, 나중에
  원본 download를 무조건 학습·출시 허가로 오인하지 않게 하는 provenance다.
- `native.sample_rate_hz`, `native.channels`, `native.frame_count`, encoding/container 및
  native reader descriptor

모든 authoritative boundary는 source WAVE의 decoded PCM frame인 `[start, end)`다.
`end`는 exclusive다.

```text
seconds_for_display = native_frame / sample_rate_hz
```

초 표시는 review UI의 편의값일 수 있지만 label authority가 아니다. resample 뒤 frame,
FLAC 변환본 timestamp, silence-trim 뒤 offset을 원본 frame으로 오인하면 안 된다.
candidate의 `context_start`/`boundary_center`/`proposed_boundary_window`/`context_end`, label의
`clip`/`pre_stable`/`transition`/`post_stable`은 모두 그 source의
`0 <= frame < frame_count` 범위에서 검사한다.

## 후보와 승인 label은 다른 데이터다

자동 F0/onset scan은 **후보**만 만든다. `candidates.jsonl` row는 source reference,
native-frame region, F0-change 또는 same-pitch-onset detector class와 proxy evidence,
`status: "unreviewed"`, 그리고
`automatic_detection_is_not_a_musical_gesture_label: true`만 갖는다. candidate에는
`approved` state나 renderer 권한이 없다. detector confidence가 높아도 자연 운지 증거가
아니다.

사람의 판단은 별도 label JSONL row에만 쓴다. label에는 candidate/source identity,
ordered native frame ranges, `gesture`, pitch anchor, review state와 reviewer가 들어간다.
승인된 label은 최소한 다음을 만족해야 한다.

- `review.state: "approved"` 및 비어 있지 않은 `review.reviewer`
- `clip[0] == pre_stable[0] < pre_stable[1] == transition[0] < transition[1] ==
  post_stable[0] < post_stable[1] == clip[1]`인 하나의 native source partition
- `transition`이 candidate의 `boundary_center`를 포함
- `gesture.class`가 아래 canonical vocabulary의 구체적 사람 판정
- source ID·SHA-256·relative path가 이번 run의 candidate/catalog와 정확히 일치

| human gesture class | 뜻 | `transition_bank.jsonl` retrieval 허가 |
|---|---|---|
| `continuous_pitch_change` | 사람이 실제 연속적인 음높이 변화를 확인 | approved + pre/post MIDI anchor가 있을 때만 가능 |
| `tongued_rearticulation` | 혀/재발음 evidence | 불가; 표현 evidence로만 별도 허가 가능 |
| `breath_separated` | 새 숨 / phrase 분리 | 불가; 표현 evidence로만 별도 허가 가능 |
| `same_pitch_continuation`, `ornament_or_sigimsae` | 연속 body 또는 장식/시김새 evidence | 불가; 표현 evidence로만 별도 허가 가능 |
| `not_a_transition` | 전이가 아니라는 유효한 review 결과 | 불가; expression evidence도 불가 |

즉 `transition_bank.jsonl`의 모든 row는 approved human label에서 나온 실제
`continuous_pitch_change`여야 한다. tongue/breath/same-pitch 자료가 훌륭한 학습
evidence일 수는 있어도 **native legato transition**이라고 불리거나 retrieval bank로
들어갈 수 없다. V5의 score-level crossfade도 이 bank 밖의 fallback provenance를
가져야 한다.

`coverage.json`도 capability를 분리한다. `77→77`의 재발음은
`expression_articulation` evidence가 채울 수 있지만, `77→74→72` 같은 음높이 변화는
오직 `transition_retrieval`의 `continuous_pitch_change`만 채울 수 있다.

`provenance.json`에는 builder/native-reader SHA-256, Python·NumPy·SciPy version,
candidate detector config, supplied label JSONL의 SHA-256/row count를 남긴다. 따라서
나중에 같은 raw source를 다시 분석했을 때, 어떤 detector 설정과 label input이 결과를
만들었는지 확인할 수 있다. 이 기록도 source root를 포함하지 않는다.

## Path leak과 source scope

artifact의 모든 source location은 `relative_path` 하나뿐이다. leading `/`, `..`, `~`,
Windows drive/backslash, source root, home/Downloads/user name, environment-variable
expansion은 JSON/JSONL에 기록하지 않는다. 내부 `/`는 explicit root 아래의 하위
directory 표기에만 쓴다.

source를 찾는 하나 이상의 local root는 CLI argument로만 전달된다. 따라서 다른 machine에
source를 복제해도 SHA-256·native metadata가 맞는지 확인한 후 explicit root 아래에서만
resolve할 수 있다. 이는 private path 유출뿐 아니라 과거 FLAC/복원본의 시간 좌표를 direct
WAVE에 우연히 적용하는 실수도 막는다.

## Runtime 보호

R&D-06은 다음 default runtime surface를 변경하지 않는다.

- `public/assets/audio/bgm/bgm.js`, `bgm-loops.js`
- `render-meta.json`
- 기본 13곡의 `.ogg` / `.m4a` 파일

transition bank implementation은 raw source를 `public/assets/audio/bgm/`에 넣거나 기본
BGM manifest를 고치면 안 된다. 사람이 approved transition을 듣고, loop/stem render와
ABX gate가 별도로 통과한 뒤에만 후속 카드에서 asset 승격을 논의한다.

## Target-priority audition은 bank 밖의 검토 보조물이다

candidate가 200개를 넘으면 `77→74`에 무관한 F0 change부터 임의 순서로 듣는 것은
비효율적이다. `tools/daegeum-transitions/target_audition.py`는 bundle의 score target별로
unreviewed candidate의 proxy endpoint `p₁→p₂`를 읽어 다음 한 개의 global shift만
계산한다.

```text
g = ((target₁ - p₁) + (target₂ - p₂)) / 2
interval_error = (p₂ - p₁) - (target₂ - target₁)
```

`g`는 두 endpoint에 함께 적용되는 least-squares measurement일 뿐, candidate의 앞·뒤를
각각 pitch-correct한 결과가 아니다. sorting은 target-compatible detector → bounded
optional P gate → absolute interval error → boundary RMS 변화·onset flux proxy → absolute
`g` → automatic voicing proxy다. RMS/onset은 볼륨이 툭 끊기는 후보를 뒤로 미루기 위한
측정값일 뿐, “score target에 가까운 review 우선순위”가 자연스러움·slur·same-breath·승인을
자동 확정한다는 뜻은 아니다.

각 shortlist의 A/B는 direct WAV sample-frame을 byte-for-byte 복사한 raw crop이다.
header를 최소 RIFF wrapper로 다시 쓸 수는 있지만 gain/pitch/time/resample/channel/fade는
없다. 선택적 P(`--render-gesture-warps`)만 Rubber Band R3 formant/pitchmap으로 global
shift와 transition window 내 작은 endpoint interpolation을 적용한다. P는 명시적으로
`not_source_faithful`, `not_native_legato`, `not_approved_transition`,
`not_transition_bank_item`, `not_game_asset`이며, 어떤 coverage나 transition bank도 닫지
않는다.

이 보조물도 `_bgm_rnd/`의 fresh directory에만 생성하고 `public/assets/audio/bgm/`, runtime
manifest, 기본 13곡 asset은 읽거나 쓰지 않는다.

## 검증 방법

```sh
# Raw source나 NumPy/SciPy 없이 schema·static policy·runtime guard 검사
python3 scripts/test-daegeum-transition-bank.py

# builder가 만든 실제 묶음의 JSON/JSONL lineage·frame·approval 검사
python3 scripts/test-daegeum-transition-bank.py \
  --bundle _bgm_rnd/daegeum-transition-bank-YYYYMMDD

# target-priority math 및 source-faithful A/B sample copy 검사
python3 tools/daegeum-transitions/test_target_audition.py
```

integration test는 catalog, candidates, generated label template, approved transition
bank, expression manifest, coverage, provenance의 관계를 함께 검사한다. 특히
unreviewed candidate가 bank/coverage를 닫는지, frame이 native source 밖으로 나가는지,
source hash/path가 바뀌는지, continuous pitch-change 외 자료가 retrieval에 섞이는지를
실패로 만든다.
