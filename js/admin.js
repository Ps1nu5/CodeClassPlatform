/* ============================================================
   Админка преподавателя.
   ============================================================ */

(function () {
  const user = requireRole(["admin"]);
  if (!user) return;
  renderUserChip(document.getElementById("userchip"), user);

  let selectedId = null;

  // ---------- Список учеников ----------
  async function renderStudents() {
    const students = await api.getStudents();
    const box = document.getElementById("students-list");
    if (!students.length) { box.innerHTML = `<p class="muted">Пока нет учеников.</p>`; return; }

    const rows = await Promise.all(students.map(async s => {
      const lessons = await api.getLessons(s.id);
      const left = Math.max(0, s.lessonsPaid - api.lessonsUsed(lessons));
      const low = left <= 2 ? "danger" : "";
      const active = s.id === selectedId ? "next" : "";
      return `
        <div class="row ${active}" style="cursor:pointer;" data-id="${s.id}">
          <div class="main">
            <div class="t">${s.name}</div>
            <div class="s">${s.course}</div>
          </div>
          <span class="badge ${low}">${left} зан.</span>
        </div>`;
    }));
    box.innerHTML = rows.join("");
    box.querySelectorAll("[data-id]").forEach(el =>
      el.addEventListener("click", () => { selectedId = el.dataset.id; render(); }));
  }

  // ---------- Детальная панель ----------
  async function renderDetail() {
    const box = document.getElementById("detail");
    if (!selectedId) { box.innerHTML = `<div class="card"><p class="muted mb-0">Выберите ученика слева или создайте нового.</p></div>`; return; }

    const s = await api.getStudent(selectedId);
    if (!s) { selectedId = null; return renderDetail(); }
    const lessons   = await api.getLessons(selectedId);
    const homeworks = await api.getHomeworks(selectedId);
    const feedback  = await api.getFeedback(selectedId);
    const { studentLogin, parentLogin } = await api.getLogins(selectedId);
    const used = api.lessonsUsed(lessons);
    const left = Math.max(0, s.lessonsPaid - used);

    box.innerHTML = `
      <div class="stack">
        <!-- Шапка ученика -->
        <div class="card">
          <div class="flex between">
            <div>
              <h2 class="mb-0">${s.name}</h2>
              <div class="muted">${s.course}</div>
            </div>
            <div class="metric warn"><span class="big mono">${left}</span><span class="unit">осталось</span></div>
          </div>
          <div class="muted" style="margin-top:8px; font-size:.85rem;">
            Ученик: <span class="mono">${studentLogin || "—"}</span> ·
            Родитель: <span class="mono">${parentLogin || "—"}</span> ·
            Проведено ${used} из ${s.lessonsPaid}
          </div>
        </div>

        <!-- Управление оплаченными занятиями -->
        <div class="card tight">
          <div class="card-title"><span class="dot"></span> Оплаченные занятия</div>
          <div class="flex" style="gap:8px;">
            <button class="btn btn-ghost btn-sm" data-paid="-1">−1</button>
            <input class="input mono" id="paid-input" type="number" min="0" value="${s.lessonsPaid}" style="width:90px; text-align:center;">
            <button class="btn btn-ghost btn-sm" data-paid="+1">+1</button>
            <button class="btn btn-primary btn-sm" id="paid-save">Сохранить</button>
            <span class="muted" style="font-size:.82rem;">списываются автоматически при отметке урока «проведён»</span>
          </div>
        </div>

        <!-- Занятия -->
        <div class="card">
          <div class="card-title"><span class="dot"></span> Занятия</div>
          <div class="list" id="adm-lessons">${lessons.map(lessonRow).join("") || `<p class="muted">Нет занятий.</p>`}</div>
          <div class="flex" style="gap:8px; margin-top:12px; flex-wrap:wrap;">
            <input class="input" id="l-topic" placeholder="Тема урока" style="flex:1; min-width:160px;">
            <input class="input" id="l-date" type="datetime-local" style="width:210px;">
            <button class="btn btn-primary btn-sm" id="l-add">Добавить урок</button>
          </div>
        </div>

        <!-- Домашки -->
        <div class="card">
          <div class="card-title"><span class="dot"></span> Домашние задания</div>
          <div class="list" id="adm-hw">${renderHwList(homeworks)}</div>
          <div class="stack" style="gap:8px; margin-top:12px;">
            <input class="input" id="h-title" placeholder="Название задания">
            <input class="input" id="h-desc" placeholder="Описание">
            <div class="flex" style="gap:8px;">
              <input class="input" id="h-due" type="datetime-local" style="width:210px;">
              <button class="btn btn-primary btn-sm" id="h-add">Выдать домашку</button>
            </div>
          </div>
        </div>

        <!-- Обратная связь родителю -->
        <div class="card">
          <div class="card-title"><span class="dot"></span> Обратная связь родителю
            <span class="badge" style="margin-left:auto;">видит только родитель</span>
          </div>
          <div class="list" id="adm-fb">${renderFeedbackList(feedback.map(fbRow), "Пока нет записей.")}</div>
          <div class="stack" style="gap:12px; margin-top:14px;">
            <div class="scores-edit">
              ${FEEDBACK_METRICS.map(m => `
                <div class="score">
                  <div class="score-head"><span>${m.label}</span><span class="mono fb-val" id="fbval-${m.key}">7</span></div>
                  <input type="range" min="1" max="10" value="7" class="slider" id="fb-${m.key}" data-key="${m.key}">
                </div>`).join("")}
            </div>
            <textarea class="input" id="fb-text" rows="3" placeholder="Например: Артём хорошо освоил циклы, но дома не делал домашку. Рекомендую закрепить тему списков."></textarea>
            <div><button class="btn btn-primary btn-sm" id="fb-add">Отправить родителю</button></div>
          </div>
        </div>
      </div>`;

    wireDetail();
  }

  function lessonRow(l) {
    const badge = l.status === "done"
      ? `<span class="badge ok">проведён</span>`
      : `<button class="btn btn-ghost btn-sm" data-done="${l.id}">Отметить проведённым</button>`;
    return `
      <div class="row ${l.status === "done" ? "done" : ""}">
        <div class="when">${fmtDate(l.date)}<br><span class="muted" style="font-weight:400;">${fmtTime(l.date)}</span></div>
        <div class="main"><div class="t">${l.topic}</div></div>
        ${badge}
      </div>`;
  }

  function fbRow(f) {
    return `
      <div class="row" style="align-items:flex-start; flex-direction:column; gap:10px;">
        <div class="flex" style="gap:14px; width:100%; align-items:flex-start;">
          <div class="when" style="min-width:64px;">${fmtDate(f.date)}</div>
          <div class="main"><div class="s" style="color:var(--ink);">${f.text}</div></div>
        </div>
        ${renderScores(f.scores)}
      </div>`;
  }

  function hwRow(h) {
    if (h.status === "done") {
      return `
        <div class="row done">
          <div class="main"><div class="t">${h.title}</div><div class="s">${h.desc}</div></div>
          <span class="badge ok">сдано</span>
        </div>`;
    }
    const overdue = new Date(h.due) < new Date();
    const badge = overdue
      ? `<span class="badge danger">просрочено</span>`
      : `<span class="badge warn">до ${fmtDate(h.due)}</span>`;
    return `
      <div class="row">
        <div class="main"><div class="t">${h.title}</div><div class="s">${h.desc}</div></div>
        ${badge}
        <button class="btn btn-ghost btn-sm" data-hwdone="${h.id}">Выполнено</button>
      </div>`;
  }

  // По умолчанию видны только невыполненные; выполненные — под спойлером.
  function renderHwList(homeworks) {
    const open = homeworks.filter(h => h.status !== "done");
    const done = homeworks.filter(h => h.status === "done");
    const openHtml = open.length
      ? open.map(hwRow).join("")
      : `<p class="muted">Невыполненных домашек нет.</p>`;
    const doneHtml = done.length
      ? `<details class="fb-history">
           <summary>Выполненные (${done.length})</summary>
           <div class="fb-history-body">${done.map(hwRow).join("")}</div>
         </details>`
      : "";
    return openHtml + doneHtml;
  }

  function wireDetail() {
    // оплаченные занятия
    const input = document.getElementById("paid-input");
    document.querySelectorAll("[data-paid]").forEach(b =>
      b.addEventListener("click", () => { input.value = Math.max(0, (+input.value || 0) + (b.dataset.paid === "+1" ? 1 : -1)); }));
    document.getElementById("paid-save").addEventListener("click", async () => {
      await api.setLessonsPaid(selectedId, +input.value || 0);
      render();
    });

    // отметить урок проведённым
    document.querySelectorAll("[data-done]").forEach(b =>
      b.addEventListener("click", async () => { await api.markLessonDone(b.dataset.done); render(); }));

    // отметить домашку выполненной
    document.querySelectorAll("[data-hwdone]").forEach(b =>
      b.addEventListener("click", async () => { await api.markHomeworkDone(b.dataset.hwdone); render(); }));

    // добавить урок
    document.getElementById("l-add").addEventListener("click", async () => {
      const topic = document.getElementById("l-topic").value.trim();
      const date  = document.getElementById("l-date").value;
      if (!topic || !date) return;
      await api.addLesson(selectedId, new Date(date).toISOString(), topic);
      render();
    });

    // выдать домашку
    document.getElementById("h-add").addEventListener("click", async () => {
      const title = document.getElementById("h-title").value.trim();
      const desc  = document.getElementById("h-desc").value.trim();
      const due   = document.getElementById("h-due").value;
      if (!title || !due) return;
      await api.addHomework(selectedId, title, desc, new Date(due).toISOString());
      render();
    });

    // живые значения ползунков
    FEEDBACK_METRICS.forEach(m => {
      const sl = document.getElementById("fb-" + m.key);
      const val = document.getElementById("fbval-" + m.key);
      sl.addEventListener("input", () => {
        val.textContent = sl.value;
        val.style.color = scoreColor(+sl.value);
      });
    });

    // отправить обратную связь
    document.getElementById("fb-add").addEventListener("click", async () => {
      const text = document.getElementById("fb-text").value.trim();
      if (!text) return;
      const scores = {};
      FEEDBACK_METRICS.forEach(m => { scores[m.key] = +document.getElementById("fb-" + m.key).value; });
      await api.addFeedback(selectedId, text, scores);
      render();
    });
  }

  // ---------- Создание ученика ----------
  function wireNewForm() {
    const form = document.getElementById("new-form");
    document.getElementById("btn-new").addEventListener("click", () => {
      form.style.display = form.style.display === "none" ? "block" : "none";
    });

    // живой предпросмотр родительского логина
    const loginInput = document.getElementById("n-login");
    const parentPreview = document.getElementById("n-parent-preview");
    loginInput.addEventListener("input", () => {
      const v = loginInput.value.trim();
      parentPreview.textContent = v ? v + "_parent" : "—";
    });

    document.getElementById("n-gen").addEventListener("click", () => {
      document.getElementById("n-pass").value = Math.random().toString(36).slice(2, 8) +
        Math.floor(Math.random() * 90 + 10);
    });

    document.getElementById("n-create").addEventListener("click", async () => {
      const err = document.getElementById("n-err");
      err.textContent = "";
      const name  = document.getElementById("n-name").value.trim();
      const login = document.getElementById("n-login").value.trim();
      const pass  = document.getElementById("n-pass").value.trim();
      if (!name || !login || !pass) { err.textContent = "Заполните имя, логин и пароль"; return; }
      try {
        const res = await api.createStudent({
          name,
          course: document.getElementById("n-course").value.trim() || "Программирование",
          studentLogin: login,
          password: pass,
          lessonsPaid: +document.getElementById("n-paid").value || 0,
        });
        // показать выданные доступы
        alert(`Ученик создан!\n\nДоступы:\nУченик:   ${res.studentLogin} / ${res.password}\nРодитель: ${res.parentLogin} / ${res.password}`);
        form.style.display = "none";
        ["n-name", "n-course", "n-login", "n-pass"].forEach(id => document.getElementById(id).value = "");
        parentPreview.textContent = "—";
        selectedId = res.id;
        render();
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  async function render() { await renderStudents(); await renderDetail(); }

  wireNewForm();
  render();
})();
