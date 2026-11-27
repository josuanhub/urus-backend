# URUS Chat — Memoria total + respaldo de modelos

**Archivos:** `urus-chat.js` y `urus-gateway.js` (reemplazo completo, en la raíz del repo).
**No toca:** `server.js`, tablas, ni variables obligatorias. Tu otra pantalla sigue funcionando: todos los campos de respuesta que ya existían se conservan.

## Instalar (5 minutos)

1. GitHub → `josuanhub/urus-backend` → **Add file → Upload files** → arrastra los DOS archivos (mismos nombres = reemplazan los actuales) → un solo commit: `feat: memoria total + respaldo de modelos`.
   *(Si prefieres editar uno por uno: primero `urus-gateway.js`, después `urus-chat.js`. Al revés, el chat falla hasta que llegue el gateway.)*
2. Espera el redeploy de Railway (~2 min).

## Activar (3 llamadas, header `x-studio-password`)

| # | Llamada | Para qué |
|---|---|---|
| 1 | `GET /v1/urus/memory/health` | Ve el diagnóstico en español: si el extractor falla, cuántos hechos viejos faltan por clasificar, si el núcleo está vacío |
| 2 | `POST /v1/urus/memory/backfill-core` (repite hasta `remaining: 0`) | Clasifica tus hechos viejos: los fundamentales entran al núcleo. 40 por llamada |
| 3 | `POST /v1/urus/learn` con `{"type":"identity","content":"..."}` | Enséñale quién eres, tus reglas y proyectos principales. Los tipos `identity`, `principle`, `protocol`, `context` siempre viajan |

Lo que quieras fijar o soltar a mano: `POST /v1/urus/memory/pin` con `{"id":"<uuid>","core":true|false}`. Los ids salen de `GET /v1/urus/memory`.

## Qué cambió

- **NÚCLEO:** lo fundamental viaja en CADA mensaje, aunque no lo menciones (hasta 5000 caracteres; `URUS_CORE_CHARS`).
- **PASADO:** recuerda conversaciones antiguas parecidas al tema actual, con fecha (antes solo veía las últimas 6).
- **Extractor de hechos:** antes leía los primeros 1500 caracteres de lo que dices; ahora lee hasta 7200, por trozos (importante para tus dictados). Marca qué es núcleo, no duplica y sube a núcleo un hecho repetido que resulta fundamental.
- **Sin fallos silenciosos:** si el extractor falla queda registrado (`/memory/health` y `/status`).
- **Respaldo de modelos (gateway):** si el modelo principal falla, se retira o tarda más de 60 s, responde OpenAI `gpt-4o-mini`, y luego Claude Haiku si hay key. Cambiable con `URUS_FALLBACK_CHAIN="proveedor:modelo,proveedor:modelo"`. También protege a `/analyze` (PDF).
- Las memorias largas ya no se meten completas al prompt (máx. 900 caracteres cada una).

## Contrato para tu otra pantalla (campos NUEVOS en la respuesta de `/chat`)

`nucleo_usado`, `nucleo_total`, `pasado_usado`, `fallback_used` (bool). `model_used` ahora dice el modelo que REALMENTE respondió. Endpoints nuevos: `GET /memory/health`, `POST /memory/pin`, `POST /memory/backfill-core`.

## Qué probé y qué NO

**Probé (46 verificaciones × 3 corridas, base real Postgres 16 + pgvector con el esquema exacto de tu `jarvis_memory`):** el mismo escenario contra tu código actual y el nuevo. Tu código actual: no recuerda tu identidad con un mensaje sin relación, no lee el final de un mensaje largo, no recuerda conversaciones antiguas y se cae si el modelo se retira. El nuevo hace las cuatro cosas. También: contrato de la API, presupuesto del núcleo, duplicados, pin, backfill, salud, `/analyze`, y el gateway (timeout, respaldo, sin key).

**NO probé:** modelos ni embeddings reales (usé simulados que se parecen por palabras compartidas), ni Tavily.
- Los umbrales de similitud se calibraron con esos simulados. Si el PASADO trae conversaciones que no vienen al caso, sube `URUS_PAST_MIN_SIM` (0.38 → 0.45); si nunca trae nada, bájalo (→ 0.30).
- El respaldo es una red de seguridad, no un reemplazo: si `deepseek-chat` ya no existe, cada mensaje falla primero y luego responde OpenAI (más lento y con avisos en el log). Arréglalo de raíz con `URUS_CHAT_MODEL=deepseek-v4-flash` en Railway.

## Límites

"Recordar todo" aquí significa: núcleo siempre presente + hechos y conversaciones recuperados por significado. No mete TODO el historial en cada mensaje (no cabe ni conviene). Lo que no esté en el núcleo ni se parezca al tema, no aparece. Tampoco hay todavía un resumen automático de tu perfil: si los hechos del núcleo superan el presupuesto, los más viejos se quedan fuera (los ves con `nucleo_usado` vs `nucleo_total`).
