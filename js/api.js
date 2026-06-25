/* ============================================================
   СЛОЙ ДОСТУПА К ДАННЫМ (facade).
   Все страницы вызывают только api.*, и НЕ знают, откуда данные.
   Сейчас USE_MOCK = true → данные из mock.js (localStorage).
   На Этапе C переключим на Supabase, переписав только этот файл.
   ============================================================ */

const USE_MOCK = false;

const api = (() => {

  // ----- клиент Supabase (создаётся, если подключена библиотека) -----
  const sb = (typeof window !== "undefined" && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // ----- helpers -----
  const KEY_SESSION = "tutor_session";

  function setSession(user) { sessionStorage.setItem(KEY_SESSION, JSON.stringify(user)); }
  function getSession()     { try { return JSON.parse(sessionStorage.getItem(KEY_SESSION)); } catch { return null; } }
  function clearSession()   { sessionStorage.removeItem(KEY_SESSION); if (sb) sb.auth.signOut(); }

  // "проведённым" считаем урок со статусом done.
  // Опционально: урок в прошлом со статусом scheduled тоже можно считать
  // проведённым автоматически (см. lessonsUsed ниже).
  function lessonsUsed(lessons) {
    return lessons.filter(l => l.status === "done").length;
  }

  // ============ MOCK-РЕАЛИЗАЦИЯ ============
  const mock = {
    async login(login, password) {
      const db = loadDB();
      const u = db.users.find(x => x.login === login && x.password === password);
      if (!u) throw new Error("Неверный логин или пароль");
      const user = { login: u.login, role: u.role, name: u.name, studentId: u.studentId || null };
      setSession(user);
      return user;
    },

    async getStudent(studentId) {
      const db = loadDB();
      return db.students.find(s => s.id === studentId) || null;
    },

    async getStudents() {
      return loadDB().students;
    },

    async getLessons(studentId) {
      return loadDB().lessons
        .filter(l => l.studentId === studentId)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    async getHomeworks(studentId) {
      return loadDB().homeworks
        .filter(h => h.studentId === studentId)
        .sort((a, b) => new Date(a.due) - new Date(b.due));
    },

    async getFeedback(studentId) {
      return loadDB().feedback
        .filter(f => f.studentId === studentId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // ---- админ-операции ----
    // Родительский логин формируется автоматически как "<логин ученика>_parent".
    async createStudent({ name, course, studentLogin, password, lessonsPaid }) {
      const db = loadDB();
      const parentLogin = studentLogin + "_parent";
      if (db.users.some(u => u.login === studentLogin || u.login === parentLogin)) {
        throw new Error("Такой логин уже занят");
      }
      const id = "s" + Date.now();
      db.students.push({ id, name, course, lessonsPaid: Math.max(0, lessonsPaid || 0) });
      db.users.push({ login: studentLogin, password, role: "student", name, studentId: id });
      db.users.push({ login: parentLogin, password, role: "parent", name: `Родитель: ${name}`, studentId: id });
      saveDB(db);
      return { id, studentLogin, parentLogin, password };
    },

    // Возвращает оба логина ученика ({ studentLogin, parentLogin }).
    async getLogins(studentId) {
      const db = loadDB();
      const st = db.users.find(x => x.role === "student" && x.studentId === studentId);
      const pa = db.users.find(x => x.role === "parent"  && x.studentId === studentId);
      return { studentLogin: st ? st.login : null, parentLogin: pa ? pa.login : null };
    },

    async setLessonsPaid(studentId, value) {
      const db = loadDB();
      const s = db.students.find(x => x.id === studentId);
      if (s) { s.lessonsPaid = Math.max(0, value); saveDB(db); }
      return s;
    },

    async addLesson(studentId, date, topic) {
      const db = loadDB();
      db.lessons.push({ id: "l" + Date.now(), studentId, date, topic, status: "scheduled" });
      saveDB(db);
    },

    async markLessonDone(lessonId) {
      const db = loadDB();
      const l = db.lessons.find(x => x.id === lessonId);
      if (l) { l.status = "done"; saveDB(db); }
    },

    async markHomeworkDone(homeworkId) {
      const db = loadDB();
      const h = db.homeworks.find(x => x.id === homeworkId);
      if (h) { h.status = "done"; saveDB(db); }
    },

    async addHomework(studentId, title, desc, due) {
      const db = loadDB();
      db.homeworks.push({ id: "h" + Date.now(), studentId, title, desc, due, status: "open" });
      saveDB(db);
    },

    async addFeedback(studentId, text, scores) {
      const db = loadDB();
      db.feedback.push({ id: "f" + Date.now(), studentId, date: new Date().toISOString(), text, scores: scores || null });
      saveDB(db);
    },

    // Локальный черновик ОС без нейронки (мок-режим).
    async generateFeedback(scores) {
      const s = scores || {};
      const word = v => v >= 9 ? "отлично" : v >= 7 ? "хорошо" : v >= 5 ? "средне" : "пока слабо";
      return {
        text: `Понимание — ${word(s.understanding)}, самостоятельность — ${word(s.independence)}, ` +
              `домашние задания — ${word(s.homework)}, вовлечённость — ${word(s.engagement)}. ` +
              `(Черновик мок-режима, нейронка отключена.)`,
      };
    },
  };

  // ============ SUPABASE-РЕАЛИЗАЦИЯ ============
  // Преобразование snake_case (БД) → camelCase (приложение)
  const mapStudent = r => ({ id: r.id, name: r.name, course: r.course, lessonsPaid: r.lessons_paid });
  const mapLesson  = r => ({ id: r.id, studentId: r.student_id, date: r.date, topic: r.topic, status: r.status });
  const mapHw      = r => ({ id: r.id, studentId: r.student_id, title: r.title, desc: r.description, due: r.due, status: r.status });
  const mapFb      = r => ({ id: r.id, studentId: r.student_id, date: r.created_at, text: r.text,
                             scores: { understanding: r.understanding, independence: r.independence,
                                       homework: r.homework, engagement: r.engagement } });

  function must(error) { if (error) throw new Error(error.message || "Ошибка запроса"); }

  const supa = {
    async login(login, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: loginToEmail(login), password });
      if (error) throw new Error("Неверный логин или пароль");
      const { data: prof, error: pe } = await sb
        .from("profiles").select("role, student_id, name").eq("id", data.user.id).single();
      if (pe || !prof) { await sb.auth.signOut(); throw new Error("Профиль не найден"); }
      const user = { login, role: prof.role, name: prof.name, studentId: prof.student_id };
      setSession(user);
      return user;
    },

    async getStudent(studentId) {
      const { data, error } = await sb.from("students").select("*").eq("id", studentId).single();
      if (error) return null;
      return mapStudent(data);
    },

    async getStudents() {
      const { data, error } = await sb.from("students").select("*").order("created_at", { ascending: true });
      must(error);
      return data.map(mapStudent);
    },

    async getLessons(studentId) {
      const { data, error } = await sb.from("lessons").select("*")
        .eq("student_id", studentId).order("date", { ascending: true });
      must(error);
      return data.map(mapLesson);
    },

    async getHomeworks(studentId) {
      const { data, error } = await sb.from("homeworks").select("*")
        .eq("student_id", studentId).order("due", { ascending: true });
      must(error);
      return data.map(mapHw);
    },

    async getFeedback(studentId) {
      const { data, error } = await sb.from("feedback").select("*")
        .eq("student_id", studentId).order("created_at", { ascending: false });
      must(error);
      return data.map(mapFb);
    },

    async getLogins(studentId) {
      const { data, error } = await sb.from("profiles").select("role, login").eq("student_id", studentId);
      if (error) return { studentLogin: null, parentLogin: null };
      const st = data.find(p => p.role === "student");
      const pa = data.find(p => p.role === "parent");
      return { studentLogin: st ? st.login : null, parentLogin: pa ? pa.login : null };
    },

    // Создание ученика — через Edge Function create-student (нужны админ-права).
    async createStudent(payload) {
      const { data, error } = await sb.functions.invoke("create-student", { body: payload });
      if (error) {
        let msg = error.message || "Не удалось создать ученика";
        try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (_) {}
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },

    async setLessonsPaid(studentId, value) {
      const { error } = await sb.from("students").update({ lessons_paid: Math.max(0, value) }).eq("id", studentId);
      must(error);
    },

    async addLesson(studentId, date, topic) {
      const { error } = await sb.from("lessons").insert({ student_id: studentId, date, topic });
      must(error);
    },

    async markLessonDone(lessonId) {
      const { error } = await sb.from("lessons").update({ status: "done" }).eq("id", lessonId);
      must(error);
    },

    async markHomeworkDone(homeworkId) {
      const { error } = await sb.from("homeworks").update({ status: "done" }).eq("id", homeworkId);
      must(error);
    },

    async addHomework(studentId, title, desc, due) {
      const { error } = await sb.from("homeworks").insert({ student_id: studentId, title, description: desc, due });
      must(error);
    },

    async addFeedback(studentId, text, scores) {
      const s = scores || {};
      const { error } = await sb.from("feedback").insert({
        student_id: studentId, text,
        understanding: s.understanding, independence: s.independence,
        homework: s.homework, engagement: s.engagement,
      });
      must(error);
    },

    // Генерация черновика ОС нейронкой — через Edge Function generate-feedback.
    // scores = { understanding, independence, engagement, hint? }. Возвращает { text }.
    async generateFeedback(scores) {
      // Локальная разработка: до деплоя функции ходим в dev_server.py.
      if (["localhost", "127.0.0.1"].includes(location.hostname)) {
        const r = await fetch("/dev/generate-feedback", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scores),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || `Локальный сервер: ${r.status}`);
        return d;
      }
      const { data, error } = await sb.functions.invoke("generate-feedback", { body: scores });
      if (error) {
        let msg = error.message || "Не удалось сгенерировать обратную связь";
        try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (_) {}
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },
  };

  const impl = USE_MOCK ? mock : supa;

  return {
    ...impl,
    getSession, clearSession,
    lessonsUsed,
  };
})();
