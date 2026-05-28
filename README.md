# file-to-markdown

A Node.js service that converts arbitrary documents (PDF, DOCX, XLSX, CSV, HTML, images, plain text) into clean, semantically structured Markdown. The output is optimized for downstream consumption by Large Language Models in retrieval-augmented generation (RAG) pipelines, summarization workflows, and chat-with-your-documents applications.

The project is inspired by Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) but is written entirely in JavaScript so it can be embedded in Node.js back-ends, serverless functions, or invoked from a JavaScript-first stack without spawning a Python interpreter.

---

## Table of Contents

1. [Motivation](#motivation)
2. [Features](#features)
3. [Supported Formats](#supported-formats)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Configuration](#configuration)
8. [API Reference](#api-reference)
9. [How It Works](#how-it-works)
10. [Extending the System](#extending-the-system)
11. [Security](#security)
12. [Performance Notes](#performance-notes)
13. [Known Limitations](#known-limitations)
14. [Roadmap](#roadmap)
15. [License](#license)

---

## Motivation

Modern LLM applications spend a large share of their token budget on input documents. When a PDF or DOCX is fed directly into a context window, the file is first parsed into raw text by the application layer. That raw text typically contains:

- Page headers and footers repeated on every page
- Embedded font metadata, justification artefacts, and column-break noise
- Hyphenated words split across lines
- Inline table cells flattened into linear text without delimiters
- Image placeholders with no semantic content

All of this consumes tokens but contributes little semantic value. Converting the document to **Markdown** before sending it to the model has several measurable benefits:

| Benefit | Explanation |
| --- | --- |
| Smaller token footprint | Markdown removes layout artefacts and produces dense semantic text. Real-world reductions of 30–70 % are common. |
| Native model fluency | Foundation models such as GPT-4, Claude, and Gemini have been trained on enormous amounts of Markdown (READMEs, Wikipedia dumps, Stack Overflow). They parse it more accurately than ad-hoc plain text. |
| Structure-preserving | Headings, lists, tables, code blocks, and emphasis survive the conversion. RAG chunkers can split on heading boundaries and produce coherent chunks. |
| Diff-friendly | Markdown is plain text. It can be version-controlled, diffed, and reviewed like source code. |
| Cheaper inference | Smaller inputs translate directly into lower API spend and faster time-to-first-token. |

This service performs that conversion as a stateless HTTP API.

---

## Features

- Single, uniform endpoint that accepts any supported document type
- Per-format extraction strategies (PDF text extraction, DOCX → HTML → Markdown, spreadsheet → GitHub-flavoured Markdown tables, OCR for images, etc.)
- Token counting using the `cl100k_base` encoder (used by GPT-3.5/4/4o and the OpenAI embedding family) so callers can budget their requests precisely
- Centralised error handling with typed error classes and stable error codes
- Structured JSON logging via Pino, with pretty output in development
- Hardened HTTP layer (Helmet, CORS, rate limiting) suitable for direct Internet exposure behind a reverse proxy
- Configurable upload size limits and file storage location
- Graceful shutdown on `SIGINT` / `SIGTERM`
- Strict module boundaries that make new file formats and new features easy to add without touching existing code

---

## Supported Formats

| Extension(s) | Converter | Library | Notes |
| --- | --- | --- | --- |
| `.pdf` | `pdf` | `pdf-parse` | Extracts the text layer. Scanned PDFs without a text layer return an empty body. |
| `.docx` | `docx` | `mammoth` | Converts DOCX to semantic HTML, then HTML to Markdown. |
| `.xlsx`, `.xls` | `xlsx` | `xlsx` (SheetJS) | Each worksheet becomes a `## SheetName` heading followed by a GFM table. |
| `.csv` | `csv` | `papaparse` | First row is treated as the header. Output is a single GFM table. |
| `.html`, `.htm` | `html` | `turndown` + `turndown-plugin-gfm` | Strips boilerplate, preserves semantic tags. |
| `.png`, `.jpg`, `.jpeg`, `.webp` | `image` | `tesseract.js` | OCR using the English language pack by default. |
| `.txt`, `.md` | `text` | (built-in) | Returned verbatim. |

Unrecognised extensions fall back to MIME-type sniffing. Truly unknown types return HTTP `415 Unsupported Media Type`.

---

## Tech Stack

**Runtime**
- Node.js ≥ 18 (uses native `node --watch` for development)

**HTTP layer**
- Express 4 — request routing and middleware composition
- Multer 2 — `multipart/form-data` upload handling
- Helmet — security headers
- CORS — origin control
- `express-rate-limit` — throttling

**Parsing & extraction**
- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX → HTML
- `xlsx` (SheetJS) — spreadsheet parsing
- `papaparse` — CSV parsing
- `tesseract.js` — OCR
- `turndown` + `turndown-plugin-gfm` — HTML → GitHub-flavoured Markdown

**Cross-cutting**
- `pino` + `pino-http` + `pino-pretty` — structured logging
- `gpt-tokenizer` — `cl100k_base` token counting
- `dotenv` — environment file loading

---

## Project Structure

```
file-to-markdown/
├── src/
│   ├── app.js                        Express composition
│   ├── server.js                     Process lifecycle, graceful shutdown
│   │
│   ├── common/                       Shared, non-domain code
│   │   ├── config/index.js           Single source of truth for environment values
│   │   ├── errors/AppError.js        Base error class plus typed subclasses
│   │   ├── logger/index.js           Pino logger factory
│   │   ├── middleware/
│   │   │   ├── errorHandler.middleware.js
│   │   │   ├── requestLogger.middleware.js
│   │   │   └── upload.middleware.js
│   │   ├── security/
│   │   │   └── security.middleware.js   Helmet + CORS + rate limit composition
│   │   └── utils/
│   │       ├── htmlToMarkdown.util.js
│   │       └── tokenCounter.util.js
│   │
│   ├── modules/
│   │   └── conversion/               Conversion feature module
│   │       ├── index.js              Barrel export
│   │       ├── conversion.routes.js
│   │       ├── conversion.controller.js
│   │       ├── conversion.service.js
│   │       ├── conversion.validation.js
│   │       ├── conversion.constants.js
│   │       ├── converter.registry.js Strategy registry
│   │       ├── converters/           One file per file format
│   │       │   ├── pdf.converter.js
│   │       │   ├── docx.converter.js
│   │       │   ├── xlsx.converter.js
│   │       │   ├── csv.converter.js
│   │       │   ├── html.converter.js
│   │       │   ├── image.converter.js
│   │       │   └── text.converter.js
│   │       └── dto/
│   │           └── convertResponse.dto.js
│   │
│   └── routes/index.js               Mounts module routers under /api
│
├── docs/
│   └── architecture.md               In-depth architectural documentation
│
├── uploads/                          Runtime upload directory (gitignored)
├── logs/                             Runtime log directory (gitignored)
│
├── .env.example                      Template environment file
├── .gitignore
├── package.json
└── README.md
```

A more detailed walkthrough of every layer lives in [`docs/architecture.md`](docs/architecture.md).

---

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- Roughly 200 MB of free disk space (Tesseract downloads its English language data on first OCR call)

### Installation

```bash
git clone https://github.com/Arindam-Roy2004/File-to-markdown.git
cd File-to-markdown
cp .env.example .env
npm install
```

### Running the server

Development mode with file watching:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server listens on the port configured in `.env` (default `3000`).

### Sanity check

```bash
curl http://localhost:3000/health
# {"ok":true}

curl http://localhost:3000/api/convert/formats
# Lists every supported converter and its file extensions
```

---

## Configuration

All runtime configuration is read from environment variables. The application **never** reads `process.env` directly outside of `src/common/config/index.js`; every other file imports the config module. This makes it trivial to introduce a new variable, switch to a secret manager, or override values in tests.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | TCP port the HTTP server binds to. |
| `NODE_ENV` | `development` | Standard Node environment flag. Switches log formatting and error verbosity. |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). |
| `UPLOAD_DIR` | `./uploads` | Directory for temporary multipart uploads. The directory is created on boot if missing. |
| `MAX_UPLOAD_MB` | `25` | Hard cap on upload size. Multer rejects larger uploads with `413`. |
| `CORS_ORIGIN` | `*` | Comma-separated list of allowed origins, or `*` for all. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |
| `RATE_LIMIT_MAX` | `60` | Maximum requests per IP per window. |

Copy `.env.example` to `.env` and edit values as needed. In production deployments, prefer your platform's secret manager over a checked-in `.env`.

---

## API Reference

### `GET /health`

Liveness probe. Returns `200 OK` whenever the process is accepting connections. Suitable for Kubernetes readiness/liveness probes or load-balancer health checks.

**Response**
```json
{ "ok": true }
```

---

### `GET /api/convert/formats`

Returns the list of converters currently registered, grouped by converter name with the file extensions each one handles.

**Response**
```json
{
  "supported": [
    { "name": "pdf",   "extensions": [".pdf"] },
    { "name": "docx",  "extensions": [".docx"] },
    { "name": "xlsx",  "extensions": [".xlsx", ".xls"] },
    { "name": "csv",   "extensions": [".csv"] },
    { "name": "html",  "extensions": [".html", ".htm"] },
    { "name": "image", "extensions": [".png", ".jpg", ".jpeg", ".webp"] },
    { "name": "text",  "extensions": [".txt", ".md"] }
  ]
}
```

---

### `POST /api/convert`

The main conversion endpoint. Accepts a single file as `multipart/form-data` and returns the Markdown body plus diagnostic metadata.

**Request**
- Content-Type: `multipart/form-data`
- Field name: `file`
- Maximum size: configured by `MAX_UPLOAD_MB`

**Example**
```bash
curl -F "file=@./reports/quarterly.pdf" \
     http://localhost:3000/api/convert
```

**Successful response (`200 OK`)**
```json
{
  "filename": "quarterly.pdf",
  "mimetype": "application/pdf",
  "sizeBytes": 184320,
  "tokens": 1742,
  "meta": {
    "converter": "pdf",
    "pages": 12,
    "info": { "Title": "Q3 2025 Results", "Author": "Finance" }
  },
  "markdown": "# Quarterly Report\n\n..."
}
```

**Error responses**

| Status | Code | Trigger |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | No file in the request, or the field name is wrong. |
| `413` | `PAYLOAD_TOO_LARGE` | File exceeds `MAX_UPLOAD_MB`. |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Extension and MIME type are not recognised by any converter. |
| `429` | (rate-limit) | Too many requests from the caller's IP. |
| `500` | `INTERNAL_ERROR` | Unhandled error inside a converter. The original message is hidden in production. |

All error responses share the same envelope:
```json
{
  "error": {
    "message": "Unsupported file type: report.zip",
    "code": "UNSUPPORTED_MEDIA_TYPE"
  }
}
```

---

## How It Works

A request flows through the system as follows:

```
Client
  │
  │ HTTPS multipart upload
  ▼
Express app
  │
  ├─▶ Security middleware (Helmet, CORS, rate limit)
  ├─▶ Request logger (pino-http)
  ├─▶ JSON body parser
  │
  └─▶ /api router
        │
        └─▶ /convert (conversion module)
              │
              ├─▶ Multer (writes upload to /uploads/<timestamp>.<ext>)
              ├─▶ Validation middleware (presence, filename)
              ├─▶ Controller
              │     │
              │     └─▶ Service.convertUploadedFile()
              │           │
              │           ├─▶ Resolve converter by extension or MIME
              │           ├─▶ Read file from disk
              │           ├─▶ Run converter strategy
              │           ├─▶ Trim & normalise Markdown
              │           └─▶ Count tokens
              │
              ├─▶ DTO shapes the response payload
              └─▶ Controller deletes the temp file (finally block)
  │
  └─▶ Centralised error handler
        catches any thrown error, logs it, returns a stable JSON envelope.
```

Every converter exposes the same interface:
```js
{
  name: 'pdf',
  async run(buffer, ctx) { return { markdown, meta }; }
}
```

This uniform contract is what allows the controller and the service to remain completely format-agnostic.

---

## Extending the System

### Adding a new file format

Adding support for, say, PowerPoint (`.pptx`) takes three small changes and zero modifications to existing converters or the controller:

1. **Create the converter strategy** at `src/modules/conversion/converters/pptx.converter.js`:
   ```js
   'use strict';
   const officeparser = require('officeparser');

   module.exports = {
     name: 'pptx',
     async run(buffer) {
       const text = await officeparser.parseOfficeAsync(buffer);
       return {
         markdown: text.split('\n').filter(Boolean).join('\n\n'),
         meta: {},
       };
     },
   };
   ```

2. **Register the extension** in `src/modules/conversion/conversion.constants.js`:
   ```js
   const EXTENSIONS = Object.freeze({
     // ...existing entries...
     PPTX: '.pptx',
   });
   ```

3. **Wire the strategy** in `src/modules/conversion/converter.registry.js`:
   ```js
   const pptx = require('./converters/pptx.converter');
   const REGISTRY = Object.freeze({
     // ...existing entries...
     [EXTENSIONS.PPTX]: pptx,
   });
   ```

The controller, service, routes, and DTO need no changes. This is the open/closed principle in practice.

### Adding a new feature module

Suppose later we need user accounts and per-user upload history.

1. Create `src/modules/users/` containing `users.routes.js`, `users.controller.js`, `users.service.js`, `users.repository.js`, and so on.
2. Mount the router in `src/routes/index.js`:
   ```js
   const usersModule = require('../modules/users');
   router.use('/users', usersModule.routes);
   ```

The conversion module is untouched. New functionality always lives next to its module.

---

## Security

The service ships with a baseline security posture that is appropriate for direct Internet exposure behind TLS termination.

- **Helmet** sets standard HTTP security headers (`Content-Security-Policy` skeleton, `X-Frame-Options`, `Strict-Transport-Security`, etc.).
- **CORS** restricts which origins can call the API. The default `*` should be tightened in production.
- **Rate limiting** caps requests per IP per window. Defaults to 60 requests per minute.
- **Multer size limit** prevents memory and disk exhaustion via large uploads.
- **Centralised error handler** never leaks stack traces or internal messages in production.
- **Structured logging** captures method, path, status, and latency for every request, with PII-conscious defaults.

What this service does **not** include yet:

- Authentication or authorisation. All endpoints are currently public. If exposed to the Internet, place the service behind an authenticating gateway or add an auth module.
- Per-tenant quotas beyond simple rate limiting.
- Audit logging to a durable store.

---

## Performance Notes

- **OCR is slow.** Tesseract single-threaded performance is roughly 1–3 seconds per page on a modern laptop. For batch image workflows, queue them and consider running multiple worker processes.
- **PDF parsing is CPU-bound.** `pdf-parse` is synchronous internally; large PDFs will block the event loop. For files above ~50 MB, a dedicated worker pool (or a queue + worker process) is strongly recommended.
- **Spreadsheet parsing scales with cell count.** SheetJS holds the whole workbook in memory. Files with millions of cells need streaming approaches.
- **Token counting is O(n)** in the size of the output Markdown. It is cheap compared to extraction, but worth caching when the same document is converted repeatedly.

---

## Known Limitations

- Scanned PDFs without an embedded text layer return an empty body. A future release will detect this and route the file through Tesseract automatically.
- The PDF converter does not yet preserve column layout, table boundaries, or font-derived heading hierarchy. Adding `pdfjs-dist`-based layout-aware extraction is on the roadmap.
- Embedded images inside DOCX files are dropped during the HTML stage. Image extraction with optional captioning is a planned feature.
- The `xlsx` package on npm has open security advisories that the maintainer publishes fixes for only on the SheetJS CDN. For high-trust deployments, consider replacing it with `exceljs`.

---

## Roadmap

- Layout-aware PDF parsing using `pdfjs-dist`
- Automatic OCR fallback for scanned PDFs
- PPTX support via `officeparser`
- A `/api/convert/chunks` endpoint that returns RAG-ready chunks split on heading boundaries with configurable overlap
- Token cost estimator covering GPT-4o, Claude 3.5/4, Gemini 1.5/2
- Streaming response support for large files
- React drag-and-drop front-end
- Job queue + persistence module (BullMQ + Postgres) for asynchronous batch jobs
- Authentication module with per-user upload history
- Docker image and `docker-compose.yml` for one-command deployment

---

## License

Released under the ISC license. See `LICENSE` for details.
