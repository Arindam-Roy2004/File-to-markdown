# Architecture

This document describes how `file-to-markdown` is organised, why each piece exists, and how the moving parts fit together. It is intended as a deep dive for contributors and reviewers; for a higher-level overview, see the project [`README.md`](../README.md).

> **Scope of this service.** `file-to-markdown` is a *document-to-Markdown converter only*. It is the first step of an LLM ingestion pipeline. It does **not** implement chunking, embeddings, vector storage, retrieval, prompt construction, or any LLM calls. References to RAG below describe the broader pipeline this service is designed to feed; they are not features of this codebase.

---

## Table of Contents

1. [Design Goals](#1-design-goals)
2. [Architectural Style](#2-architectural-style)
3. [Folder Structure](#3-folder-structure)
4. [Layer Responsibilities](#4-layer-responsibilities)
5. [The Conversion Module in Depth](#5-the-conversion-module-in-depth)
6. [Request Lifecycle](#6-request-lifecycle)
7. [Strategy Pattern: The Converter Registry](#7-strategy-pattern-the-converter-registry)
8. [Configuration Layer](#8-configuration-layer)
9. [Logging Layer](#9-logging-layer)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Security Layer](#11-security-layer)
12. [Upload Pipeline](#12-upload-pipeline)
13. [Token Counting](#13-token-counting)
14. [HTML to Markdown](#14-html-to-markdown)
15. [Per-Format Extraction Notes](#15-per-format-extraction-notes)
16. [Operational Concerns](#16-operational-concerns)
17. [Testing Strategy](#17-testing-strategy)
18. [Architectural Evolution](#18-architectural-evolution)
19. [Why Not Each Alternative](#19-why-not-each-alternative)

---

## 1. Design Goals

The project was designed against six explicit goals:

1. **Format-agnostic API.** A single endpoint accepts any supported document. Adding a new format must not change any caller-visible contract.
2. **Strict separation of concerns.** Routing, validation, business logic, file-format extraction, response shaping, and error handling each live in distinct files with single responsibilities.
3. **Open/closed extensibility.** Adding a new format must require only adding files, not modifying existing ones.
4. **Configurable, secret-free source.** Every tunable lives in environment variables. The repository contains a `.env.example` template; real values never enter source control.
5. **Production-grade defaults.** Rate limiting, security headers, structured logs, graceful shutdown, and centralised error handling are present from day one rather than retrofitted.
6. **Predictable file boundaries.** Anything that another module would want to reuse lives under `src/common/`. Anything that belongs to one feature lives inside that feature's module folder.

These goals informed every structural decision below.

---

## 2. Architectural Style

The codebase combines two complementary styles:

### Layered architecture (within a module)

Inside any feature module, code is split into the standard three layers:

- **Routes** — declare the URL surface and bind it to controller functions.
- **Controllers** — handle HTTP request and response objects only. They validate input via middleware, delegate to a service, and shape the response with a DTO.
- **Services** — own the business logic. They are framework-agnostic in style (a service should not import `req` or `res`) and could be reused from a CLI, a queue worker, or a unit test.

A repository layer is reserved for modules that touch persistent storage. The conversion module does not yet have one because the service is currently stateless.

### Modular architecture (across the codebase)

Files are grouped by **feature**, not by **type**. The repository deliberately avoids the antipattern of top-level `controllers/`, `services/`, `routes/` folders that grow unbounded over time. Instead, every feature is a self-contained directory under `src/modules/` that owns its routes, controller, service, validation, constants, types, DTOs, and tests.

The advantage becomes obvious as the codebase grows. Deleting a feature is a single `rm -rf` of its module folder. Onboarding a new contributor is a matter of pointing them at one folder. Cross-feature coupling shows up as imports between modules, which can be enforced with lint rules.

---

## 3. Folder Structure

```
file-to-markdown/
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── common/
│   │   ├── config/
│   │   │   └── index.js
│   │   ├── errors/
│   │   │   └── AppError.js
│   │   ├── logger/
│   │   │   └── index.js
│   │   ├── middleware/
│   │   │   ├── errorHandler.middleware.js
│   │   │   ├── requestLogger.middleware.js
│   │   │   └── upload.middleware.js
│   │   ├── security/
│   │   │   └── security.middleware.js
│   │   └── utils/
│   │       ├── htmlToMarkdown.util.js
│   │       └── tokenCounter.util.js
│   │
│   ├── modules/
│   │   └── conversion/
│   │       ├── index.js
│   │       ├── conversion.routes.js
│   │       ├── conversion.controller.js
│   │       ├── conversion.service.js
│   │       ├── conversion.validation.js
│   │       ├── conversion.constants.js
│   │       ├── converter.registry.js
│   │       ├── converters/
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
│   └── routes/
│       └── index.js
│
├── docs/
│   └── architecture.md
│
├── uploads/
├── logs/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

Two top-level directories under `src/` carry meaning:

- `src/common/` — anything reusable across modules. Nothing in here may know about a specific business feature.
- `src/modules/` — feature folders. Anything domain-specific lives here.

The asymmetry is intentional. It enforces a one-way dependency rule: **modules depend on `common`, but `common` never depends on a module.** This rule alone prevents a great deal of accidental complexity.

---

## 4. Layer Responsibilities

### Controller

Controllers are intentionally thin. A typical controller in this codebase is twenty lines or fewer. Their responsibilities are:

- Read the validated request payload (validation has already happened in middleware).
- Call exactly one service method.
- Pass the service result to a DTO that shapes the response.
- Send the response.
- On error, call `next(err)` and let the centralised error handler take over.

What controllers must **not** do:

- Read or write the database directly.
- Contain conditional branches that represent business rules.
- Construct domain objects.
- Catch errors except to clean up resources (for example, deleting a temp file in a `finally` block).

### Service

Services own business logic. The conversion service:

- Resolves which converter to run based on extension and MIME type.
- Reads the uploaded file from disk.
- Invokes the converter strategy.
- Normalises the resulting Markdown (trim, ensure trailing newline).
- Counts tokens.
- Returns a plain object whose shape the DTO understands.

A service does not import Express types. In principle, the conversion service could be invoked from a CLI tool, a CRON worker, or a unit test by passing a plain `{ path, originalname, mimetype, size }` object. This decoupling is what makes the layer testable.

### Repository

Not present in this codebase yet. When the project introduces persistence (job records, user accounts, conversion history), each persistent module will gain a `*.repository.js` file. Repositories will:

- Encapsulate every database call relevant to that module.
- Return plain JavaScript objects, never ORM entity instances, to the service.
- Be the only files that know which database driver is in use.

The reason for this discipline is simple: when the database changes (Postgres to DynamoDB, Mongo to Postgres), only the repository layer needs to be touched.

### DTO / Validation

The DTO layer (`dto/`) defines the **shape** of the API contract. Currently the only DTO is `convertResponse.dto.js`, which projects the internal service result into the externally visible JSON envelope. This indirection prevents accidental leaks of internal fields and keeps the API surface small and intentional.

The validation layer (`*.validation.js`) defines the **rules** for accepting input. In this project the rule is simple: a file must be present and must have a filename. As more endpoints are added, validation will grow into request-body and query-parameter schemas (typically using Zod or Joi).

---

## 5. The Conversion Module in Depth

The conversion module is the only feature in the codebase today, but it is structured as if it were one of many. Every file inside it serves a clear architectural purpose.

| File | Purpose |
| --- | --- |
| `index.js` | Barrel export. The rest of the codebase imports `require('./modules/conversion')` and gets `{ routes, service, controller }`. This isolates the module's public surface. |
| `conversion.routes.js` | Declares the URL paths (`POST /`, `GET /formats`) and binds them to controller functions. The Multer middleware and the validation middleware are wired in here. |
| `conversion.controller.js` | The thin HTTP layer. Reads `req.file`, calls the service, shapes the response with the DTO, and deletes the temp file in a `finally` block. |
| `conversion.service.js` | The business logic. Resolves the converter, reads the file, runs the conversion, normalises output, counts tokens. |
| `conversion.validation.js` | A single middleware function: rejects requests that are missing a file. |
| `conversion.constants.js` | Frozen extension enum. Centralises the magic strings (`.pdf`, `.docx`, etc.) so the registry, tests, and any future code refer to one source. |
| `converter.registry.js` | The strategy registry. Maps extensions to converter implementations and exposes a `resolveConverter(ext, mimetype)` helper. |
| `converters/*.converter.js` | One file per file format. Each implements the same minimal interface: `{ name, async run(buffer, ctx) }`. |
| `dto/convertResponse.dto.js` | Builds the response envelope from the service result. |

The module's public surface is just the `index.js` barrel. Everything else is internal.

---

## 6. Request Lifecycle

The path of a single `POST /api/convert` request:

1. **TLS termination** — performed upstream (Nginx, ELB, Cloudflare, etc.). Not part of this codebase.
2. **Express composition** — `src/app.js` sets up middleware in the following order:
   - Helmet, CORS, rate limit (`applySecurity`)
   - `pino-http` request logger
   - JSON body parser
   - Health route (`GET /health`)
   - API router (`/api/*`)
   - 404 handler
   - Centralised error handler (must be last)
3. **API router** — `src/routes/index.js` mounts `conversionModule.routes` under `/convert`.
4. **Multer** — writes the upload to disk under `UPLOAD_DIR` with a randomised filename. If size exceeds `MAX_UPLOAD_MB`, Multer throws and the error handler returns `413`.
5. **Validation middleware** — `validateUploadedFile` ensures `req.file` exists; otherwise it short-circuits with a `ValidationError` (`400`).
6. **Controller** — calls `conversionService.convertUploadedFile(req.file)`.
7. **Service**:
   1. Extracts the file extension.
   2. Calls `resolveConverter(ext, mimetype)`. If no converter matches, throws `UnsupportedMediaTypeError` (`415`).
   3. Logs an `info` event with the filename and chosen converter.
   4. Reads the file into a Buffer.
   5. Calls `converter.run(buffer, ctx)`.
   6. Trims the output, appends a single trailing newline.
   7. Calls `countTokens(markdown)`.
   8. Returns `{ markdown, meta, tokens }`.
8. **DTO** — `toConvertResponse(file, result)` produces the response object.
9. **Controller response** — `res.json(...)` serialises and writes the body.
10. **Cleanup** — the controller's `finally` block deletes the temp file. Failures are swallowed silently because the file may already have been removed by the OS.
11. **Error path** — at any point, a thrown error short-circuits to the central error handler, which logs the error and emits a stable JSON envelope.

---

## 7. Strategy Pattern: The Converter Registry

The single most important pattern in this codebase is the converter registry, because it is what keeps the conversion service stable as new file formats are added.

### Contract

Every converter is a plain object with two members:

```js
{
  name: 'pdf',                            // identifier used in metadata and logs
  async run(buffer, ctx) {                // the only behaviour
    return { markdown: '...', meta: {} };
  }
}
```

`buffer` is the raw bytes of the upload. `ctx` carries non-essential context (`filename`, `mimetype`) for converters that need it. The return shape is fixed.

### Registry

`converter.registry.js` maps extensions to converter objects:

```js
const REGISTRY = Object.freeze({
  '.pdf':  pdf,
  '.docx': docx,
  '.xlsx': xlsx,
  '.xls':  xlsx,
  '.csv':  csv,
  '.html': html,
  '.htm':  html,
  '.png':  image,
  '.jpg':  image,
  '.jpeg': image,
  '.webp': image,
  '.txt':  text,
  '.md':   text,
});
```

`resolveConverter(ext, mimetype)` first looks up by extension. If no extension match is found (for example, a file called `report` with no extension), it falls back to MIME-type sniffing: any `image/*` MIME maps to the image converter, `text/plain` maps to text, and `text/html` maps to html.

### Why this matters

Adding a new format is purely additive. The conversion **service**, **controller**, **routes**, and **DTO** never change. The work is:

1. Drop a new file in `converters/`.
2. Add the extension constant.
3. Wire it into the registry.

This is the open/closed principle expressed as a directory layout. The pattern scales linearly with the number of formats and produces no merge conflicts in shared files.

---

## 8. Configuration Layer

`src/common/config/index.js` is the only file in the entire codebase that reads `process.env`. Every other file imports the config object and reads typed properties from it.

```js
const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxBytes: parseInt(process.env.MAX_UPLOAD_MB || '25', 10) * 1024 * 1024,
  },
  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
});
```

Three benefits:

- **Discoverability.** A new contributor finds every configuration knob in one file.
- **Type coercion in one place.** `parseInt` is called once per variable, not scattered.
- **Test substitution.** Tests can `jest.mock('../common/config', ...)` to inject fixtures without touching environment variables.

The object is `Object.freeze`d so accidental writes throw in strict mode rather than silently mutating shared state.

---

## 9. Logging Layer

The logger is `pino`, chosen for its low overhead and structured-by-default output. The factory at `src/common/logger/index.js` reads the log level from config and produces JSON in production (so logs ship cleanly to ELK, Loki, Datadog, or CloudWatch) and pretty-printed text in development (so humans can read them).

Each log line is enriched with `service: 'file-to-markdown'` and `env`, which makes filtering trivial in any aggregator. HTTP requests are logged automatically by `pino-http` with method, path, status, latency, and a per-request UUID.

There are no `console.log` calls in the codebase; doing so would produce unstructured output that downstream tooling cannot parse.

---

## 10. Error Handling Strategy

### Typed errors

`src/common/errors/AppError.js` defines a base error class that carries `status`, `code`, and optional `details`:

```js
class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) { ... }
}
class ValidationError          extends AppError { ... }   // 400
class UnsupportedMediaTypeError extends AppError { ... }  // 415
class PayloadTooLargeError     extends AppError { ... }   // 413
```

Throwing a typed error anywhere in the service or middleware is enough; the centralised handler turns it into a stable HTTP response. Promotion to new error types (e.g. `ConflictError`, `ForbiddenError`) is a one-line addition.

### Centralised handler

`src/common/middleware/errorHandler.middleware.js` is the last middleware registered on the app. It:

- Distinguishes operational errors (`instanceof AppError`) from programmer errors.
- Logs both, with full stack traces, but only exposes `message` and `code` to the client when the error is operational.
- In non-production environments, includes the stack in the JSON response for unexpected errors so debugging is fast.

The response envelope is always:
```json
{ "error": { "message": "...", "code": "...", "details": ... } }
```

This consistency lets clients write a single error handler in their HTTP client.

### Why this approach

The two principles being applied here:

1. **Operational vs. programmer errors.** Operational errors are expected (bad input, missing file). Programmer errors (a `TypeError`, an `undefined.foo`) indicate a bug. Mixing them produces brittle handlers; separating them allows one to be a recoverable response and the other to be a logged-and-alerted incident.
2. **Stable error contracts.** Clients should be able to depend on `code === 'UNSUPPORTED_MEDIA_TYPE'` without worrying that a refactor changes the human-readable `message`.

---

## 11. Security Layer

`src/common/security/security.middleware.js` composes three independent concerns into one `applySecurity(app)` function:

- **Helmet** — sets a sane default for security headers. The defaults disable `X-Powered-By`, set `X-Content-Type-Options: nosniff`, etc.
- **CORS** — by default permits all origins (`*`). Production deployments should set `CORS_ORIGIN` to an explicit list.
- **Rate limit** — by default 60 requests per minute per IP. The implementation uses an in-memory store, which is appropriate for a single-instance deployment. For multi-instance deployments behind a load balancer, swap to `rate-limit-redis` so all instances share the counter.

The composition is intentional: a future addition (CSP report-only, content-type sniffing, request signing) drops into the same module without touching `app.js`.

---

## 12. Upload Pipeline

Uploads use **disk storage** rather than memory storage. The reasons:

- **Memory pressure.** Holding a 25 MB upload in a Node Buffer for the duration of conversion (which can take several seconds for OCR) blocks GC and competes with concurrent requests.
- **Stream-friendly.** Disk-backed files can be re-read multiple times by different parsers if a future feature requires it.
- **Pluggable.** Swapping disk storage for S3, GCS, or Azure Blob is a one-file change to `upload.middleware.js`.

The temp directory is created on boot if missing. Files are named `<timestamp>-<random>.<ext>` to prevent collisions between concurrent uploads with the same original name.

The controller is responsible for cleanup. Every successful or failed conversion deletes the temp file in a `finally` block, even when the response has already been sent. Failures during deletion are deliberately swallowed, because they are operationally insignificant (the OS or a periodic sweeper will clean orphans).

---

## 13. Token Counting

Token counts in the response body are computed using `gpt-tokenizer`, which implements the `cl100k_base` BPE encoder used by GPT-3.5, GPT-4, GPT-4o, and the OpenAI embedding family.

The choice of encoder is pragmatic. Anthropic and Google use proprietary tokenisers, but `cl100k_base` is widely available, well-documented, and produces counts that are accurate to within a few percent across modern frontier models. For workloads that target a specific model family with strict cost ceilings, a future enhancement will swap to that family's exact tokeniser.

If the tokeniser ever throws (corrupt input, unsupported character), the implementation falls back to a four-characters-per-token heuristic so that callers always receive a number.

---

## 14. HTML to Markdown

The shared utility `htmlToMarkdown.util.js` wraps `turndown` with the `turndown-plugin-gfm` plugin. Configuration:

- `headingStyle: 'atx'` — produces `#` and `##` rather than underlined headings, which is more common in modern Markdown ecosystems and easier to parse.
- `codeBlockStyle: 'fenced'` — uses ``` fences rather than indented blocks. Required for syntax-highlighted output.
- `bulletListMarker: '-'` — consistent with most style guides.
- `emDelimiter: '*'` — avoids ambiguity with underscored identifiers in code-heavy text.

The GFM plugin adds support for tables, strikethrough, and task lists, all of which are common in DOCX content.

This utility is used by both the DOCX converter and the HTML converter. It is the only place HTML→Markdown configuration lives.

---

## 15. Per-Format Extraction Notes

### PDF
`pdf-parse` extracts the embedded text layer. The implementation splits on newlines, trims each line, drops empty lines, and joins with double-newlines so that paragraphs are visually distinct. Page count and PDF info dictionary are returned in `meta`.

Limitations: scanned PDFs without a text layer return an empty body. Multi-column layouts may produce text in incorrect reading order. A future `pdfjs-dist`-based implementation will use font sizes and positions to reconstruct headings and column flow.

### DOCX
`mammoth` converts DOCX to **semantic HTML** (preserving `<h1>`, `<h2>`, `<ul>`, `<table>`, etc.), which is then handed to the HTML→Markdown utility. This two-stage pipeline produces high-quality Markdown for typical office documents.

`messages.length` from mammoth is surfaced in `meta.warnings` so the caller can detect unusually messy inputs.

### XLSX/XLS
`xlsx` (SheetJS) reads the workbook into a sheet name → 2D-array structure. Each sheet becomes a `## SheetName` heading followed by a GFM table built directly from the cell array. Empty cells are rendered as empty table cells (not `null`) for readability.

### CSV
`papaparse` parses the file with `skipEmptyLines: true`. The first row is treated as the header. The output is a single GFM table. Parse errors (malformed rows) are counted in `meta.parseErrors` so the caller can detect garbage.

### HTML
The buffer is decoded as UTF-8 and run through the HTML→Markdown utility unchanged. Inline scripts and style tags are removed by Turndown's defaults.

### Image
`tesseract.js` is invoked with the English language pack. The OCR output is split, trimmed, and joined like the PDF path. The OCR confidence (0–100) is returned in `meta.confidence` so callers can decide whether to trust the result.

OCR is the slowest converter by an order of magnitude. The first call also downloads the language data (~10 MB), which is cached for subsequent calls.

### Text
The buffer is decoded as UTF-8 and returned verbatim. This converter handles `.txt` and `.md` files. Even though the content is already (or close to) Markdown, the round-trip ensures the response shape is uniform.

---

## 16. Operational Concerns

### Process lifecycle

`src/server.js` boots the Express app and registers handlers for `SIGINT`, `SIGTERM`, `unhandledRejection`, and `uncaughtException`. On a termination signal:

1. Stop accepting new connections (`server.close`).
2. Wait for in-flight requests to finish.
3. Exit cleanly.

A 10-second hard-stop timer (`unref`-ed so it does not keep the process alive on its own) ensures we never hang a SIGTERM forever.

### Health check

`GET /health` is the cheapest possible response. It performs no I/O and no allocation beyond the JSON serialisation. Container orchestrators can call it at sub-second intervals without overhead.

### Logging in production

In production (`NODE_ENV=production`), Pino writes one JSON object per line to stdout. The host platform (Docker, Kubernetes, Render, Fly.io) is expected to capture stdout and forward it to a log aggregator. No log files are written by the application itself.

### Timeouts

The server does not currently set custom request timeouts; Node's defaults apply. Long-running OCR jobs are therefore capped only by the upstream proxy timeout (typically 60–120 seconds in production environments). Future work will introduce per-route timeouts and a job queue for asynchronous extraction.

---

## 17. Testing Strategy

The repository's test layout follows the steering rules:

```
src/modules/conversion/tests/
├── unit/
│   ├── conversion.service.spec.js
│   ├── converter.registry.spec.js
│   └── converters/
│       └── csv.converter.spec.js
├── integration/
│   └── convert.api.spec.js
├── fixtures/
│   ├── sample.csv
│   ├── sample.pdf
│   └── sample.docx
└── mocks/
    └── tesseract.mock.js
```

(These tests are not yet written; the structure is ready for them.)

The intended coverage:

- **Unit tests** mock the file-system and converter dependencies, asserting that the service's branching logic (extension resolution, MIME fallback, error throwing) behaves correctly.
- **Converter tests** feed each converter a known fixture and snapshot the output Markdown.
- **Integration tests** use Supertest against the real Express app with real converters (except OCR, which is mocked because Tesseract is too slow for the test loop).
- **End-to-end tests** (in a top-level `/tests/e2e/` folder) will exercise the whole pipeline against a running container.

---

## 18. Architectural Evolution

The current codebase is intentionally minimal so that it can grow without churn. The next architectural milestones, in the order they are likely to land:

1. **Persistence module.** A `jobs` module records each conversion (input metadata, output token count, latency, success/failure). Drives a future history endpoint.
2. **Asynchronous queue.** A `queue` directory (BullMQ on Redis) lets large or slow conversions run out-of-band. The HTTP endpoint returns a job ID; the client polls or subscribes to a webhook.
3. **Authentication module.** `modules/auth/` and `modules/users/` add per-user sessions. Conversion gets an authorisation middleware that gates the endpoint.
4. **Chunking endpoint.** A `/api/convert/chunks` route on the conversion module that returns Markdown split on heading boundaries with configurable chunk size and overlap, plus per-chunk token counts. This is the closest the project will come to RAG. Embeddings, vector storage, retrieval, and LLM orchestration are intentionally out of scope; if they are ever built, they will live in a separate downstream service.
5. **Front-end.** A separate package (likely Next.js) consumes the API and offers drag-and-drop uploads with live token counters.
6. **Observability.** OpenTelemetry tracing across the Multer-validation-controller-service-converter chain, exported to any OTLP backend.

Each step is additive. None of them require restructuring existing code.

---

## 19. Why Not Each Alternative

A handful of design decisions were considered and rejected. Recording them here saves future contributors from re-litigating them.

**Why not type-grouped folders (`controllers/`, `services/`, `routes/`)?**
This is the default Express tutorial layout. It scales poorly: with five features, every folder has five files, and changes that touch one feature span five directories. Module-based grouping localises change.

**Why not TypeScript?**
TypeScript is a clear win for a long-lived codebase. The current project uses CommonJS JavaScript with JSDoc typedefs to keep the tooling surface minimal during initial development. Migration is straightforward when the codebase stabilises; the file boundaries are already correct.

**Why not Fastify?**
Fastify is faster and has built-in schema validation. Express was chosen because its ecosystem is larger, its middleware patterns are universally understood, and the performance difference is irrelevant when conversion latency is dominated by parsing libraries that take hundreds of milliseconds to seconds.

**Why not stream the upload directly through the parser?**
Some libraries (`pdf-parse`, `mammoth`, `tesseract.js`) require a complete buffer or file path. Streaming the parser would only benefit a subset of formats. The disk-backed multipart upload is a uniform substrate that all parsers accept.

**Why not use the Claude / GPT vision API for everything?**
Vision-LLM document parsing is excellent quality but expensive and slow, and it puts every byte of every uploaded document through a third-party model. Local extraction with `pdf-parse`, `mammoth`, `xlsx`, and Tesseract is private, free, and fast. A future optional flag may opt into vision-based extraction for hard cases.

**Why not put the converter registry in `common/`?**
The registry is intrinsically about the conversion domain. Moving it under `common/` would violate the "common is domain-free" rule and would make it harder to discover. It belongs to the module that owns it.

**Why a `dto/` folder for a single file?**
Consistency. As soon as the second endpoint is added, the second DTO file lives next to the first. Avoiding a folder today means moving a file tomorrow.
