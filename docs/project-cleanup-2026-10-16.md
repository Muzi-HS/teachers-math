# 프로젝트 점검 및 정리 (2026-10-16)

## 점검 범위

- App Router 페이지·API, 컴포넌트, Context, lib의 정적·동적 import 연결과 TypeScript 미사용 선언 검사
- 직접 의존성 사용 여부, 정적 자산 참조, 엑셀 템플릿 중복 여부
- 인증·권한·SQL을 포함한 기존 회귀 테스트, ESLint, 프로덕션 빌드
- 설치된 Next.js 16.2.9의 로컬 lazy-loading 및 package-bundling 문서를 기준으로 변경

## 적용한 변경

| 변경 | 근거 및 효과 |
| --- | --- |
| `lib/homework-status.ts` 삭제 | 소스와 테스트에 참조가 없는 유틸리티 |
| `test-connection.mjs` 삭제 | 실행 스크립트나 테스트에서 호출하지 않는 일회성 DB 연결 확인 코드 |
| `dev-output.txt` 삭제 및 ignore 추가 | 실행에 필요 없는 개발 로그 |
| 루트 `today study.xlsx` 삭제 | 실제 API가 사용하는 `lib/templates/today-study-template.xlsx`와 SHA-256이 동일한 복사본 |
| `@supabase/ssr` 제거 | 프로젝트가 직접 `@supabase/supabase-js`를 사용하며 SSR 패키지 참조가 없음. 전용 하위 의존성 `cookie`도 lockfile에서 제거 |
| 학생 레이아웃의 미사용 공지 카운트 제거 | 결과가 화면에 쓰이지 않음. 학생·경로 변경 시 수행하던 최대 2회의 RPC와 상태 갱신 제거 |
| 통계 탭 5개를 `next/dynamic`으로 분리 | 선택한 탭의 컴포넌트를 필요할 때 불러옴 |
| 출근부 XLSX 라이브러리를 동적 import로 전환 | 다운로드 시 라이브러리를 불러옴. 기존 시트 구성·스타일 유지, 로딩 실패 안내 추가 |
| 미사용 React import 제거 | 자동 JSX 런타임에서 불필요 |
| 알림 안내의 기기 감지 변경 | `useSyncExternalStore`의 서버 snapshot으로 hydration을 유지하고 effect 안의 동기 setState 제거 |
| 일정 테스트의 `module` 지역 변수명 변경 | Next.js ESLint 규칙 위반 해소 |

## 유지한 항목

- `app/preview`는 URL로 접근하는 페이지이며 실제 서비스가 공유하는 컴포넌트도 있어 유지했다. import가 없다는 이유로 페이지를 삭제하지 않았다.
- Supabase 마이그레이션·Edge Function·cron SQL은 애플리케이션 import 그래프 밖에서도 실행되므로 유지했다. 운영 DB에는 SQL을 실행하지 않았다.
- `public` 파일은 외부 URL, 설치된 PWA, 푸시 알림, 관리자 설정에 저장된 경로로 사용될 수 있어 소스 참조 부재만으로 삭제하지 않았다.
- 기존 테스트와 운영용 엑셀 템플릿을 유지했다.

## 후속 개선 후보

1. 관리자 반·선생님·수업기록·학생 페이지는 각각 약 800~950행이다. 폼과 모달, 데이터 로딩을 기능 단위로 분리하면 수정 범위를 줄일 수 있다. 이번에는 광범위한 상태 구조 변경을 하지 않았다.
2. 차트와 XLSX의 실제 전송량 차이는 Next.js 번들 분석과 브라우저 Network에서 측정할 수 있다. 이번 변경은 로딩 시점을 분리했으며 속도 개선 수치를 측정한 것은 아니다.
3. 공통 설정 조회에 캐시를 도입하려면 관리자 저장 직후 갱신 방식과 계정 전환 시 무효화 정책부터 정해야 한다.
4. 사용하지 않는 이미지와 이전 PWA 아이콘의 최종 삭제에는 운영 DB 설정과 기존 설치 클라이언트의 참조 확인이 필요하다.

## 검증

- 전체 기존 테스트 114개 통과: `node --test --test-isolation=none tests/*.test.mjs`
- 알림 안내 회귀 테스트 1개 추가 후 해당 파일 3개 테스트 및 일정 관련 5개 테스트 통과
- `npm run lint` 통과. 추가 테스트 파일도 별도 ESLint 검사 통과
- 실제 XLSX 라이브러리로 출근부 생성 스모크 검사 통과: 월별 요약 및 개인별 시트 2개, 제목 스타일과 파일명의 연월 확인. 파일 저장은 대체 함수로 확인
- Node 테스트의 기본 프로세스 격리는 이 환경에서 `spawn EPERM`이 발생해 동일 테스트를 격리 없이 실행했다.
- 엄격한 미사용 선언 검사 포함 TypeScript 검사 통과: `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false`
- 프로덕션 빌드 통과. 최초 샌드박스 실행에서 작업 프로세스가 차단되어 실행 권한을 확장해 확인했다.
- 실서비스 로그인, 실제 출근부 다운로드와 모바일 PWA 동작은 브라우저에서 별도 확인이 필요하다.
