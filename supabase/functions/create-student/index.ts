// ============================================================
//  Edge Function: create-student
//  Создаёт ученика: два auth-аккаунта (ученик + родитель),
//  строку students и два профиля. Доступно только админу.
//
//  SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//  подставляются платформой автоматически — настраивать не нужно.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_DOMAIN = "codeclass.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // service-клиент: обходит RLS, умеет создавать пользователей
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // --- 1) проверяем, что вызывающий вошёл и он админ ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Не авторизован" }, 401);

    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (!prof || prof.role !== "admin") {
      return json({ error: "Нужны права администратора" }, 403);
    }

    // --- 2) входные данные ---
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const course = String(body.course ?? "Программирование").trim() || "Программирование";
    const studentLogin = String(body.studentLogin ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const lessonsPaid = Math.max(0, parseInt(body.lessonsPaid) || 0);
    const parentLogin = studentLogin + "_parent";

    if (!name || !studentLogin || !password) {
      return json({ error: "Заполните имя, логин и пароль" }, 400);
    }
    if (!/^[a-z0-9_]+$/.test(studentLogin)) {
      return json({ error: "Логин: только латиница, цифры и _" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Пароль не короче 6 символов" }, 400);
    }

    const studentEmail = `${studentLogin}@${EMAIL_DOMAIN}`;
    const parentEmail = `${parentLogin}@${EMAIL_DOMAIN}`;

    // --- 3) строка ученика ---
    const { data: student, error: serr } = await admin
      .from("students").insert({ name, course, lessons_paid: lessonsPaid })
      .select().single();
    if (serr) return json({ error: serr.message }, 400);

    const cleanupStudent = () => admin.from("students").delete().eq("id", student.id);

    // --- 4) auth-аккаунты (с откатом при ошибке) ---
    const { data: su, error: suerr } = await admin.auth.admin.createUser({
      email: studentEmail, password, email_confirm: true,
    });
    if (suerr) {
      await cleanupStudent();
      return json({ error: `Логин «${studentLogin}» уже занят` }, 400);
    }

    const { data: pu, error: puerr } = await admin.auth.admin.createUser({
      email: parentEmail, password, email_confirm: true,
    });
    if (puerr) {
      await admin.auth.admin.deleteUser(su.user.id);
      await cleanupStudent();
      return json({ error: `Логин «${parentLogin}» уже занят` }, 400);
    }

    // --- 5) профили ---
    const { error: perr } = await admin.from("profiles").insert([
      { id: su.user.id, role: "student", student_id: student.id, name, login: studentLogin },
      { id: pu.user.id, role: "parent",  student_id: student.id, name: `Родитель: ${name}`, login: parentLogin },
    ]);
    if (perr) {
      await admin.auth.admin.deleteUser(su.user.id);
      await admin.auth.admin.deleteUser(pu.user.id);
      await cleanupStudent();
      return json({ error: perr.message }, 400);
    }

    return json({ id: student.id, studentLogin, parentLogin, password });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
