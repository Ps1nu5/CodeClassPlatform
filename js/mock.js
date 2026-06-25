/* ============================================================
   МОК-ДАННЫЕ для разработки без бэкенда.
   Хранятся в localStorage, чтобы изменения в админке "держались"
   между перезагрузками во время демо.
   На Этапе C этот файл не нужен — его заменит запрос к Supabase.
   ============================================================ */

const SEED = {
  // Пользователи: в реальности пароли хранит Supabase, здесь — только для демо
  users: [
    { login: "admin",         password: "admin",   role: "admin",  name: "Преподаватель" },
    { login: "artem",         password: "demo123", role: "student", name: "Артём", studentId: "s1" },
    { login: "artem_parent",  password: "demo123", role: "parent", name: "Родитель Артёма", studentId: "s1" },
  ],

  students: [
    { id: "s1", name: "Артём Кузнецов", course: "Python для начинающих", lessonsPaid: 12 },
  ],

  // status: scheduled | done | canceled
  lessons: [
    { id: "l1", studentId: "s1", date: daysFromNow(-14, 18, 0), topic: "Переменные и типы данных", status: "done" },
    { id: "l2", studentId: "s1", date: daysFromNow(-10, 18, 0), topic: "Условия и ветвления",       status: "done" },
    { id: "l3", studentId: "s1", date: daysFromNow(-7, 18, 0),  topic: "Циклы while и for",          status: "done" },
    { id: "l4", studentId: "s1", date: daysFromNow(-3, 18, 0),  topic: "Списки и кортежи",           status: "done" },
    { id: "l5", studentId: "s1", date: daysFromNow(2, 18, 0),   topic: "Функции",                    status: "scheduled" },
    { id: "l6", studentId: "s1", date: daysFromNow(5, 18, 0),   topic: "Словари",                    status: "scheduled" },
    { id: "l7", studentId: "s1", date: daysFromNow(9, 18, 0),   topic: "Работа с файлами",           status: "scheduled" },
  ],

  // status: open | done
  homeworks: [
    { id: "h1", studentId: "s1", title: "Калькулятор на if/else", desc: "Написать программу, которая считает скидку по сумме чека.", due: daysFromNow(1, 18, 0), status: "open" },
    { id: "h2", studentId: "s1", title: "Числа Фибоначчи циклом", desc: "Вывести первые 15 чисел Фибоначчи через while.", due: daysFromNow(4, 18, 0), status: "open" },
    { id: "h3", studentId: "s1", title: "Сортировка списка", desc: "Отсортировать список оценок без sorted().", due: daysFromNow(-2, 18, 0), status: "done" },
  ],

  feedback: [
    { id: "f1", studentId: "s1", date: daysFromNow(-3, 19, 0),
      text: "Артём хорошо разобрался с циклами, активно задаёт вопросы. Рекомендую закрепить тему списков дома.",
      scores: { understanding: 8, independence: 6, engagement: 9 } },
  ],
};

function daysFromNow(days, hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const DB_KEY = "tutor_mock_db_v1";

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* пересоздадим */ }
  }
  const fresh = JSON.parse(JSON.stringify(SEED));
  localStorage.setItem(DB_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// Сброс демо-данных (пригодится при разработке)
window.resetMockDB = function () {
  localStorage.removeItem(DB_KEY);
  location.reload();
};
