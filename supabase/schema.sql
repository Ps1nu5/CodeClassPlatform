-- ============================================================
--  CodeClass — схема базы данных для Supabase (PostgreSQL)
--  Выполнить целиком в Supabase → SQL Editor → New query → Run.
--  Безопасно запускать повторно (drop policy / create or replace).
-- ============================================================

-- ---------- Таблицы ----------

create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  course        text not null default 'Программирование',
  lessons_paid  int  not null default 0,
  created_at    timestamptz not null default now()
);

-- profiles: связь аккаунта (auth.users) с ролью и учеником.
-- role: admin | student | parent
-- student_id: для student — его строка students; для parent — ребёнок; для admin — NULL.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','student','parent')),
  student_id  uuid references public.students(id) on delete cascade,
  name        text,
  login       text   -- логин (без домена), для показа в админке
);
alter table public.profiles add column if not exists login text;

create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  date        timestamptz not null,
  topic       text not null,
  status      text not null default 'scheduled' check (status in ('scheduled','done','canceled')),
  created_at  timestamptz not null default now()
);

create table if not exists public.homeworks (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  title       text not null,
  description text not null default '',
  due         timestamptz not null,
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now()
);

create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  text          text not null,
  understanding int check (understanding between 1 and 10),
  independence  int check (independence  between 1 and 10),
  homework      int check (homework      between 1 and 10),
  engagement    int check (engagement    between 1 and 10),
  created_at    timestamptz not null default now()
);
-- для баз, созданных до добавления метрики «домашние задания»:
alter table public.feedback add column if not exists homework int check (homework between 1 and 10);

create index if not exists idx_lessons_student   on public.lessons(student_id);
create index if not exists idx_homeworks_student on public.homeworks(student_id);
create index if not exists idx_feedback_student  on public.feedback(student_id);

-- ---------- Вспомогательные функции ----------
-- SECURITY DEFINER → читают profiles в обход RLS (иначе рекурсия в политиках).

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid();
$$;

-- ---------- Включаем Row Level Security ----------

alter table public.students  enable row level security;
alter table public.profiles  enable row level security;
alter table public.lessons   enable row level security;
alter table public.homeworks enable row level security;
alter table public.feedback  enable row level security;

-- ---------- Политики доступа ----------
-- Идея:
--   admin   — видит и меняет всё.
--   student — видит свою строку students, свои lessons/homeworks. НЕ видит feedback.
--   parent  — видит ребёнка, его lessons/homeworks И feedback.
--   Запись (insert/update/delete) во все таблицы — только admin.

-- students
drop policy if exists students_read   on public.students;
drop policy if exists students_write  on public.students;
create policy students_read  on public.students for select
  using (public.auth_role() = 'admin' or id = public.auth_student_id());
create policy students_write on public.students for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- profiles (свою строку видит каждый; пишет только admin)
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_write  on public.profiles;
create policy profiles_read  on public.profiles for select
  using (id = auth.uid() or public.auth_role() = 'admin');
create policy profiles_write on public.profiles for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- lessons
drop policy if exists lessons_read   on public.lessons;
drop policy if exists lessons_write  on public.lessons;
create policy lessons_read  on public.lessons for select
  using (public.auth_role() = 'admin' or student_id = public.auth_student_id());
create policy lessons_write on public.lessons for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- homeworks
drop policy if exists homeworks_read   on public.homeworks;
drop policy if exists homeworks_write  on public.homeworks;
create policy homeworks_read  on public.homeworks for select
  using (public.auth_role() = 'admin' or student_id = public.auth_student_id());
create policy homeworks_write on public.homeworks for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- feedback (ученик НЕ видит — только admin и parent)
drop policy if exists feedback_read   on public.feedback;
drop policy if exists feedback_write  on public.feedback;
create policy feedback_read  on public.feedback for select
  using (
    public.auth_role() = 'admin'
    or (public.auth_role() = 'parent' and student_id = public.auth_student_id())
  );
create policy feedback_write on public.feedback for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- ============================================================
--  ПОСЛЕ создания админ-аккаунта в Authentication → Users
--  (email: admin@codeclass.app) выполнить ОДИН раз, чтобы
--  выдать ему роль admin:
--
--    insert into public.profiles (id, role, name)
--    select id, 'admin', 'Преподаватель'
--    from auth.users where email = 'admin@codeclass.app'
--    on conflict (id) do update set role = 'admin';
-- ============================================================
