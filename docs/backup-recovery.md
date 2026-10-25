# 백업 설정과 데이터 복구 안내

대상: 로컬 PC, 네이버 MYBOX, **개인 Google Drive**. Google Cloud Storage와는 다릅니다.

## 1. 백업에 들어가는 것

- `database.dump`: PostgreSQL의 한 스냅샷으로 저장한 전체 DB 논리 백업. public 데이터·함수·트리거·RLS·인덱스뿐 아니라 접근 가능한 Auth·Storage 스키마도 포함합니다. `student_enrollment_history`처럼 화면에 표시되지 않는 이력 테이블도 포함됩니다.
- `roles-reference.sql`: 역할 정의 참고 자료. 역할 비밀번호는 포함하지 않습니다. Supabase 예약 역할까지 있으므로 통째로 재실행하면 안 됩니다.
- `storage/<버킷명>/...`: Storage의 실제 첨부파일. 빈 버킷도 목록에 기록합니다.
- `manifest.json`: 파일별 SHA-256, 버킷 목록, 백업 시작·종료 시각, 형식 버전.
- `backup-recovery.md`: 이 안내서. PC 도구 ZIP 및 GitHub 실행에는 포함됩니다.

DB 덤프는 일관된 단일 스냅샷입니다. 파일 복사는 그 뒤 순서대로 이루어지므로 **DB와 첨부파일 전체가 완전히 같은 시점인 것은 아닙니다.** 중요한 복구 지점을 만들 때는 입력·수정·파일 업로드를 잠시 멈추고 백업하세요. 파일이 복사 중에 바뀌어 검사에 실패하면 백업 작업도 실패합니다.

앱 소스·Edge Function 코드·환경변수·Supabase 프로젝트 설정·OAuth 공급자 설정·외부 cron 설정·암호화 루트 키는 이 백업으로 복원되지 않습니다. 소스는 Git으로 보관하고 나머지 설정은 별도 비밀 관리 도구에 기록하세요. Vault/컬럼 암호화가 있다면 원래 암호화 키가 추가로 필요합니다. 이는 CSV/엑셀 내보내기와 다른 복구용 백업입니다.

## 2. 최초 준비 — 로컬부터 시험하기

설정 → 백업·복구 → **PC 실행 도구 다운로드**를 누르고 접근이 제한된 개인 폴더에 압축을 풉니다. ZIP에는 비밀키가 없습니다. 이 폴더를 Git 저장소나 공유 폴더에 두지 마세요.

### 도구 설치

다음 공식 배포 도구를 설치하고 터미널에서 실행되는지 확인합니다.

- Python 3.10 이상 (`python --version`)
- PostgreSQL 클라이언트의 `pg_dump`, `pg_dumpall`, `pg_restore`, `psql`. **서버와 같은 주 버전 또는 더 최신의 pg_dump**를 사용합니다. GitHub 실행은 PostgreSQL 18 클라이언트를 설치합니다.
- [rclone](https://rclone.org/install/) (`rclone version`)
- [age / age-keygen](https://github.com/FiloSottile/age#installation) (`age --version`)

도구 다운로드 페이지: [Python](https://www.python.org/downloads/), [PostgreSQL](https://www.postgresql.org/download/windows/).

### 복구 개인키 만들기

```powershell
age-keygen -o C:\PrivateRecovery\teachers-backup.agekey
```

상위 폴더를 먼저 만드세요. 출력된 `age1...` **공개키만** `BACKUP_AGE_RECIPIENT`에 넣습니다. `AGE-SECRET-KEY-...`가 담긴 파일은 오프라인 USB나 별도 암호 관리 저장소에도 보관합니다. 개인키를 잃으면 암호화된 백업을 복구할 수 없습니다. GitHub·앱 서버·MYBOX 백업 폴더에 개인키를 넣지 마세요.

### 연결 설정

`config.example.json`을 `config.private.json`으로 복사한 뒤 값을 채웁니다. 개인 설정 파일은 다른 사람과 공유하지 않습니다. 예제의 미사용 Google/MYBOX 항목은 로컬 실행 시 읽지 않습니다.

| 설정 | 입력 방법 |
| --- | --- |
| `BACKUP_DB_URL` | Supabase Dashboard → Connect → **Session pooler, 5432**의 PostgreSQL URL. DB 비밀번호를 URL 인코딩해 입력. 익명 API 키나 service_role 키가 아닙니다. transaction pooler 6543은 사용하지 않습니다. |
| `BACKUP_STORAGE_ENDPOINT` | 프로젝트의 `https://PROJECT_REF.supabase.co/storage/v1/s3` |
| `BACKUP_STORAGE_REGION` | 실제 프로젝트 리전. 예제의 서울 리전을 그대로 쓰지 말고 확인하세요. |
| `BACKUP_STORAGE_ACCESS_KEY`, `BACKUP_STORAGE_SECRET_KEY` | Supabase Storage S3 연결 설정에서 발급한 S3 접근 키. anon/service_role 키와 다릅니다. |
| `BACKUP_AGE_RECIPIENT` | 앞에서 생성한 `age1...` 공개키 |

실행:

```powershell
python .\backup.py --target local --config .\config.private.json --output .\backups
# 또는
.\Run-Backup.ps1 -Target local
```

Windows가 ps1 실행을 제한하면 조직 정책을 바꾸지 말고 위의 Python 명령을 사용하세요.

`backups`에 `.tar.gz.age`, `.sha256`, `last-backup.json`이 만들어집니다. 백업 생성·암호화·전달이 모두 끝난 경우에만 완료 기록을 갱신합니다. 파일 생성만으로 복원 가능성이 검증되는 것은 아니므로 아래 복구 연습까지 진행하세요. 임시 평문 파일은 OS 임시 폴더에 만들어졌다가 정상 종료/일반 오류 시 제거됩니다. 강제 종료·PC 전원 장애 시 남을 수 있으므로 디스크 암호화를 사용하고 임시 폴더를 점검하세요. 로그에는 외부 도구가 출력한 비밀값·학생명·파일명을 내보내지 않습니다.

원본 덤프·첨부파일·압축 파일을 임시 저장하므로 여유 디스크 공간이 필요합니다. 첫 실행 전 데이터와 첨부파일 합계의 약 3배 이상을 확보하고 실제 사용량을 확인하세요. Storage 객체가 하나도 없는 프로젝트도 S3 인증과 버킷 목록 조회는 성공해야 합니다. DB만 성공한 상태를 전체 백업 성공으로 취급하지 않습니다.

### PC 자동 실행

Windows 작업 스케줄러 → 기본 작업 만들기 → 매일 원하는 시간 → 프로그램 시작:

- 프로그램: 실제 `python.exe`의 절대 경로
- 인수: `"C:\TeachersBackup\backup.py" --target local --config "C:\TeachersBackup\config.private.json" --output "C:\TeachersBackup\backups"`
- 시작 위치: `C:\TeachersBackup`

실제 설치 경로에 맞게 바꾸세요. 설정 → 예약된 시작 시간을 놓친 경우 가능한 대로 작업 시작을 선택합니다. 먼저 작업을 수동 실행해 마지막 실행 결과가 `0x0`인지, 완료 기록 시각이 바뀌었는지 확인합니다. 백업 파일 경로가 학생 등 다른 사용자에게 공개되지 않도록 폴더 권한을 제한하세요.

## 3. 네이버 MYBOX

1. MYBOX PC 탐색기에 로그인하고 환경설정에서 **실제 동기화 폴더**를 확인합니다. 예전 버전의 폴더가 계속 동기화된다고 가정하지 마세요.
2. 그 폴더 안에 백업용 하위 폴더를 만들고 절대 경로를 `BACKUP_MYBOX_DIR`에 넣습니다. 존재하지 않는 경로는 실행을 거부합니다.
3. `python .\backup.py --target mybox --config .\config.private.json --output .\backups`로 실행합니다.
4. MYBOX 웹에서 해당 날짜의 `.age`, `.sha256` 파일이 실제로 올라왔는지 확인합니다.
5. Windows 작업 스케줄러의 `--target`을 `mybox`로 지정합니다. PC 및 MYBOX 앱이 실행 중이어야 업로드됩니다.

MYBOX 모드는 로컬 원본도 보관합니다. 완료 기록의 `sync-folder-written-cloud-sync-unverified`는 **동기화 폴더 저장 완료**라는 뜻이며, MYBOX 서버 업로드 완료를 의미하지 않습니다. 브라우저 설정 화면에서 개인 PC의 실행 여부를 자동 판독하지 않습니다.

## 4. 개인 Google Drive 연결

### 본인 계정으로 rclone 인증

1. Google Cloud Console에서 프로젝트를 만들고 **Google Drive API**를 활성화합니다. 스토리지용 유료 버킷은 만들지 않습니다.
2. OAuth 동의 화면과 **데스크톱 앱 OAuth Client**를 만듭니다. 본인 계정에 필요한 접근만 허용합니다. 외부 앱을 테스트 상태로 두면 토큰이 만료될 수 있으므로 Google 정책에 따라 게시 상태·동의 범위를 확인합니다.
3. PC에서 `rclone config` → 새 remote 이름 `google` → 종류 `drive` → 본인의 client ID와 secret 입력 → scope **drive.file** 선택 → 브라우저에서 본인 계정 승인. 기존 Drive 파일 전체 접근 대신 rclone이 만든 파일·폴더만 다루도록 합니다.
4. `rclone mkdir google:TeachersMathBackup`으로 폴더를 만듭니다. Drive 웹에서 해당 폴더를 열고 URL의 `/folders/` 뒤 ID를 복사합니다. drive.file 권한에서는 웹에서 미리 만든 폴더가 보이지 않을 수 있으므로 rclone으로 생성합니다.
5. `rclone config file`로 설정 파일 위치를 확인합니다. `google` 항목의 OAuth token JSON을 **로컬에서만** 읽어 `BACKUP_GOOGLE_TOKEN`에 넣습니다. JSON 파일 안에서는 따옴표 이스케이프가 필요합니다. 터미널 출력·채팅·커밋으로 토큰을 공유하지 마세요.
6. `BACKUP_GOOGLE_CLIENT_ID`, `BACKUP_GOOGLE_CLIENT_SECRET`, `BACKUP_GOOGLE_FOLDER_ID`를 함께 입력합니다. 인증에 쓴 client ID/secret과 반드시 같아야 합니다.
7. `python .\backup.py --target google --config .\config.private.json --output .\backups`로 시험하고 Drive 웹에서 확인합니다. PC 예약 실행도 가능합니다.

인증이 취소되거나 refresh token이 만료되면 백업은 실패합니다. rclone으로 다시 인증하고 저장한 토큰을 교체하세요. 여기서 사용하는 폴더 ID는 업로드 경로를 제한하지만 OAuth 자체의 권한 범위를 대신하지는 않습니다.

### PC 없이 자동 실행 — GitHub Actions

이 저장소의 `.github/workflows/supabase-backup.yml`을 기본 브랜치에 배포해야 합니다. 브랜치 이름이 `main`이 아니면 서버의 `BACKUP_GITHUB_REF`도 맞춰 주세요. 워크플로가 기본 브랜치에 있어야 예약 및 실행 요청이 정상 동작합니다.

GitHub 저장소 → Settings → Secrets and variables → Actions → **Secrets**에 아래 값을 등록합니다:

```text
BACKUP_DB_URL
BACKUP_STORAGE_ENDPOINT
BACKUP_STORAGE_REGION
BACKUP_STORAGE_ACCESS_KEY
BACKUP_STORAGE_SECRET_KEY
BACKUP_AGE_RECIPIENT
BACKUP_GOOGLE_CLIENT_ID
BACKUP_GOOGLE_CLIENT_SECRET
BACKUP_GOOGLE_TOKEN
BACKUP_GOOGLE_FOLDER_ID
```

토큰은 이 화면에 **이스케이프하지 않은 원래 JSON 전체**를 Secret 값으로 넣습니다. 복구 개인키는 등록하지 않습니다. 비밀값을 GitHub Variables나 소스 파일에 넣지 마세요.

먼저 Actions → Supabase encrypted backup → Run workflow로 시험합니다. 모든 단계가 녹색으로 끝나고 Drive 웹에 파일이 올라오는지 확인합니다. 실패 알림은 GitHub 본인 계정 Notifications → Actions의 실패 워크플로 알림을 설정합니다. 이 기능이 별도 이메일·문자를 보내지는 않습니다.

성공 후 같은 설정의 **Variables**에 `BACKUP_ENABLED=true`를 등록하면 매일 **한국 시간 03:20** 예약 백업이 활성화됩니다. 변수가 없으면 예약 실행은 건너뛰고 수동 실행만 가능합니다. GitHub 예약은 지연·미실행될 수 있으므로 마지막 성공 시각을 주기적으로 확인하세요. Actions 실행량과 Drive 용량에는 계정별 한도·비용이 적용될 수 있습니다.

### 앱 설정 화면에서 실행·기록·다운로드 연결

GitHub에서 이 저장소만 접근하는 Fine-grained token을 생성하고 **Actions: Read and write** 권한을 부여합니다. 배포 서버의 비공개 환경변수에 다음을 등록하고 재배포합니다:

```text
BACKUP_GITHUB_REPOSITORY=OWNER/REPOSITORY
BACKUP_GITHUB_REF=main
BACKUP_GITHUB_TOKEN=본인_토큰
```

`NEXT_PUBLIC_` 접두사는 사용하지 않습니다. Supabase 서버 인증에는 기존 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. Drive 인증 정보는 앱 서버가 아닌 GitHub Secrets에 보관합니다.

승인된 관리자는 설정 → 백업·복구에서 **Google Drive 백업 실행**, 실행 기록 조회, **최근 완료 백업을 PC로 다운로드**를 사용할 수 있습니다. 실행 접수와 완료는 별개입니다. 다운로드는 최근 10개 실행 중 다운로드 사본이 남아 있는 성공 건을 찾습니다. 30일이 지났거나 해당 범위에 성공 건이 없으면 Drive에서 직접 날짜별 파일을 받으세요. GitHub 사본 ZIP을 풀면 그 안에 암호화된 `.age` 파일이 있습니다. 큰 파일은 브라우저 메모리·호스팅 전송 제한에 걸릴 수 있으므로 Drive에서 직접 내려받으세요.

로컬/MYBOX는 이 웹 화면이 PC 프로그램을 원격 실행하는 방식이 아닙니다. 도구 다운로드 및 PC 작업 스케줄러가 실행을 담당합니다. 화면에는 이 차이를 표시합니다.

## 5. 보관과 점검

- 모든 백업 이름은 UTC 시각+임의 접미사로 구분됩니다. 같은 파일에 계속 덮어쓰지 않습니다.
- GitHub 다운로드 사본은 30일간 보관합니다. **로컬·MYBOX·Drive 파일은 자동 삭제하지 않습니다.** 운영 실수로 오래된 복구 지점까지 지워지는 것을 피하기 위한 초기 정책입니다.
- 용량을 점검하면서 최근 일별 30개와 월별 12개를 유지하는 방식으로 수동 정리하세요. 월별 보관은 자동 구현된 기능이 아닙니다. 삭제 전 복구 연습에 성공한 사본을 확인하세요.
- 적어도 월 1회 별도 환경에서 복원 연습을 하고 결과·백업 날짜·앱 커밋을 기록하세요. API 실행 성공이나 SHA-256 일치만으로 실제 로그인·업무 데이터 복원이 보장되지는 않습니다.

## 6. 데이터가 사라졌을 때

### 즉시 할 일

1. 입력·수정·파일 업로드를 중단합니다. `BACKUP_ENABLED=false`로 바꾸고 PC 예약 작업도 일시 중지합니다.
2. 삭제 전 백업을 찾습니다. 최신 백업에는 이미 삭제가 반영됐을 수 있습니다. 원본 백업은 복사해서 작업합니다.
3. 현재 운영 DB도 별도 백업합니다. 삭제 이후 입력된 정상 데이터를 보존하고 부분 복구에 활용하기 위해서입니다.
4. Supabase 자체 백업/PITR 이용 가능 여부도 Dashboard에서 확인합니다. 파일 복원은 별도입니다.

### 파일 무결성 확인과 복호화

다운로드한 `.sha256`의 값과 다음 결과를 비교합니다:

```powershell
Get-FileHash -Algorithm SHA256 .\teachers-math-DATE.tar.gz.age
age --decrypt --identity C:\PrivateRecovery\teachers-backup.agekey --output .\recovery.tar.gz .\teachers-math-DATE.tar.gz.age
tar -xzf .\recovery.tar.gz
python .\verify.py .\teachers-math-DATE
pg_restore --list .\teachers-math-DATE\database.dump
```

`DATE`는 실제 파일명으로 바꿉니다. 출력 폴더에는 평문 개인정보가 있으므로 접근을 제한합니다. 검증 실패 시 다른 사본을 확보하세요.

### 별도 환경에 복원

**운영 DB를 대상으로 `--clean`, DROP, TRUNCATE, 데이터 전체 import를 바로 실행하지 마세요.** 복원은 DB 버전·확장·Supabase 내부 스키마와 현재 남아 있는 데이터에 따라 달라집니다.

1. 새 Supabase 프로젝트 또는 같은 PostgreSQL/Supabase 버전의 격리된 복원 환경을 준비합니다. 필요한 확장과 외부 인증 설정을 확인합니다.
2. archive 내용을 점검합니다. 관리형 Supabase의 `auth`, `storage`, `realtime`, 예약 역할은 새 프로젝트에도 이미 있으므로 전체 덤프를 그대로 덮어쓰면 충돌합니다. `roles-reference.sql`도 참고만 하고 필요한 사용자 정의 역할만 별도 준비합니다.
3. 아래 명령은 **운영 DB를 수정하지 않고** 검토용 SQL을 생성합니다:

```powershell
pg_restore --schema-only --schema=public --no-owner --file=public-schema.sql .\teachers-math-DATE\database.dump
pg_restore --data-only --schema=auth --schema=public --no-owner --file=auth-public-data.sql .\teachers-math-DATE\database.dump
pg_restore --schema=auth --schema=storage --no-owner --file=managed-reference.sql .\teachers-math-DATE\database.dump
```

4. DB 담당자는 생성 SQL에서 새 프로젝트에 이미 있는 스키마·확장·역할·기본 Auth 데이터를 확인하고, `public` 구조 및 Auth/Public 데이터를 복원합니다. Auth와 public 사이 외래키, 계정 생성 트리거 중복 실행을 피하도록 하나의 검증된 복원 순서를 설계해야 합니다. [Supabase 공식 복구 안내](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)의 트리거 비활성화·암호화 키 관련 절차를 참고하세요. 우리 파일은 `pg_dump` custom archive이므로 공식 CLI의 세 SQL 파일과 동일한 형식이 아닙니다. 위에서 추출한 SQL을 무검토로 공식 명령에 넣으면 안 됩니다.
5. `managed-reference.sql`에서 프로젝트가 추가한 Auth 트리거, Storage RLS 정책 등을 찾아 필요한 정의만 새 프로젝트에 재적용합니다. 이 저장소의 SQL은 의존 순서와 실제 적용 내역을 확인한 뒤 사용합니다. 파일명 순으로 모두 재실행하지 마세요.
6. Storage 버킷은 새 프로젝트 Dashboard/API에서 원래 이름·공개 여부·파일 제한으로 생성합니다. 설정은 dump의 `storage.buckets` 데이터를 참고합니다. 새 프로젝트의 S3 remote를 별도로 설정하고 아래처럼 **첨부파일을 API를 통해** 업로드합니다:

```powershell
rclone copy .\teachers-math-DATE\storage\BUCKET restored:BUCKET
rclone check .\teachers-math-DATE\storage\BUCKET restored:BUCKET --one-way
```

`restored`는 반드시 새 프로젝트 S3 endpoint/키로 설정한 remote입니다. 공개 여부·정책을 적용하기 전 외부에 파일이 노출되지 않도록 비공개로 검증합니다. `storage.objects` 메타데이터만 복원해서는 실제 파일이 생기지 않습니다. 파일 복원 때 객체 메타데이터가 생성되므로 기존 객체 행을 맹목적으로 통째로 삽입하지 마세요. 소유자 기반 RLS가 있다면 기존 소유권 메타데이터 복원도 별도 검증해야 합니다.

### 검증 후 서비스 재개

- 학생/학부모/반/수업기록/시험/등록 이력의 건수와 최근 날짜, 삭제 이후 정상 입력 데이터를 대조합니다.
- 관리자·교사·학부모·학생 계정으로 로그인하고 다른 사용자 데이터가 보이지 않는지 확인합니다.
- 공지 이미지 등 첨부파일과 다운로드를 확인합니다.
- PIN·자동채점·푸시·예약 작업·쿠폰·등록 추이를 확인합니다. 일부 설정/토큰은 재발급 또는 재로그인이 필요할 수 있습니다.
- 필요한 행만 원래 DB로 복구하거나, 검증된 새 프로젝트로 앱의 URL·키·Edge Function·예약 설정을 전환합니다. 전환 전후 정상 입력 유실을 막기 위해 점검 시간을 확보하세요.
- 백업 연결도 새 프로젝트로 갱신한 뒤 수동 백업을 먼저 성공시키고 자동 실행을 다시 켭니다.

복구 범위가 작은 경우에도 외래키·시퀀스·등록 이력 트리거가 관련될 수 있습니다. 예를 들어 삭제 학생을 다시 삽입하는 작업이 기존 퇴원 이력을 자동으로 되돌린다고 가정하지 마세요. 관련 이력까지 검증한 복구 SQL을 사용해야 합니다.

## 참고 문서

- [Supabase 기본 백업과 Storage 제외 범위](https://supabase.com/docs/guides/platform/backups)
- [Supabase Storage S3 복사](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)
- [rclone Google Drive 설정·OAuth 권한](https://rclone.org/drive/)
- [MYBOX 동기화 폴더 확인](https://help.naver.com/service/5594/contents/22210?lang=ko&osType=PC)
- [GitHub Actions 실행 API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

현재 저장소에서의 검증과 실제 운영 백업/복원 성공은 별도입니다. 비밀값과 외부 계정을 연결한 뒤 로컬 백업 → Drive 수동 백업 → 별도 환경 복원 연습 순으로 확인하세요.
