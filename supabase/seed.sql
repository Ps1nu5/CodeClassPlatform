-- ============================================================
--  CodeClass — связывание аккаунтов с ролями + демо-данные.
--  ВЫПОЛНЯТЬ ПОСЛЕ того, как в Authentication → Users созданы
--  три пользователя (с галочкой Auto Confirm):
--     admin@codeclass.app
--     artem@codeclass.app
--     artem_parent@codeclass.app
--  Запускать в SQL Editor. Безопасно повторно (идемпотентно).
-- ============================================================

-- 0) колонка login (если схему запускали до её добавления)
alter table public.profiles add column if not exists login text;

-- 1) Админ
insert into public.profiles (id, role, name, login)
select id, 'admin', 'Преподаватель', 'admin'
from auth.users where email = 'admin@codeclass.app'
on conflict (id) do update set role = 'admin', login = 'admin';

-- 2) Демо-ученик (создаём один раз)
insert into public.students (name, course, lessons_paid)
select 'Артём Кузнецов', 'Python для начинающих', 12
where not exists (select 1 from public.students where name = 'Артём Кузнецов');

-- 3) Профили ученика и родителя, привязанные к этому ученику
insert into public.profiles (id, role, student_id, name, login)
select u.id, 'student', s.id, 'Артём', 'artem'
from auth.users u, public.students s
where u.email = 'artem@codeclass.app' and s.name = 'Артём Кузнецов'
on conflict (id) do update set role='student', student_id=excluded.student_id, login='artem';

insert into public.profiles (id, role, student_id, name, login)
select u.id, 'parent', s.id, 'Родитель Артёма', 'artem_parent'
from auth.users u, public.students s
where u.email = 'artem_parent@codeclass.app' and s.name = 'Артём Кузнецов'
on conflict (id) do update set role='parent', student_id=excluded.student_id, login='artem_parent';

-- 4) Демо-уроки (один раз, если у ученика их ещё нет)
insert into public.lessons (student_id, date, topic, status)
select s.id, v.date, v.topic, v.status
from public.students s,
(values
  (now() - interval '14 day', 'Переменные и типы данных', 'done'),
  (now() - interval '10 day', 'Условия и ветвления',      'done'),
  (now() - interval '7 day',  'Циклы while и for',         'done'),
  (now() - interval '3 day',  'Списки и кортежи',          'done'),
  (now() + interval '2 day',  'Функции',                   'scheduled'),
  (now() + interval '5 day',  'Словари',                   'scheduled'),
  (now() + interval '9 day',  'Работа с файлами',          'scheduled')
) as v(date, topic, status)
where s.name = 'Артём Кузнецов'
  and not exists (select 1 from public.lessons l where l.student_id = s.id);

-- 5) Демо-домашки
insert into public.homeworks (student_id, title, description, due, status)
select s.id, v.title, v.descr, v.due, v.status
from public.students s,
(values
  ('Калькулятор на if/else', 'Программа, считающая скидку по сумме чека.', now() + interval '1 day', 'open'),
  ('Числа Фибоначчи циклом', 'Первые 15 чисел Фибоначчи через while.',     now() + interval '4 day', 'open'),
  ('Сортировка списка',      'Отсортировать список оценок без sorted().',  now() - interval '2 day', 'done')
) as v(title, descr, due, status)
where s.name = 'Артём Кузнецов'
  and not exists (select 1 from public.homeworks h where h.student_id = s.id);

-- 6) Демо-обратная связь
insert into public.feedback (student_id, text, understanding, independence, engagement)
select s.id,
  'Артём хорошо разобрался с циклами, активно задаёт вопросы. Рекомендую закрепить тему списков дома.',
  8, 6, 9
from public.students s
where s.name = 'Артём Кузнецов'
  and not exists (select 1 from public.feedback f where f.student_id = s.id);
