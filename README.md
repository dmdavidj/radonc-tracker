# RadOnc Meetings — 방사선종양학 학회 일정 트래커

한/영 전환이 가능한 방사선종양학·의학물리 주요 학회 일정 웹앱입니다.
GitHub Pages(무료)로 호스팅하고, GitHub Actions가 **매주 월요일 밤 11시(KST)** 에 data.json에 등록된 **모든 학회**를
Claude 웹 검색으로 확인해 `data.json`을 자동 갱신합니다.

## 구성

```
index.html                    # 웹앱 (data.json을 읽어서 표시)
data.json                     # 학회 일정 데이터 (Actions가 매주 갱신)
societies.json                # ★ 학회 등록부 — 여기 한 줄 추가하면 자동 편입
scripts/update.mjs            # 갱신 스크립트 (Anthropic API + 웹 검색)
.github/workflows/update.yml  # 매주 월요일 14:00 UTC(23:00 KST) 실행 스케줄
```

## 설치 (약 10분)

1. **GitHub 저장소 만들기** — github.com에서 새 저장소 생성(Public 권장, Private도 가능하지만 Pages는 무료 플랜에선 Public만 지원).
2. **파일 업로드** — 이 폴더의 파일 전체를 저장소에 업로드(웹에서 드래그&드롭 가능. 단 `.github/workflows/update.yml`은 경로 그대로 유지).
3. **GitHub Pages 켜기** — 저장소 Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `/ (root)` → Save.
   몇 분 뒤 `https://<아이디>.github.io/<저장소명>/` 에서 접속 가능.
4. **Anthropic API 키 등록** — console.anthropic.com에서 API 키 발급 후,
   저장소 Settings → Secrets and variables → Actions → New repository secret
   - Name: `ANTHROPIC_API_KEY`
   - Value: 발급받은 키
5. **동작 확인** — Actions 탭 → "Daily conference update" → "Run workflow"로 수동 실행해 보고,
   완료 후 `data.json`이 커밋되고 사이트에 "마지막 자동 업데이트" 날짜가 갱신되는지 확인.

이후로는 손대지 않아도 매주 월요일 밤 11시(KST)에 자동으로 돌아갑니다.
주기를 바꾸려면 `.github/workflows/update.yml`의 cron만 수정하면 됩니다
(예: 매일 → `0 14 * * *`, 매주 목요일 → `0 14 * * 4`).

## 비용

- GitHub Pages / Actions: **무료** (Public 저장소 기준. 이 워크플로는 하루 1~2분 실행이라 한도에 한참 못 미침)
- Anthropic API: 종량제, 모델은 가장 저렴한 최신 모델인 **Claude Haiku 4.5** 사용
  (입력 $1 / 출력 $5 per 1M tokens. 웹 검색은 모델과 무관하게 1,000회당 $10).
  - 주 1회 실행 기준: 호출 5회 × 검색 최대 4회 = 주 최대 20회 검색
    → **월 약 $1 내외** (검색 ~$0.8 + 토큰 몇 센트)
  - 학회를 추가하면 3개당 호출 1회씩 늘어나며 비용도 비례해 소폭 증가합니다.

## 학회 추가 방법 — societies.json에 한 줄이면 끝

새 학회의 일정을 직접 조사해 적을 필요가 없습니다.
`societies.json`의 `societies` 배열에 아래처럼 한 항목만 추가하세요:

```json
{ "soc": "FARO", "group": "INTL",
  "hint": "Federation of Asian Organizations for Radiation Oncology — faro-web.org annual meeting." }
```

- `soc`: 카드에 표시될 약칭
- `group`: 카드 색상 분류 — `KR` 국내 / `NA` 북미 / `EU` 유럽 / `JP` 일본 / `INTL` 국제
- `hint`: 검색 힌트. 공식 홈페이지 주소와 검색 언어(한국어/일본어 등)를 적을수록 정확해집니다.

커밋하면 **다음 실행 때 Claude가 웹을 검색해 해당 학회의 향후 학술대회를
찾아서 data.json에 자동으로 채워 넣습니다** (한/영 이중언어 포함).
바로 반영하고 싶으면 Actions 탭 → "Weekly conference update" → Run workflow로 수동 실행하세요.

학회를 빼고 싶으면 societies.json에서 해당 줄을 지우고(검색 중단),
data.json에서 그 학회 항목들을 삭제하면(화면 표시 제거) 됩니다.

## 데이터 수동 수정 (선택)

자동 검색 결과를 고치고 싶을 때는 `data.json`의 `meetings` 배열을 직접 편집하면 됩니다.
`status`: `confirmed` | `date-only` | `provisional` | `tbd`,
날짜 미정이면 `start`/`end`를 `null`로 두고 `yearHint`에 예상 연도를 넣으세요.

## 주의

AI 검색 결과에는 오류가 있을 수 있습니다. 등록·초록 마감 등 확정 정보는
반드시 각 학회 공식 홈페이지에서 재확인하세요.
