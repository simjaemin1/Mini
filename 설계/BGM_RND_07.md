# BGM R&D-07 — 대금의 실제 연속 악구와 AI 합성의 경계

## 이번 판정

대금의 `77 → 74 → 72` 세 음을 각각 잘라 붙이는 방법은 사용하지 않는다. 첫 음의
호흡·혀 어택, 반복음의 재발음, 실제 연음의 운지 변화는 서로 다른 사건이므로,
음의 timestamp가 맞닿았다는 사실만으로 crossfade를 만들 수도 없다.

R&D-07은 두 가지를 분리한다.

1. **실제 연주를 그대로 쓸 수 있는가** — 한 원본 WAVE의 연속 F0/세기/voicing
   feature span 전체가 목표 선율의 상대 음정·길이에 충분히 맞는지 찾는다.
2. **실제 연주가 목표와 다르면 어떻게 할 것인가** — 원본을 음 단위로 조립하지 않고,
   source-led 편곡 또는 별도 score→performance→audio 합성 단계를 쓴다.

`tools/daegeum-transitions/trajectory_retrieval.py`는 이전 endpoint-chain 검색을
대체한다. 독립적인 `77→74`, `74→72` 후보를 이어 붙이지 않으며, 한 source NPZ에서
연속이고 voiced인 feature row만 sliding window로 비교한다. 하나의 least-squares
global pitch offset은 **비교값**일 뿐 source audio에 적용되지 않는다.

## 실제 검색 결과와 보수적 결론

국립국악원 확장 대금산조 192개 source를, 2.16초(`.72 + .72 + .72`)의
`77→74→72` score-side proxy로 전수 검색했다. 15,392개의 direct, contiguous, voiced
window가 있었지만, source-faithful score phrase로 승격할 만한 결과는 없었다.

84 BPM 3/4의 #001–065 선행 묶음의 최상위 raw span은 `extend-001550.wav`의 한 연속
window였다. 그러나 proxy 값은 curve RMS 약 **220.72 cents**, interval RMS 약
**67.89 cents**, 최대 인접 pitch step 약 **123.48 cents**였다. 전수 묶음에도 세 값을
함께 더 좋게 만드는 strict dominator는 없었다.

따라서 이 span은 raw-frame/provenance 파이프라인의 검증용 **unreviewed triage**일 뿐이다.
다음 중 어느 것으로도 부르면 안 된다.

- 자연스러운 legato 또는 same-breath 증거
- approved transition / transition bank row
- 학습 재료 또는 게임 asset
- 아리랑 score를 충실히 연주한 source-faithful phrase

`phrase_span_audition.py`가 내는 A는 선택된 native frame payload를 byte-for-byte
복사한 R&D raw preview다. 선택적 P는 Rubber Band으로 만든 synthetic preview이며,
source-faithful A와 같은 것으로 취급하지 않는다.

## 현재 렌더 정책

`render_articulation.py`는 score 표기의 명시 slur만 recorded steady body와 70 ms
crossfade로 보낸다. 붙어 있는 무표기 음은 rearticulate이고, phrase 시작은 breath이다.
특히 browser Ari controlled slice에서는 `77→77`을 재발음으로 두고, 지정된
`77→74→72`만 explicit slur sequence로 남긴다. 이 정책은 원본 실제 phrase가 확보될
때에만 source-led render가 그 edge를 교체하도록 설계되었다.

이는 기본 `bgm.js`, 기본 `.ogg`/`.m4a`, 공개 asset manifest를 아직 변경하지 않는
offline R&D 정책이다.

## 다음 구현 순서

### 1. Source-led 편곡 (즉시 가능한 경로)

목표 음을 원본에 강제로 맞추지 않는다. 실제 한 악구의 F0/강세/호흡을 보존하고, 그
악구의 실제 음정 중심과 장단에 맞춰 가야금·장단 반주를 써서 BGM stem으로 만든다.
아리랑은 모티프·리듬·응답구에 참고할 수 있지만, source가 하지 않은 운지나 혀 어택을
원본 audio에 발명하지 않는다.

이 단계에서 필요한 것은 자동 phrase-boundary triage와 stem-level render이지, 음 단위
join이나 모든 음의 pitch correction이 아니다.

### 2. Score-to-performance model (데이터/권리 gate 뒤)

작곡 결과를 바로 audio model에 던지지 않는다. 먼저 아래의 **연속 제어 궤적**을
생성하는 모델을 둔다.

```text
score + instrument + explicit articulation context
  → F0 / loudness / spectral-noise / vibrato / onset-body controls
  → neural source-filter or DDSP-style audio renderer
```

관악기에서는 `breath_start`, `rearticulate`, `slur`, `detached`를 별도 조건으로
유지한다. 비브라토는 음마다 독립 LFO를 붙이는 것이 아니라, 앞뒤 음·장단·강세를
포함한 phrase control로 학습한다. 이 표현 층이 검증되기 전에는 DDSP가 지속음 sample
join의 문제를 마술처럼 해결한다고 주장하지 않는다.

### 3. Multi-instrument 확장

지속음 악기(대금·단소·피리·해금)는 위의 phrase/표현/합성 세 층을 공유할 수 있다.
뜯는 악기(가야금·거문고)와 타악은 실제 attack sample 또는 원본 phrase/stem 보존이
우선이다. 악기별 source inventory, native-frame provenance, 사용권 gate를 공유하지만,
한 모델의 실패를 모든 악기에 전파하지 않는다.

## 승격 gate

R&D preview가 기본 BGM stem으로 승격되려면 최소한 다음이 별도 artifact로 확인돼야
한다.

1. source/권리/provenance가 해당 이용 범위에 맞음
2. source phrase 또는 생성 궤적이 score와 실제로 맞음
3. 새 attack·재발음·slur edge가 score articulation map에 명시됨
4. loop/stem 교체 시 level·silent-hole·click·runtime fallback 검증 통과

이 gate는 사용자에게 청취·라벨 작업을 떠넘기기 위한 것이 아니다. 자동 검증과 R&D
render가 먼저 후보를 좁히고, 증거가 부족한 후보는 기본 asset으로 조용히 섞지 않기
위한 안전장치다.
