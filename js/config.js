/* ============================================================
   Настройки подключения к Supabase.
   Эти два значения возьмёшь в Supabase → Project Settings → API:
     - Project URL        → SUPABASE_URL
     - anon / public key  → SUPABASE_ANON_KEY
   anon-ключ ПУБЛИЧНЫЙ — его безопасно класть в код и коммитить.
   (НИКОГДА не вставляй сюда service_role ключ — он секретный!)
   ============================================================ */

// Запросы идут через Cloudflare Worker-прокси, т.к. Supabase (*.supabase.co)
// блокируется в РФ без VPN. Воркер форвардит всё в реальный Supabase.
// Прямой адрес (для отката): https://rslralzrsvpuiohrojwg.supabase.co
const SUPABASE_URL = "https://codeclass-api.glebovsvyatoslav.workers.dev";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzbHJhbHpyc3ZwdWlvaHJvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDAzNTcsImV4cCI6MjA5NzkxNjM1N30.uolFabolVi47c5n54gsoPylzDqZ3a6JAR_MF5N7wfQA";

// Логин превращается в технический email: artem → artem@codeclass.app
const EMAIL_DOMAIN = "codeclass.app";
const loginToEmail = (login) => `${login}@${EMAIL_DOMAIN}`;
