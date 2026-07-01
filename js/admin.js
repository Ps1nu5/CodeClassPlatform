/* ============================================================
   Админка преподавателя.
   ============================================================ */

(async function () {
  const user = await requireRole(["admin"]);
  if (!user) return;
  renderUserChip(document.getElementById("userchip"), user);

  let selectedId = null;
  // что сейчас редактируется инлайн: id урока/домашки или флаг ученика
  let editing = { lesson: null, hw: null, student: false };

  // экранирование для значений в value="..." (чтобы кавычки не ломали разметку)
  const attr = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function resetEditing() { editing = { lesson: null, hw: null, student: false }; }

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
      el.addEventListener("click", () => { selectedId = el.dataset.id; resetEditing(); render(); }));
  }

  // ---------- Детальная панель ----------
  async function renderDetail() {
    const box = document.getElementById("detail");
    if (!selectedId) { box.innerHTML = `<div class="card"><p class="muted mb-0">Выберите ученика слева или создайте нового.</p></div>`; return; }

    // параллельно — чтобы деталь ученика не грузилась 5 запросами подряд
    const [s, lessons, homeworks, feedback, logins] = await Promise.all([
      api.getStudent(selectedId),
      api.getLessons(selectedId),
      api.getHomeworks(selectedId),
      api.getFeedback(selectedId),
      api.getLogins(selectedId),
    ]);
    if (!s) { selectedId = null; return renderDetail(); }
    const { studentLogin, parentLogin } = logins;
    const used = api.lessonsUsed(lessons);
    const left = Math.max(0, s.lessonsPaid - used);

    // --- шапка ученика (с инлайн-редактированием) ---
    const header = editing.student
      ? `<div class="flex between" style="gap:12px; align-items:flex-start;">
           <div class="stack" style="gap:8px; flex:1;">
             <input class="input" id="se-name" value="${attr(s.name)}" placeholder="Имя ученика">
             <input class="input" id="se-course" value="${attr(s.course)}" placeholder="Курс">
             <div class="flex" style="gap:8px;">
               <button class="btn btn-primary btn-sm" id="se-save">Сохранить</button>
               <button class="btn btn-ghost btn-sm" id="se-canceledit">Отмена</button>
             </div>
           </div>
           <div class="metric warn"><span class="big mono">${left}</span><span class="unit">осталось</span></div>
         </div>`
      : `<div class="flex between">
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
           <button class="btn btn-ghost btn-sm" id="s-edit" style="margin-left:8px;">✎ изменить</button>
         </div>`;

    box.innerHTML = `
      <div class="stack">
        <!-- Шапка ученика -->
        <div class="card">${header}</div>

        <!-- Управление занятиями: в поле — ОСТАЛОСЬ (с учётом проведённых) -->
        <div class="card tight">
          <div class="card-title"><span class="dot"></span> Осталось занятий</div>
          <div class="flex" style="gap:8px;">
            <button class="btn btn-ghost btn-sm" data-paid="-1">−1</button>
            <input class="input mono" id="paid-input" type="number" min="0" value="${left}" style="width:90px; text-align:center;">
            <button class="btn btn-ghost btn-sm" data-paid="+1">+1</button>
            <button class="btn btn-primary btn-sm" id="paid-save">Сохранить</button>
            <span class="muted" style="font-size:.82rem;">всего оплачено: ${s.lessonsPaid} · списываются автоматически при отметке «проведён»</span>
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
            <div class="flex" style="gap:8px; flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" id="fb-gen">✨ Сгенерировать ОС</button>
              <button class="btn btn-primary btn-sm" id="fb-add">Отправить родителю</button>
              <span class="muted" style="font-size:.8rem;">черновик от нейронки можно отредактировать</span>
            </div>
            <div class="error" id="fb-err"></div>
          </div>
        </div>
      </div>`;

    wireDetail(used);
  }

  // ---------- Рендер строк ----------
  function lessonRow(l) {
    if (editing.lesson === l.id) {
      return `
        <div class="row" style="flex-wrap:wrap; gap:8px;">
          <input class="input" id="le-topic" value="${attr(l.topic)}" placeholder="Тема урока" style="flex:1; min-width:140px;">
          <input class="input" id="le-date" type="datetime-local" value="${toLocalInput(l.date)}" style="width:200px;">
          <button class="btn btn-primary btn-sm" data-lsave="${l.id}">Сохранить</button>
          <button class="btn btn-ghost btn-sm" data-lcanceledit="1">Отмена</button>
        </div>`;
    }
    const statusBadge = l.status === "done"
      ? `<span class="badge ok">проведён</span>`
      : l.status === "canceled"
        ? `<span class="badge danger">отменён</span>`
        : `<button class="btn btn-ghost btn-sm" data-done="${l.id}">Провести</button>`;
    const cancelBtn = l.status === "scheduled"
      ? `<button class="btn btn-ghost btn-sm" data-lcancel="${l.id}" title="Отменить урок">⊘</button>` : "";
    const revertBtn = (l.status === "done" || l.status === "canceled")
      ? `<button class="btn btn-ghost btn-sm" data-lrevert="${l.id}" title="Вернуть в запланированные">↩</button>` : "";
    const faded = (l.status === "done" || l.status === "canceled") ? "done" : "";
    return `
      <div class="row ${faded}">
        <div class="when">${fmtDate(l.date)}<br><span class="muted" style="font-weight:400;">${fmtTime(l.date)}</span></div>
        <div class="main"><div class="t">${l.topic}</div></div>
        <div class="flex" style="gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          ${statusBadge}${cancelBtn}${revertBtn}
          <button class="btn btn-ghost btn-sm" data-ledit="${l.id}" title="Изменить">✎</button>
          <button class="btn btn-ghost btn-sm" data-ldel="${l.id}" title="Удалить">🗑</button>
        </div>
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
    if (editing.hw === h.id) {
      return `
        <div class="row" style="flex-direction:column; align-items:stretch; gap:8px;">
          <input class="input" id="he-title" value="${attr(h.title)}" placeholder="Название задания">
          <input class="input" id="he-desc" value="${attr(h.desc)}" placeholder="Описание">
          <div class="flex" style="gap:8px; flex-wrap:wrap;">
            <input class="input" id="he-due" type="datetime-local" value="${toLocalInput(h.due)}" style="width:200px;">
            <button class="btn btn-primary btn-sm" data-hwsave="${h.id}">Сохранить</button>
            <button class="btn btn-ghost btn-sm" data-hwcanceledit="1">Отмена</button>
          </div>
        </div>`;
    }
    const done = h.status === "done";
    const overdue = !done && new Date(h.due) < new Date();
    const badge = done
      ? `<span class="badge ok">сдано</span>`
      : overdue ? `<span class="badge danger">просрочено</span>`
                : `<span class="badge warn">до ${fmtDate(h.due)}</span>`;
    const toggle = done
      ? `<button class="btn btn-ghost btn-sm" data-hwreopen="${h.id}" title="Вернуть в работу">↩</button>`
      : `<button class="btn btn-ghost btn-sm" data-hwdone="${h.id}">Выполнено</button>`;
    return `
      <div class="row ${done ? "done" : ""}">
        <div class="main"><div class="t">${h.title}</div><div class="s">${h.desc}</div></div>
        <div class="flex" style="gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          ${badge}${toggle}
          <button class="btn btn-ghost btn-sm" data-hwedit="${h.id}" title="Изменить">✎</button>
          <button class="btn btn-ghost btn-sm" data-hwdel="${h.id}" title="Удалить">🗑</button>
        </div>
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

  function wireDetail(used) {
    // в поле — ОСТАЛОСЬ занятий; всего оплачено = осталось + уже проведённые
    const input = document.getElementById("paid-input");
    document.querySelectorAll("[data-paid]").forEach(b =>
      b.addEventListener("click", () => { input.value = Math.max(0, (+input.value || 0) + (b.dataset.paid === "+1" ? 1 : -1)); }));
    document.getElementById("paid-save").addEventListener("click", async () => {
      await api.setLessonsPaid(selectedId, (+input.value || 0) + used);
      render();
    });

    // отметить урок проведённым
    document.querySelectorAll("[data-done]").forEach(b =>
      b.addEventListener("click", async () => { await api.markLessonDone(b.dataset.done); render(); }));

    // --- уроки: редактирование/отмена/возврат/удаление ---
    document.querySelectorAll("[data-ledit]").forEach(b =>
      b.addEventListener("click", () => { editing.lesson = b.dataset.ledit; renderDetail(); }));
    document.querySelector("[data-lcanceledit]")
      ?.addEventListener("click", () => { editing.lesson = null; renderDetail(); });
    document.querySelector("[data-lsave]")?.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.lsave;
      const topic = document.getElementById("le-topic").value.trim();
      const date  = document.getElementById("le-date").value;
      if (!topic || !date) return;
      await api.updateLesson(id, { topic, date: new Date(date).toISOString() });
      editing.lesson = null; render();
    });
    document.querySelectorAll("[data-lcancel]").forEach(b =>
      b.addEventListener("click", async () => { await api.setLessonStatus(b.dataset.lcancel, "canceled"); render(); }));
    document.querySelectorAll("[data-lrevert]").forEach(b =>
      b.addEventListener("click", async () => { await api.setLessonStatus(b.dataset.lrevert, "scheduled"); render(); }));
    document.querySelectorAll("[data-ldel]").forEach(b =>
      b.addEventListener("click", async () => { if (confirm("Удалить урок?")) { await api.deleteLesson(b.dataset.ldel); render(); } }));

    // --- домашки: выполнено/вернуть/редактирование/удаление ---
    document.querySelectorAll("[data-hwdone]").forEach(b =>
      b.addEventListener("click", async () => { await api.markHomeworkDone(b.dataset.hwdone); render(); }));
    document.querySelectorAll("[data-hwreopen]").forEach(b =>
      b.addEventListener("click", async () => { await api.setHomeworkStatus(b.dataset.hwreopen, "open"); render(); }));
    document.querySelectorAll("[data-hwedit]").forEach(b =>
      b.addEventListener("click", () => { editing.hw = b.dataset.hwedit; renderDetail(); }));
    document.querySelector("[data-hwcanceledit]")
      ?.addEventListener("click", () => { editing.hw = null; renderDetail(); });
    document.querySelector("[data-hwsave]")?.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.hwsave;
      const title = document.getElementById("he-title").value.trim();
      const desc  = document.getElementById("he-desc").value.trim();
      const due   = document.getElementById("he-due").value;
      if (!title || !due) return;
      await api.updateHomework(id, { title, desc, due: new Date(due).toISOString() });
      editing.hw = null; render();
    });
    document.querySelectorAll("[data-hwdel]").forEach(b =>
      b.addEventListener("click", async () => { if (confirm("Удалить домашнее задание?")) { await api.deleteHomework(b.dataset.hwdel); render(); } }));

    // --- ученик: редактирование имени/курса ---
    document.getElementById("s-edit")?.addEventListener("click", () => { editing.student = true; renderDetail(); });
    document.getElementById("se-canceledit")?.addEventListener("click", () => { editing.student = false; renderDetail(); });
    document.getElementById("se-save")?.addEventListener("click", async () => {
      const name   = document.getElementById("se-name").value.trim();
      const course = document.getElementById("se-course").value.trim();
      if (!name) return;
      await api.updateStudent(selectedId, { name, course: course || "Программирование" });
      editing.student = false; render();
    });

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

    // сгенерировать черновик ОС нейронкой по выставленным баллам
    document.getElementById("fb-gen").addEventListener("click", async () => {
      const btn = document.getElementById("fb-gen");
      const err = document.getElementById("fb-err");
      const textEl = document.getElementById("fb-text");
      err.textContent = "";
      const scores = {};
      FEEDBACK_METRICS.forEach(m => { scores[m.key] = +document.getElementById("fb-" + m.key).value; });
      const note = textEl.value.trim();
      if (note) scores.hint = note;  // текст в поле трактуем как подсказку для нейронки

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Генерирую…";
      try {
        const res = await api.generateFeedback(scores);
        textEl.value = res.text;
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
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
        resetEditing();
        render();
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  async function render() { await renderStudents(); await renderDetail(); }

  wireNewForm();
  render();
})();
