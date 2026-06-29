/* ============================================================
   Кабинет ученика.
   ============================================================ */

(async function () {
  const user = await requireRole(["student"]);
  if (!user) return;

  renderUserChip(document.getElementById("userchip"), user);

  const student   = await api.getStudent(user.studentId);
  const lessons   = await api.getLessons(user.studentId);
  const homeworks = await api.getHomeworks(user.studentId);

  if (!student) { document.getElementById("hello").textContent = "Ученик не найден"; return; }

  // ---- Шапка ----
  const firstName = student.name.split(" ")[0];
  document.getElementById("hello").textContent = `Привет, ${firstName}! 👋`;
  document.getElementById("course").textContent = student.course;

  // ---- Метрика: оплаченные занятия ----
  const used = api.lessonsUsed(lessons);
  const left = Math.max(0, student.lessonsPaid - used);
  document.getElementById("m-left").textContent = left;
  document.getElementById("m-paid").textContent = `Проведено ${used} из ${student.lessonsPaid} оплаченных`;
  document.getElementById("m-progress").style.width =
    (student.lessonsPaid ? Math.min(100, used / student.lessonsPaid * 100) : 0) + "%";

  // предупреждение, если занятий мало
  if (left <= 2) {
    const m = document.querySelector("#m-left").closest(".card");
    m.querySelector(".card-title").insertAdjacentHTML("beforeend",
      ` <span class="badge danger" style="margin-left:auto;">пора продлить</span>`);
  }

  // ---- Метрика: следующий урок ----
  const now = new Date();
  const next = lessons.find(l => l.status === "scheduled" && new Date(l.date) >= now);
  const nextEl = document.getElementById("next-lesson");
  if (next) {
    nextEl.innerHTML = `
      <div class="metric brand"><span class="big mono">${fmtDate(next.date)}</span></div>
      <div class="flex" style="margin-top:8px; gap:8px;">
        <span class="badge">${fmtWeekday(next.date)}, ${fmtTime(next.date)}</span>
        <span class="badge live"><span class="pulse"></span>${relDays(next.date)}</span>
      </div>
      <div class="muted" style="margin-top:10px;">${next.topic}</div>`;
  } else {
    nextEl.innerHTML = `<p class="muted mb-0">Урок ещё не назначен.</p>`;
  }

  // ---- Метрика: домашки ----
  const openHw = homeworks.filter(h => h.status === "open");
  document.getElementById("m-hw").textContent = openHw.length;
  const nearest = openHw.slice().sort((a, b) => new Date(a.due) - new Date(b.due))[0];
  document.getElementById("m-hw-next").textContent =
    nearest ? `Ближайший дедлайн: ${fmtDate(nearest.due)} (${relDays(nearest.due)})` : "Всё сдано 🎉";

  // ---- Список домашек ----
  const hwList = document.getElementById("hw-list");
  if (!homeworks.length) {
    hwList.innerHTML = `<p class="muted">Домашних заданий пока нет.</p>`;
  } else {
    hwList.innerHTML = homeworks.map(h => {
      const overdue = h.status === "open" && new Date(h.due) < now;
      const badge = h.status === "done"
        ? `<span class="badge ok">сдано</span>`
        : overdue
          ? `<span class="badge danger">просрочено</span>`
          : `<span class="badge warn">до ${fmtDate(h.due)}</span>`;
      return `
        <div class="row ${h.status === "done" ? "done" : ""}">
          <div class="main">
            <div class="t">${h.title}</div>
            <div class="s">${h.desc}</div>
          </div>
          ${badge}
        </div>`;
    }).join("");
  }

  // ---- Список занятий ----
  const lsList = document.getElementById("lessons-list");
  lsList.innerHTML = lessons.map(l => {
    const isNext = next && l.id === next.id;
    const badge = l.status === "done"
      ? `<span class="badge ok">проведён</span>`
      : l.status === "canceled"
        ? `<span class="badge danger">отменён</span>`
        : isNext
          ? `<span class="badge live"><span class="pulse"></span>следующий</span>`
          : `<span class="badge">запланирован</span>`;
    return `
      <div class="row ${l.status === "done" ? "done" : ""} ${isNext ? "next" : ""}">
        <div class="when">${fmtDate(l.date)}<br><span class="muted" style="font-weight:400;">${fmtTime(l.date)}</span></div>
        <div class="main"><div class="t">${l.topic}</div><div class="s">${fmtWeekday(l.date)}</div></div>
        ${badge}
      </div>`;
  }).join("");
})();
