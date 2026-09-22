# Cloudflare для WEBIVORE — короткая инструкция

Ниже — только обязательный путь для бесплатного запуска публичных URL. Demo, готовые карты и локальные HTML/изображения работают без Cloudflare.

## Что получится

- frontend: `https://webivore.chikirao.ru` и резервный `https://chikirao.github.io/webivore/`;
- API снимков: `https://webivore-snapshot.<ваш-workers-subdomain>.workers.dev`;
- Browser Run открывает публичную страницу и делает JPEG + DOM metadata;
- Workers KV хранит готовые снимки;
- Turnstile защищает только новые, ещё не закэшированные снимки;
- после исчерпания бесплатного Browser Run новые URL временно недоступны, но кэш, demo и локальные файлы продолжают работать.

## 1. Войти в Cloudflare

1. Создайте аккаунт на [dash.cloudflare.com](https://dash.cloudflare.com/).
2. В **Workers & Pages → Plans** убедитесь, что выбран **Workers Free**. Не включайте Workers Paid.
3. В PowerShell из корня проекта выполните:

```powershell
Set-Location D:\dev\katamari_web\cloudflare
npx wrangler login
Set-Location ..
```

Откроется браузер: разрешите Wrangler доступ к аккаунту.

## 2. Создать бесплатный KV

Из корня проекта:

```powershell
npm run cf:kv:create
```

Wrangler создаст namespace `WEBIVORE_SNAPSHOTS` и сам добавит binding `SNAPSHOTS` с реальным ID в `cloudflare/wrangler.jsonc`. Это не секрет; изменение конфигурации нужно закоммитить.

## 3. Создать Turnstile

1. Cloudflare Dashboard → **Turnstile → Add widget**.
2. Name: `WEBIVORE capture`.
3. Mode: **Managed**.
4. Hostname: `webivore.chikirao.ru`.
5. Скопируйте sitekey и secret.

Sitekey публичный. Secret нельзя добавлять в GitHub или `.env` frontend.

Сохраните secret в Worker:

```powershell
Set-Location cloudflare
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Создайте соль rate limit, скопируйте выведенную строку и передайте её второй команде:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npx wrangler secret put RATE_LIMIT_SALT
Set-Location ..
```

## 4. Разрешить frontend origin

В `cloudflare/wrangler.jsonc` замените `ALLOWED_ORIGINS` на:

```json
"ALLOWED_ORIGINS": "https://webivore.chikirao.ru,https://chikirao.github.io,http://localhost:5174,http://127.0.0.1:5174"
```

Пути здесь не указываются: origin — это только схема, домен и порт. `*` не используйте.

## 5. Проверить и развернуть Worker

```powershell
npm run cf:verify
npm --prefix cloudflare run deploy -- --dry-run
npm run cf:deploy
```

Последняя команда выполняет реальный deployment. Wrangler напечатает адрес вида:

```text
https://webivore-snapshot.ACCOUNT-SUBDOMAIN.workers.dev
```

Проверьте health:

```powershell
$worker = "https://АДРЕС-ИЗ-WRANGLER"
Invoke-RestMethod "$worker/api/health"
```

Ожидается `ok: true`.

## 6. Передать публичные значения в GitHub

GitHub → repository `chikirao/webivore` → **Settings → Secrets and variables → Actions → Variables**:

- `VITE_BASE_PATH` = `/` для `webivore.chikirao.ru`;
- `VITE_SNAPSHOT_API_URL` = полный workers.dev URL без завершающего `/`;
- `VITE_TURNSTILE_SITE_KEY` = sitekey Turnstile.

После изменения переменных снова запустите **Actions → Deploy GitHub Pages → Run workflow**.

## 7. Быстрая проверка

1. Откройте `https://webivore.chikirao.ru`.
2. Demo должен запускаться даже при Offline в DevTools.
3. Вставьте один новый публичный URL — появится Turnstile, затем уровень загрузится.
4. Повторите тот же URL — должен прийти `cache: hit`, без нового Browser Run.
5. Проверьте локальный HTML или PNG — в Network не должно быть запроса `/api/snapshot`.

## Бесплатная квота и безопасность

- Не переходите на Workers Paid: на Free нет платного overage.
- Новые captures ограничены Turnstile и тремя попытками в час на короткоживущий salted hash IP.
- Полный IP в долговременный storage не пишется.
- Ошибки не кэшируются.
- Browser-сессия всегда закрывается в `finally`; deadline — 48 секунд.
- Видео не скачивается, авторизация и anti-bot защита не обходятся.

Квоту смотрите в **Cloudflare Dashboard → Compute → Browser Run → Usage**. При её исчерпании дождитесь следующего UTC-дня; demo, локальные и уже закэшированные уровни останутся доступны.

Полная справочная версия с rollback, очисткой KV и troubleshooting: [FREE-DEPLOYMENT.md](FREE-DEPLOYMENT.md).
