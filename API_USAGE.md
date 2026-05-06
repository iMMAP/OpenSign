# OpenSign OSS API Usage for Internal Apps

This document describes how to use the OpenSign open-source deployment in this repository for API-based integrations.

## 1) Hosted v1.1 docs vs this OSS deployment

Official hosted docs: [OpenSign API v1.1](https://docs.opensignlabs.com/docs/API-docs/v1.1)

In this OSS codebase:

- The server is Parse-based and is mounted on `/app` (or your `PARSE_MOUNT`).
- The frontend defaults to `${origin}/api/app` when reverse proxied.
- The built-in `openapi.json` is legacy/incomplete and does not match runtime behavior.
- v1.1-style routes like `/selfsign` are not fully implemented as first-class Express endpoints in this repo.
- **`POST /createdocument`** is implemented on this OSS server (under your Parse mount) for hosted-style compact payloads—see §4.

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
- `POST /createdocument` (token-protected; hosted-style create — see §4)

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

### 4a) `POST /createdocument` (hosted-style, recommended for integrations)

This endpoint accepts the same **compact JSON body** described in hosted API docs (`file`, `name`, `note`, `signers`) and maps it to `contracts_Document`, uploads the PDF, and sends signer invitation emails (same mail path as quick/bulk send).

**URL**

- `{ParseBase}/createdocument`  
  Example: `https://your-host/api/app/createdocument`

**Headers**

- `Content-Type: application/json`
- `X-Api-Token: <token_from_Settings_API_Token>`
- Optional (if your reverse proxy or client requires them): `X-Parse-Application-Id`, `X-Parse-REST-API-Key`, etc. — the route authenticates via **`X-Api-Token`** only.

**Body**

- `file` (string, required): Base64-encoded PDF.
- `name` (string, optional): Saved document / file name (`.pdf` friendly).
- `note` (string, optional): Shown in invitation mail context.
- `signers` (array, required): Each item:
  - `email` (string, required)
  - `name` (string, optional)
  - `widgets` (array, required): Each widget:
    - `type` (string, optional, default `signature`)
    - `page` (number, optional, default `1`) — 1-based page index
    - `x`, `y`, `w`, `h` (numbers, required): Positions in **PDF coordinate space**, matching hosted widget semantics (maps internally to OpenSign `xPosition`, `yPosition`, `Width`, `Height`).
    - `options` (object, optional): e.g. `{ "name": "sig_field", "hint": "Sign here" }`

Minimal example:

```bash
curl -X POST "https://your-host/api/app/createdocument" \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: os_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "file": "<base64_pdf_here>",
    "name": "Agreement.pdf",
    "note": "Please sign",
    "signers": [
      {
        "email": "signer1@example.com",
        "name": "Signer One",
        "widgets": [
          { "type": "signature", "page": 3, "x": 72, "y": 520, "w": 200, "h": 40,
            "options": { "name": "sig_1", "hint": "Signer One" } }
        ]
      }
    ]
  }'
```

**Success response** (`200`)

```json
{
  "objectId": "<contracts_Document objectId>",
  "createdAt": "<ISO8601>",
  "result": { "objectId": "<same objectId>" }
}
```

**Error responses**

- `400` — Invalid JSON body, missing `file` / `signers`, invalid widgets (e.g. non-numeric geometry).
- `401` — Missing/invalid `X-Api-Token`.
- `400` — Authenticated user has no `contracts_Users` row yet (complete OpenSign signup / extension profile first).
- `500` — PDF processing, storage (`MASTER_KEY` / files adapter), or unexpected server error.

**Prerequisites**

- API owner must exist as `_User` with a linked **`contracts_Users`** record (normal OpenSign account).
- File uploads use `MASTER_KEY` (same as other server utilities).

---

### 4b) Parse REST + Cloud Functions (low-level)

For OSS deployment you can still call Parse REST + Cloud Functions under `/app`.

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

Note: raw `contracts_Document` payloads are rich (signers, placeholders/widgets, ACL, tenant-linked fields). Prefer **`POST /createdocument`** (§4a) when you only have a compact hosted-style payload.

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
- **`POST /createdocument`** (§4a) provides hosted-compatible document creation for OSS; other v1.1 paths (`/selfsign`, etc.) may still need adapters if you rely on them explicitly.
