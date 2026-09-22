-- 앱 종료/네트워크 단절 후에도 마지막으로 서버에 저장된 답안을 자동채점한다.
-- Supabase Database > Extensions에서 pg_cron 활성화 후 실행.
create extension if not exists pg_cron;
select cron.schedule('finalize-expired-tests', '* * * * *', 'select public.finalize_expired_tests()');
-- 응시 제한은 정확히 120초. 연결이 끊긴 응시는 마감 후 최대 1분 이내 집계된다.
