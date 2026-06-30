/* ============================================================
   Cloudflare Worker — реверс-прокси перед Supabase.
   Нужен, чтобы платформа работала из РФ без VPN: Supabase
   (*.supabase.co на AWS) блокируется, а Cloudflare — доступен.

   Фронт ходит на адрес этого воркера, воркер форвардит запрос
   в Supabase и возвращает ответ. supabase-js, RLS, Edge Functions
   продолжают работать как обычно.

   Это НЕ открытый прокси: цель жёстко зашита в UPSTREAM —
   воркер форвардит только в твой проект Supabase, по любому пути.

   Деплой (без установки чего-либо):
     Cloudflare → Workers & Pages → Create → Worker →
     вставить этот код → Deploy. URL воркера подставить в
     js/config.js (SUPABASE_URL).
   ============================================================ */

const UPSTREAM = "https://rslralzrsvpuiohrojwg.supabase.co";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = UPSTREAM + url.pathname + url.search;

    // Префлайт CORS — отвечаем сразу
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Переносим заголовки запроса, убрав Host (его выставит fetch по target)
    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = {
      method: request.method,
      headers,
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body,
      redirect: "manual",
    };

    const resp = await fetch(target, init);

    // Копируем ответ и добавляем/перетираем CORS-заголовки
    const respHeaders = new Headers(resp.headers);
    const cors = corsHeaders(request);
    for (const k in cors) respHeaders.set(k, cors[k]);

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const reqHeaders = request.headers.get("Access-Control-Request-Headers")
    || "authorization, x-client-info, apikey, content-type";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
