This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 관리자 내부 달력

학원일정의 `관리자 · 내부용` 탭에서 오늘·이번 주 요약, 월간 달력과 내부 일정 등록·수정·삭제를 사용합니다. 날짜를 선택하거나 오늘 일정 등록을 누르면 해당 날짜가 입력됩니다. 종일/시간, 기간, 분류, 담당자, 장소, 메모와 완료 여부를 지정할 수 있습니다.

Supabase SQL Editor에서 `supabase/admin_schedule_migration.sql`을 실행하세요. 반복 실행이 가능하며 승인된 관리자만 DB의 내부 일정에 접근할 수 있습니다. 학부모·학생 공개 일정과 별도 테이블을 사용합니다.

공휴일 API는 [한국천문연구원 특일 정보](https://www.data.go.kr/data/15012690/openapi.do)의 활용신청 후 발급받은 **일반 인증키(Decoding)**를 서버 환경변수 `KASI_HOLIDAY_API_KEY`에 설정하고 서버를 재시작하면 활성화됩니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요. 인증키 미설정 또는 API 장애 시 기존 저장 자료를 표시하며, 공휴일은 자동 휴강으로 처리되지 않습니다.

검증: `node --test tests/admin-schedule.test.mjs`, `npx tsc --noEmit`, `npm run build`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
