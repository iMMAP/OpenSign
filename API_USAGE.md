# OpenSign OSS API Usage for Internal Apps

This document describes how to use the OpenSign open-source deployment in this repository for API-based integrations.

## 1) Hosted v1.1 docs vs this OSS deployment

Official hosted docs: [OpenSign API v1.1](https://docs.opensignlabs.com/docs/API-docs/v1.1)

In this OSS codebase:

- The server is Parse-based and is mounted on `/app` (or your `PARSE_MOUNT`).
- The frontend defaults to `${origin}/api/app` when reverse proxied.
- The built-in `openapi.json` is legacy/incomplete and does not match runtime behavior.
- v1.1-style routes like `/selfsign` are not fully implemented as first-class Express endpoints in this repo.

## 2) Authentication model

There are now two practical auth modes:

1. Session token (existing OpenSign app behavior)
   - Header: `X-Parse-Session-Token`
2. API token (new in this implementation)
   - Generate in UI: `Settings -> API Token`
   - Header for token-protected routes: `X-Api-Token`

## 3) New API token and webhook endpoints

These routes are available on OpenSignServer custom routes:

- `GET /webhook` (token-protected)
- `POST /webhook` (token-protected)

Authentication headers:

- `X-Api-Token: <your_token>`

Example: get current webhook

```bash
curl -X GET "https://your-host/api/app/webhook" \
  -H "X-Api-Token: os_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Example: save webhook configuration

```bash
curl -X POST "https://your-host/api/app/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: os_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "url": "https://internal-app.example.com/opensign/webhook",
    "secret": "replace-with-shared-secret",
    "events": ["document.viewed", "document.completed", "document.declined"]
  }'
```

## 4) Initiate signature flows from internal apps

For OSS deployment, use Parse REST + Cloud Functions under `/app`.

Common base:

- Parse base URL: `https://your-host/api/app`

Core headers:

- `X-Parse-Application-Id: opensign` (or your configured `APP_ID`)
- Session-based flow: `X-Parse-Session-Token: <session_token>`

Useful Cloud Functions:

- `POST /functions/getDocument`
- `POST /functions/getReport`
- `POST /functions/batchdocuments`
- `POST /functions/signPdf`
- `POST /functions/triggerevent`

Create document record directly (advanced):

- `POST /classes/contracts_Document`

Note: document creation payloads are rich (signers, placeholders/widgets, ACL, tenant-linked fields). If your internal apps need a simplified public endpoint similar to hosted `/selfsign`, implement a thin server route that accepts a compact request and translates it into the `contracts_Document` schema.

## 5) Webhook events and signature validation

When document events are triggered via `triggerevent`, OpenSign sends callbacks to your configured webhook URL for subscribed events.

Supported events in this implementation:

- `document.viewed`
- `document.completed`
- `document.declined`

Delivery signature:

- Header: `X-OpenSign-Signature`
- Value: `hex(hmac_sha256(raw_json_body, webhook_secret))`

Verification pseudo-code:

```js
const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
```

## 6) Endpoint compatibility summary

- Hosted docs are useful for product-level API concepts.
- This OSS runtime uses Parse endpoints and Cloud Functions as the source of truth.
- If your internal apps are built against hosted v1.1 paths (`/selfsign`, etc.), add an adapter layer in OpenSignServer that maps those paths to Parse class/function operations.
