/* ============================================================
   Авторизация и защита страниц.
   ============================================================ */

// Куда отправлять после входа в зависимости от роли
const ROLE_HOME = {
  admin:   "admin.html",
  parent:  "parent.html",
  student: "student.html",
};

// Защита страницы: вызвать вверху каждого кабинета через await.
// allowed — массив ролей, которым можно сюда.
async function requireRole(allowed) {
  const user = api.getSession();
  if (!user) { location.replace("index.html"); return null; }
  // Серверная сессия могла протухнуть (напр. вкладка спала ночь) — проверяем
  // и при необходимости обновляем токен. Если её нет — на вход, а не «не найдено».
  const session = await api.ensureSession();
  if (!session) { api.clearSession(); location.replace("index.html"); return null; }
  if (!allowed.includes(user.role)) { location.replace(ROLE_HOME[user.role] || "index.html"); return null; }
  return user;
}

function logout() {
  api.clearSession();
  location.replace("index.html");
}

// Рендер плашки пользователя в правом верхнем углу
function renderUserChip(el, user) {
  const initials = (user.name || user.login).trim().slice(0, 1).toUpperCase();
  el.innerHTML = `
    <span class="avatar">${initials}</span>
    <span>${user.name || user.login}</span>
    <button class="btn btn-ghost btn-sm" onclick="logout()">Выйти</button>
  `;
}
