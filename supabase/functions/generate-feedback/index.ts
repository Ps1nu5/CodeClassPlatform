// ============================================================
//  Edge Function: generate-feedback
//  Генерирует черновик обратной связи родителю по четырём баллам
//  (понимание / самостоятельность / домашние задания / вовлечённость)
//  через Gemini. Доступно только админу. Ключ Gemini — секрет на сервере.
//
//  Перед деплоем задать секрет:
//    Supabase → Project Settings → Edge Functions → Secrets
//    GEMINI_API_KEY = <ключ из https://aistudio.google.com/apikey>
//  SUPABASE_URL / SUPABASE_ANON_KEY подставляются платформой.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Модель Gemini. 2.5-flash — быстрая и бесплатная на free-тарифе.
const GEMINI_MODEL = "gemini-2.5-flash";

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

function clamp10(x: unknown): number {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return 7;
  return Math.min(10, Math.max(1, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY не задан в секретах функции" }, 500);

    // --- 1) проверяем, что вызывающий вошёл и он админ ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Не авторизован" }, 401);

    const { data: prof } = await userClient
      .from("profiles").select("role").eq("id", user.id).single();
    if (!prof || prof.role !== "admin") {
      return json({ error: "Нужны права администратора" }, 403);
    }

    // --- 2) входные данные ---
    const body = await req.json().catch(() => ({}));
    const understanding = clamp10(body.understanding);
    const independence = clamp10(body.independence);
    const homework = clamp10(body.homework);
    const engagement = clamp10(body.engagement);
    const hint = String(body.hint ?? "").trim().slice(0, 500); // опц. заметка репетитора

    // --- 3) промпт ---
    const exampleFb = "«Иногда возникают сложности при выполнении дз. Но в остальном — " +
      "всё отлично. Хорошая вовлечённость, высокий интерес к предмету.»";
    const prompt = [
      "Ты — репетитор по программированию. Напиши родителю короткую обратную связь об",
      "ученике по итогам занятий — В ТОЧНОСТИ в таком же стиле, тоне и объёме, как в примере.",
      "",
      "Пример.",
      "Баллы: понимание 8, самостоятельность 9, домашние задания 6, вовлечённость 10.",
      `Обратная связь: ${exampleFb}`,
      "",
      "Стиль, которому строго следуй:",
      "— очень коротко, 2–3 простых предложения;",
      "— без приветствий, без обращений к родителю, без подписи;",
      "— спокойный, по-деловому доброжелательный тон, простые слова;",
      "— по сути: с чем бывают сложности и что получается хорошо;",
      "— без восклицаний, без «ваш ребёнок», без длинных рассуждений и советов;",
      "— не называй цифры и названия метрик, не используй списки.",
      "",
      "Теперь напиши обратную связь для:",
      `Баллы: понимание ${understanding}, самостоятельность ${independence}, ` +
        `домашние задания ${homework}, вовлечённость ${engagement}.`,
      hint ? `Заметка репетитора (учти по смыслу): ${hint}` : "",
      "",
      "Верни ТОЛЬКО текст обратной связи, без кавычек и пояснений.",
    ].join("\n");

    // --- 4) вызов Gemini ---
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // thinkingBudget=0 отключает «размышления» 2.5-flash, иначе они
        // съедают maxOutputTokens и ответ обрывается на первой строке.
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: `Ошибка Gemini (${resp.status})`, detail: detail.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim();

    if (!text) return json({ error: "Пустой ответ модели, попробуйте ещё раз" }, 502);

    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
