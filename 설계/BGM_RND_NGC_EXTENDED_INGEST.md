# NGC 확장 대금산조 phrase ingest — source-faithful R&D 계약

## 왜 별도 ingest가 필요한가

R&D-06의 local direct WAVE는 실제 전이를 찾기 위한 작은 출발점일 뿐이다. 국립국악원
디지털 음원의 **확장 다운로드**에는 대금의 긴 phrase source가 따로 있으므로, 그것을
후보 corpus로 추가할 수 있다. 단, download filename이나 catalog title은 연주법 판정이
아니다. 이 ingest는 source를 안전하게 가져오고 provenance를 남기는 단계이며, legato
bank/ML/game asset을 만드는 단계가 아니다.

## 정확한 scope: `악구`와 `확장`은 다른 catalog다

2026-09-24에 같은 공식 사이트에서 다음 두 endpoint product를 read-only로 확인했다.

| Catalog surface | Exact filter | 당시 결과 | 이 도구의 대상 |
|---|---|---:|---|
| 악구 다운로드 (`/front/phrase/…`) | `PHINST0008` / `대금` + `GENR0001` / 산조 | 61 `phraseCd` rows | 아니오 |
| 확장 다운로드 (`/front/extend/…`) | `EXTEND0001` / `대금` + `INDV0001` + exact `division: 대금산조` | 375 대금 rows 중 192 `extendSeq` rows | 예 |

따라서 `대금`이라는 broad title match나 악구 product의 `phraseCd`를 확장 source로
혼동하지 않는다. 현재 tool에는 `--all`이 없고, caller가 exact `--extend-seq` 하나 이상을
명시해야 한다.

## 실행

도구는 [`fetch_ngc_extended_daegeum.py`](../tools/daegeum-transitions/fetch_ngc_extended_daegeum.py)에
있다. 기본은 **plan-only**라서 catalog/detail metadata만 가져오고 audio는 받지 않는다.

```sh
# 1. 한 source를 정확히 선택하고 manifest만 작성한다. audio download 없음.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan \
  --extend-seq 1520

# 2. plan을 읽어본 뒤, 그 한 source만 실제로 fetch한다.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan \
  --extend-seq 1520 \
  --download

# 3. 네트워크를 쓰지 않고 SHA/native-WAV provenance를 재검증한다.
python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
  --output-dir _bgm_rnd/ngc-extended-daegeum-plan \
  --verify-only
```

두 개 이상을 실제 download하려면, exact sequence를 반복해 적는 것 외에
`--allow-batch`를 별도로 줘야 한다. 최대 30개로 제한하며 official UI의 표기 제한과
같다. 기존 entry는 hash/native WAV 검사에 통과하면 re-download하지 않는다. hash가
다르거나 manifest 없는 파일이 있으면 덮어쓰지 않고 중단한다.

## 네트워크 및 purpose 계약

- canonical HTTPS origin은 `https://www.gugak.go.kr` 하나다. session-bearing URL,
  redirect outside that origin, cookie file, account/API key, hidden header는 manifest나
  local disk에 남기지 않는다.
- 한 invocation은 official catalog page → instrument list → Daegeum file list → exact
  `extendSeq` detail → 한 item `download.do` 순서로만 통신한다.
- 기본 submit field는 `usePurposeGb=비상업용`, `usePurpose=연구용`, 빈 detail, 빈
  `companyName`이다. 이는 local R&D의 실제 목적이다. organization은 caller가 명시한
  truthful 값만 보낼 수 있지만, non-empty 값은 provenance에 기록하지 않는다.
- 공식 UI는 organization field를 요구한다. 2026-09-24의 one-item endpoint probe에서
  빈 `companyName`도 server가 WAV를 반환하는 것을 확인했지만, 이것은 UI requirement나
  future service terms를 우회하라는 뜻이 아니다. server가 달라지거나 명시적 identity가
  필요해지면 tool은 fabricated value를 만들지 않고 실패해야 한다.

## 저장되는 provenance

`--output-dir` 아래의 `ngc-extended-daegeum-sanjo.manifest.json`에는 source root나
사용자 경로 없이 다음을 남긴다.

- exact `extend_seq`, instrument/division filter, full returned catalog record와
  independently checked detail record
- official endpoint URL, original server-side `wav_file_path`, original filename,
  returned `Content-Disposition` filename
- downloaded WAV의 SHA-256, byte length, safe response headers, native RIFF/WAV
  descriptor, portable relative output path
- catalog page에서 관찰한 `공공누리 제1유형(출처표시)` notice와 page hash
- submitted non-commercial/research purpose, organization value를 저장하지 않았다는
  audit record

catalog page의 KOGL notice는 source attribution evidence이며, 이 manifest가 곧 model
training·redistribution·출시 clearance라는 뜻은 아니다. 그런 결정은 source term과
project policy를 별도로 확인해야 한다.

## probe 결과

도구로 `extendSeq=1520` 하나를 2026-09-24에 R&D-only로 받아 endpoint semantics를
확인했다. returned filename은 `Daegeum_SJ_001_(3_4th_bpm84).wav`, native format은
48 kHz / stereo / PCM 24-bit / 685,714 native frames(약 14.286초), SHA-256은
`e3c0b0920f292adc96ff0fb81629de68dff373f146b2e89d4d07d62b2399f2e7`였다. 바로 이어서
`--verify-only`도 통과했다.

이 사실은 **한 source가 안전하게 내려받아졌다는 증거만** 제공한다. 자연 slur 여부,
77→74 등 score target coverage, transition bank 허가 여부는 R&D-06의 human review
label gate를 거쳐야 한다.

## 검증

```sh
python3 tools/daegeum-transitions/test_fetch_ngc_extended_daegeum.py
```

offline fixture test는 exact division filter, plan-only, single download provenance,
resume, batch opt-in, SHA tamper, returned filename mismatch, HTML payload rejection을
검사한다. game runtime, default BGM, asset manifest는 이 도구가 읽거나 쓰지 않는다.
