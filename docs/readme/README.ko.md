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

https://github.com/user-attachments/assets/744a6b36-b6b5-4933-b22a-6471c5741ea7

</div>

## 핵심 특징

- **로컬 우선 및 `< 1ms` 결정론적 엔진**: 로그인 불필요, 추가 X API 호출 제로, 60/120 FPS의 부드러운 스크롤 유지.
- **다차원 스팸 방어**: 블루 배지 무의미 단문 답글, 원작자 사칭 계정, 리트윗/댓글 유도 미끼, 고빈도 도배, 해시태그 남용, **24개 내장 공공 키워드 규칙**, 언어 필터 및 광고 자동 제거.
- **1줄 접기 바 & 완전 숨김 + 인용 관통**: 판정 근거를 확인할 수 있는 1줄 접기 바와 완전 숨김 모드를 지원하며, 팔로우 중인 계정이 스팸을 인용할 경우 원 스팸 계정만 정확히 타겟팅.
- **4.5초 실행 취소 및 정직한 3단계 피드백**: 즉시 로컬 차단 후 **4.5초 실행 취소 창**을 제공하며, 이후 선택에 따라 X 기본 차단 및 솔트 `SHA-256` 익명 커뮤니티 집계(`1계정 = 1표`, 팔로워 5만 이상 계정 `5배` 보호 임계값) 수행.
- **10개 국어 네이티브 지원**: 한국어, 영어, 중국어(간체/번체), 일본어, 스페인어, 포르투갈어, 프랑스어, 독일어, 러시아어 내장.

## 설치 방법

### 방법 1: Chrome 웹 스토어 원클릭 설치 (권장)

[**Chrome 웹 스토어**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd)에서 원클릭으로 설치할 수 있습니다(Chrome, Edge, Brave, Arc 등 데스크톱 Chromium 브라우저 호환).

### 방법 2: GitHub Releases 수동 로드 (`.zip`)

1. [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest)에서 최신 `keepxcleanextension-*-chrome.zip`을 다운로드하여 압축을 풉니다.
2. `chrome://extensions`에서 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭해 폴더를 선택합니다.

## 개인정보 보호 및 보안

- **인증 정보 접근 제로**: 비밀번호, 쿠키, 로그인 토큰, 이메일 또는 쪽지(DM)에 절대 접근하지 않습니다.
- **외부 추적기 제로**: 서드파티 분석 SDK, 광고 추적기 및 원격 코드 실행이 없습니다.
- 자세한 내용은 공식 [**개인정보 처리방침**](https://keepxclean.com/privacy/)을 참고하세요.

## 저장소 구조 및 로컬 개발

```text
packages/shared/   결정론적 규칙 엔진, X GraphQL 파서, 24개 공공 키워드 및 다국어
apps/extension/    WXT (Manifest V3) 브라우저 확장 프로그램
apps/server/       Cloudflare Workers API, D1 집계 및 R2 스냅샷 캐시
apps/web/          공식 웹사이트 및 인터랙티브 브라우저 샌드박스
tests/e2e/         5단계 엔드투엔드 및 적대적 검증 테스트 스위트
```

필수 환경: **Node.js ≥ 20**, **pnpm**

```bash
pnpm install
pnpm dev:ext      # 확장 프로그램 개발 모드 실행
pnpm typecheck    # 전체 타입 검사
pnpm test         # 단위 및 통합 테스트 실행
pnpm test:e2e     # 5단계 E2E 테스트 실행
pnpm build        # 프로덕션 빌드
```

자체 호스팅 및 CI/CD 배포 가이드는 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)를 참고하세요.

## 제작자 및 라이선스

- **제작자**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **라이선스**: [MIT License](../../LICENSE)에 따라 배포됩니다. KeepXClean은 독립적인 오픈소스 프로젝트이며 X Corp.와 제휴되어 있지 않습니다.
