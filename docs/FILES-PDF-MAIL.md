# Files, PDF and mail

## Storage keys

Object keys are built with `buildKey(domain, ext)`:

```text
{domain}/{yyyy}/{mm}/{uuidv7}.{ext}
```

- `yyyy` / `mm` use the calendar date in **Europe/Sofia**
- `uuidv7` comes from `createId()` in `@ddcrm/shared`
- The Garage/S3 bucket is **private**. Serve files only through the API or
  short-lived `presignGet` URLs. Do not create a `files` table yet.

## Why PDF fonts are embedded

Gotenberg/Chromium must render Bulgarian (Cyrillic) the same on every host.
Templates inject `@font-face` rules with **base64** Inter (400/600) and
JetBrains Mono (400), latin + cyrillic subsets, loaded once at startup from
`apps/api/src/pdf/fonts`. Do not rely on system fonts.

## Adding a PDF template

1. Add HTML under `apps/api/src/pdf/templates/` (content fragment or full page).
2. Prefer `PdfService.renderTemplate(contentHtml)` so base layout + fonts apply.
3. Call `PdfService.fromHtml(html, { footer: true })` (A4, margins, print background).
4. Map Gotenberg failures to a clear internal `AppException` (already done in the service).

## Adding an email template

1. Add a React Email component under `apps/api/src/mail/templates/`.
2. Wrap content in `MailLayout` for the shared look.
3. Export a `render…()` helper using `@react-email/render` (html + plain text).
4. From the API, call `MailQueueService.enqueue(…)` — never `MailService.send` in HTTP handlers.

## API only enqueues mail

The HTTP API must **not** talk to SMTP. It enqueues jobs on the `email` queue.
`EmailProcessor` (worker only) loads attachment bytes from storage by `storageKey`
and sends through `MailService`. Never put file contents in the Redis job payload.
