#!/usr/bin/env python3
# ============================================================
#  Локальный dev-сервер для CodeClass.
#  Заменяет:
#    - статику (как python -m http.server), отдаёт файлы проекта;
#    - Edge Function generate-feedback — POST /dev/generate-feedback,
#      чтобы тестировать генерацию ОС нейронкой ДО деплоя в Supabase.
#
#  Ключ Gemini берётся из переменной окружения GEMINI_API_KEY
#  ЛИБО из файла gemini_key.local рядом с этим скриптом
#  (этот файл игнорируется git по правилу *.local).
#
#  Запуск:  python dev_server.py   →   http://localhost:8123
#  Только stdlib, ничего ставить не нужно.
# ============================================================

import json
import os
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8123
ROOT = Path(__file__).resolve().parent
GEMINI_MODEL = "gemini-2.5-flash"


def get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    f = ROOT / "gemini_key.local"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    return ""


def clamp10(x) -> int:
    try:
        n = round(float(x))
    except (TypeError, ValueError):
        return 7
    return max(1, min(10, n))


def build_prompt(understanding, independence, homework, engagement, hint):
    lines = [
        "Ты — репетитор по программированию. Напиши родителю короткую обратную связь об",
        "ученике по итогам занятий — В ТОЧНОСТИ в таком же стиле, тоне и объёме, как в примере.",
        "",
        "Пример.",
        "Баллы: понимание 8, самостоятельность 9, домашние задания 6, вовлечённость 10.",
        "Обратная связь: «Иногда возникают сложности при выполнении дз. Но в остальном — "
        "всё отлично. Хорошая вовлечённость, высокий интерес к предмету.»",
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
        f"Баллы: понимание {understanding}, самостоятельность {independence}, "
        f"домашние задания {homework}, вовлечённость {engagement}.",
    ]
    if hint:
        lines.append(f"Заметка репетитора (учти по смыслу): {hint}")
    lines += [
        "",
        "Верни ТОЛЬКО текст обратной связи, без кавычек и пояснений.",
    ]
    return "\n".join(lines)


def call_gemini(api_key, prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        # thinkingBudget=0 отключает «размышления» 2.5-flash, иначе они
        # съедают maxOutputTokens и ответ обрывается на первой строке.
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/dev/generate-feedback":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json({"error": "Некорректный JSON"}, 400)
            return

        api_key = get_api_key()
        if not api_key:
            self._send_json({"error": "Нет ключа Gemini: задай GEMINI_API_KEY "
                                      "или вставь ключ в файл gemini_key.local"}, 500)
            return

        prompt = build_prompt(
            clamp10(body.get("understanding")),
            clamp10(body.get("independence")),
            clamp10(body.get("homework")),
            clamp10(body.get("engagement")),
            str(body.get("hint", "")).strip()[:500],
        )
        try:
            text = call_gemini(api_key, prompt)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            self._send_json({"error": f"Ошибка Gemini ({e.code})", "detail": detail}, 502)
            return
        except Exception as e:  # noqa: BLE001 — dev-сервер, показываем как есть
            self._send_json({"error": str(e)}, 500)
            return

        if not text:
            self._send_json({"error": "Пустой ответ модели, попробуй ещё раз"}, 502)
            return
        self._send_json({"text": text})


if __name__ == "__main__":
    key_status = "найден" if get_api_key() else "НЕ найден (вставь в gemini_key.local)"
    print(f"CodeClass dev-сервер:  http://localhost:{PORT}")
    print(f"Корень:  {ROOT}")
    print(f"Ключ Gemini:  {key_status}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
