-- Supabase SQL Editor에서 전체를 한 번 실행합니다. 다시 실행해도 기록은 유지됩니다.
begin;
create schema if not exists task1_private;
revoke all on schema task1_private from public, anon, authenticated;
create table if not exists task1_private.best_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('exam','strip','fault')),
  run_id text not null,
  nickname text not null check (char_length(nickname) between 1 and 16),
  elapsed_ms bigint not null check (elapsed_ms between 1000 and 604800000),
  score numeric(5,2),
  bad integer,
  app_version text not null,
  recorded_at timestamptz not null default now(),
  primary key (owner_id, mode)
);
create table if not exists task1_private.submit_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  submitted_at timestamptz not null
);
alter table task1_private.best_records enable row level security;
alter table task1_private.submit_limits enable row level security;
revoke all on all tables in schema task1_private from public, anon, authenticated;

create or replace function public.task1_submit_record(
  p_mode text, p_run_id text, p_name text, p_elapsed_ms bigint,
  p_score numeric default null, p_bad integer default null, p_version text default ''
) returns boolean language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); changed integer;
begin
  if who is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_mode is null or p_mode not in ('exam','strip','fault')
    or p_run_id is null or char_length(p_run_id) not between 1 and 100
    or p_name is null or char_length(btrim(p_name)) not between 1 and 16
    or p_name ~ '[[:cntrl:]]'
    or p_elapsed_ms is null or p_elapsed_ms not between 1000 and 604800000
    or p_version is null or char_length(p_version) > 32 then
    raise exception 'INVALID_RECORD';
  end if;
  if (p_mode = 'exam' and (p_score is null or p_score < 0 or p_score > 30 or p_elapsed_ms > 12600000 or p_bad is not null))
    or (p_mode = 'strip' and (p_bad is null or p_bad not between 0 and 80 or p_score is not null or p_elapsed_ms > 86400000))
    or (p_mode = 'fault' and (p_score is not null or p_bad is not null)) then
    raise exception 'INVALID_RECORD';
  end if;
  -- 재전송해도 기록을 늘리지 않으며, 소유자는 요청값 대신 로그인 정보로 결정합니다.
  if exists (select 1 from task1_private.best_records where owner_id=who and mode=p_mode and run_id=p_run_id) then return true; end if;
  insert into task1_private.submit_limits as limits (owner_id,submitted_at) values (who,clock_timestamp())
    on conflict (owner_id) do update set submitted_at=excluded.submitted_at
    where limits.submitted_at < clock_timestamp()-interval '2 seconds';
  get diagnostics changed = row_count;
  if changed=0 then raise exception 'RATE_LIMITED'; end if;
  insert into task1_private.best_records as best
    (owner_id,mode,run_id,nickname,elapsed_ms,score,bad,app_version)
    values (who,p_mode,p_run_id,btrim(p_name),p_elapsed_ms,round(p_score,2),p_bad,p_version)
    on conflict (owner_id,mode) do update set
      run_id=excluded.run_id, nickname=excluded.nickname, elapsed_ms=excluded.elapsed_ms,
      score=excluded.score,bad=excluded.bad,app_version=excluded.app_version,recorded_at=now()
    where (p_mode='exam' and (excluded.score>best.score or (excluded.score=best.score and excluded.elapsed_ms<best.elapsed_ms)))
       or (p_mode='strip' and (excluded.bad<best.bad or (excluded.bad=best.bad and excluded.elapsed_ms<best.elapsed_ms)))
       or (p_mode='fault' and excluded.elapsed_ms<best.elapsed_ms);
  return true;
end;
$$;
revoke all on function public.task1_submit_record(text,text,text,bigint,numeric,integer,text) from public,anon,authenticated;
grant execute on function public.task1_submit_record(text,text,text,bigint,numeric,integer,text) to authenticated;

create or replace function public.task1_leaderboard(p_mode text)
returns table (name text, tag text, t bigint, score numeric, bad integer, at timestamptz, place bigint)
language sql stable security definer set search_path = '' as $$
  select nickname, substring(md5(owner_id::text),1,8), elapsed_ms, score, bad, recorded_at,
    rank() over (order by
      case when mode='exam' then score end desc nulls last,
      case when mode='strip' then bad end asc nulls last, elapsed_ms asc)
  from task1_private.best_records where mode=p_mode
  order by
    case when mode='exam' then score end desc nulls last,
    case when mode='strip' then bad end asc nulls last, elapsed_ms asc, recorded_at asc, owner_id asc
  limit 100;
$$;
revoke all on function public.task1_leaderboard(text) from public,anon,authenticated;
grant execute on function public.task1_leaderboard(text) to anon,authenticated;
commit;
