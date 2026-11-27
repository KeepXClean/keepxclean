<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>로컬 우선, 고신호 X(Twitter) 타임라인 및 답글 필터 브라우저 확장 프로그램</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_웹_스토어-Chrome에_추가-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=ko"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <a href="../../README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.ja.md">日本語</a> ·
    <strong>한국어</strong> ·
    <a href="./README.es.md">Español</a> ·
    <a href="./README.pt.md">Português</a> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean**은 브라우저가 이미 수신한 X(`x.com`) GraphQL 응답을 로컬 메모리에서 직접 분석하여 답글 봇, 사칭 계정, 이벤트 미끼, 코인 도배 및 프로모션 광고를 **1ms 미만**으로 차단하는 오픈소스 확장 프로그램입니다.

<div align="center">

<a href="https://keepxclean.com/?lang=ko#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="KeepXClean 30초 홍보 영상 미리보기" />
  </a>
  <p><a href="https://keepxclean.com/?lang=ko#video"><strong>▶ 공식 웹사이트에서 30초 홍보 영상 보기</strong></a></p>

</div>

## 핵심 특징

- **로컬 우선, `< 1ms` 엔진 및 파싱 상태 자가 진단**: 추가 권한 제로(`storage` + `alarms`만 사용), 로그인 불필요, 추가 X API 호출 없이 60/120 FPS를 유지하며 X 스키마 변경 시 탈식별 진단 요약을 제공하는 로컬 전용 자가 진단(텔레메트리 제로)을 지원합니다.
- **다차원 스팸 방어**: 블루 배지 단문 도배, **동일 스레드 복붙 중복 답글 차단**, **공식 `@grok` 보호 및 짧은 호출 필터**, 사칭 계정, 이벤트 미끼, 고빈도 도배, **구조화된 외부 링크 도메인 필터**, **10개 언어 공용 키워드 팩(45개 규칙)**, **오프라인 공유용 `.kxc-pack.json` 규칙 팩**, 언어 필터 및 광고 제거를 지원합니다.
- **장면별 모드, 접기 바 바로가기 및 인용 관통**: **For You**와 **Following**을 구분해 장면별 모드(`inherit` / `collapse` / `strip` / `bypass`)를 적용하고, 펼친 접기 바에서 일치 규칙으로 바로 이동하거나 해당 항목을 원클릭 비활성화해 즉시 복원할 수 있습니다.
- **빠른 시작 카드, 규칙별 통계 및 선택적 동기화**: 비침습적 최초 설치 빠른 시작 카드, 규칙별 통계·7일 추세·**로컬 Canvas 2D 리포트 PNG**(개인정보 제로), **4.5초 실행 취소 창**, 기본 꺼짐 **선택적 `chrome.storage.sync` 설정 동기화**(대용량 로컬 차단 목록과 로그는 기기에만 유지).
- **10개 국어 네이티브 지원 및 Chrome / Firefox MV3**: 한국어, 영어, 중국어(간체/번체), 일본어, 스페인어, 포르투갈어, 프랑스어, 독일어, 러시아어 내장.

## 설치 방법

### 방법 1: Chrome 웹 스토어 원클릭 설치 (권장)

[**Chrome 웹 스토어**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd)에서 원클릭으로 설치할 수 있습니다(Chrome, Edge, Brave, Arc 등 데스크톱 Chromium 브라우저 호환).

### 방법 2: GitHub Releases 수동 로드 (`.zip`)

1. [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest)에서 최신 `keepxcleanextension-*-chrome.zip`을 다운로드하여 압축을 풉니다.
2. `chrome://extensions`에서 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭해 폴더를 선택합니다.

## 개인정보 보호 및 보안

- KeepXClean은 비밀번호나 DM을 요청하지 않습니다. 계정 식별과 사용자가 실행한 X 작업을 위해 X 쿠키를 로컬에서 읽습니다. 세션 쿠키와 웹 클라이언트 인증 값은 X와의 통신에만 사용하며 KeepXClean 서버로 전송하지 않습니다. 선택적 커뮤니티 신고 데이터는 개인정보 처리방침을 참고하세요.
- **선택적 기본값과 기기 내 보관**: 신규 설치 시 `syncNativeXBlock`, `enableCrowdReport`, `chrome.storage.sync` 동기화는 모두 기본 **OFF**이며, 선택 동기화에서 대용량 로컬 차단 목록과 기록은 제외되고 파싱 자가 진단은 개인정보·텔레메트리 제로입니다.
- **외부 추적기 제로**: 서드파티 분석 SDK, 광고 추적기 및 원격 코드 실행이 없습니다.
- 자세한 내용은 공식 [**개인정보 처리방침**](https://keepxclean.com/privacy/)을 참고하세요.

## 저장소 구조 및 로컬 개발

```text
packages/shared/   결정론적 규칙 엔진, X GraphQL 파서, 10개 언어 공용 키워드 팩(45개 규칙), 오프라인 규칙 팩 검증 및 다국어
apps/extension/    WXT (Manifest V3 — Chrome & Firefox) 확장 프로그램, Shadow DOM UI, Canvas 2D 리포트 및 백그라운드 작업
apps/server/       Cloudflare Workers API, D1 집계, 스냅샷 캐시 및 유지관리용 cloud-rules CLI
apps/web/          공식 웹사이트 및 인터랙티브 브라우저 샌드박스
tests/e2e/         5단계 엔드투엔드 및 적대적 검증 테스트 스위트
tests/browser-e2e/ 실제 Chromium MV3 확장 프로그램 E2E 테스트 스위트
```

필수 환경: **Node.js ≥ 20**, **pnpm**

```bash
pnpm install
pnpm dev:ext      # 확장 프로그램 개발 모드 실행
pnpm lint         # 전체 워크스페이스 ESLint 검사
pnpm typecheck    # 전체 타입 검사
pnpm test         # 단위 및 통합 테스트 실행
pnpm test:e2e     # 5단계 E2E 테스트 실행
pnpm build        # 프로덕션 빌드
pnpm test:browser # 실제 Chromium MV3 확장 프로그램 E2E 실행
```

릴리스 변경 내역은 [CHANGELOG.md](../../CHANGELOG.md), 자체 호스팅 및 CI/CD 배포 가이드는 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)를 참고하세요.

## 제작자 및 라이선스

- **제작자**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **라이선스**: [MIT License](../../LICENSE)에 따라 배포됩니다. KeepXClean은 독립적인 오픈소스 프로젝트이며 X Corp.와 제휴되어 있지 않습니다.
