# file-to-markdown

A small Node.js service that takes a document — PDF, DOCX, XLSX, CSV, HTML, an image, plain text — and gives you back clean Markdown.

That's it. No magic, no LLM calls, no vector database. Just the boring (and surprisingly painful) first step of every "chat with your documents" project.

> **Status:** the conversion endpoint works for all formats listed below. Anything related to chunking, embeddings, retrieval, or RAG is **not built yet** — see the [Roadmap](#roadmap) for what's planned.

---

## The problem this solves

If you've ever tried to feed a PDF or a Word file into an LLM, you've probably hit one or more of these:

- The PDF you uploaded turned into 40,000 tokens of garbage where 5,000 tokens of actual content was hiding underneath page numbers, repeated headers, and broken hyphenated words.
- Your RAG pipeline retrieves the right "chunk" but the chunk is half a sentence stitched onto a fragment of a footer, so the answer is useless.
- You found Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) and it's great — except it's Python, and your stack is Node.
- You parsed a DOCX with one library, an XLSX with another, an image with a third, and now you have a `utils/parsers/` folder that no one wants to touch.

This project is the answer to "is there a single thing I can POST a file to and get back nice Markdown?". For Node.

The reason Markdown specifically: LLMs were trained on a *lot* of it (every README, every Wikipedia page, half of Stack Overflow), so they parse `## Section Heading` and GFM tables natively. Compared to raw extracted text, Markdown:

- drops 30–70% of the tokens (real numbers from messy PDFs we tested with)
- keeps the structure — headings, lists, tables — instead of flattening everything to one long paragraph
- is trivially diffable, viewable, and chunkable later by whatever pipeline picks it up

---

## What you can do today

- POST a file, get Markdown back
- Get a token count of the output (cl100k_base, the encoder GPT-4/4o use) so you can budget your context window
- Get per-format metadata: page count for PDFs, sheet names for XLSX, OCR confidence for images, etc.
- Hit `/api/convert/formats` to discover what's supported at runtime

That's the whole API surface right now. Three endpoints. Stateless. No database.

## What you can't do today

- ❌ Get back chunked output ready for embeddings — coming, see roadmap
- ❌ Run embeddings, store vectors, query a vector DB — out of scope, this service is one step in that pipeline, not the whole pipeline
- ❌ Async / batch jobs for huge files — synchronous only for now
- ❌ Auth, per-user history, billing — none of it. Run it behind your own gateway if you expose it to the internet.

---

## Supported formats

| Extension | What's used | Notes |
| --- | --- | --- |
| `.pdf` | `pdf-parse` | Text-layer only. Scanned PDFs (no text layer) come out empty — OCR fallback is on the roadmap. |
| `.docx` | `mammoth` → `turndown` | DOCX → semantic HTML → Markdown. This path is genuinely good. |
| `.xlsx`, `.xls` | `xlsx` (SheetJS) | Each sheet becomes its own `## Heading` plus a GFM table. |
| `.csv` | `papaparse` | First row is the header. |
| `.html`, `.htm` | `turndown` + GFM plugin | |
| `.png`, `.jpg`, `.jpeg`, `.webp` | `tesseract.js` | OCR, English by default. Slow. First call downloads ~10 MB of language data. |
| `.txt`, `.md` | (passthrough) | |

Unknown extensions fall back to MIME-type sniffing. Genuinely unrecognised types return `415`.

---

## Quick start

```bash
git clone https://github.com/Arindam-Roy2004/File-to-markdown.git
cd File-to-markdown
cp .env.example .env
npm install
npm run dev
```

Server runs on `http://localhost:3000`.

```bash
curl http://localhost:3000/health
# {"ok":true}

curl -F "file=@your-document.pdf" http://localhost:3000/api/convert
```

---

## API

### `POST /api/convert`

Multipart upload, field name `file`.

```bash
curl -F "file=@notes.docx" http://localhost:3000/api/convert
```

Response:

```json
{
  "filename": "notes.docx",
  "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "sizeBytes": 23042,
  "tokens": 412,
  "meta": { "converter": "docx", "warnings": 0 },
  "markdown": "# Notes\n\n..."
}
```

Errors come back as:

```json
{ "error": { "message": "...", "code": "..." } }
```

with stable codes: `VALIDATION_ERROR` (400), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), or `INTERNAL_ERROR` (500).

### `GET /api/convert/formats`

Returns the registered converters and their extensions. Useful if you're building a UI and want to show the user what they can drop in.

### `GET /health`

Liveness probe. Returns `{"ok": true}` whenever the process is alive.

---

## Where this fits in a RAG pipeline

If you're here because you want to do RAG, here's the honest picture:

```
[ Documents ] → [ file-to-markdown ] → [ chunk ] → [ embed ] → [ vector DB ]
                       │                   │           │            │
                       │                   │           │            └── Pinecone, Weaviate, pgvector, ...
                       │                   │           └────────────── OpenAI, Cohere, local models, ...
                       │                   └────────────────────────── LangChain text splitters, your own splitter
                       └────────────────────────────────────────────── this project does this box only
```

Right now this service is the **first** box. Everything to the right of it is your problem (or, eventually, on the roadmap below).

The reason Markdown matters for the next steps:

- **chunking** — splitting on Markdown headings (`#`, `##`, ...) is one line of code and produces semantically self-contained chunks. Try doing that on raw PDF output.
- **embeddings** — cleaner input means cleaner vectors. Garbage in, garbage out applies *very* literally to embedding models.
- **the LLM step** — once you've retrieved chunks, you stuff them into a prompt. Markdown chunks land cleanly in the prompt; raw extracted text drags a tail of layout noise that costs tokens and confuses the model.

So this project doesn't *do* RAG. But it makes the part *before* RAG actually pleasant.

---

## Project layout

```
src/
├── app.js                            Express setup
├── server.js                         start, signals, shutdown
│
├── common/                           shared, non-domain code
│   ├── config/                       reads env in one place
│   ├── errors/                       AppError + typed subclasses
│   ├── logger/                       pino
│   ├── middleware/                   upload, error handler, request logger
│   ├── security/                     helmet, cors, rate limit
│   └── utils/                        htmlToMarkdown, tokenCounter
│
├── modules/
│   └── conversion/                   the only feature module today
│       ├── conversion.routes.js
│       ├── conversion.controller.js  thin
│       ├── conversion.service.js     business logic
│       ├── conversion.validation.js
│       ├── conversion.constants.js
│       ├── converter.registry.js     extension → converter mapping
│       ├── converters/               one file per format
│       └── dto/
│
└── routes/index.js                   /api router
```

For the long version of why each file exists, read [`docs/architecture.md`](docs/architecture.md).

---

## Adding a new format

This is the one thing I really want to keep easy. Adding `.pptx` or anything else is three steps and you don't touch the controller, service, routes, or DTO.

1. Drop a file in `src/modules/conversion/converters/` exporting `{ name, async run(buffer, ctx) }`.
2. Add the extension constant in `conversion.constants.js`.
3. Wire it into `converter.registry.js`.

Done.

---

## Configuration

All config comes from environment variables. Nothing reads `process.env` directly except `src/common/config/index.js`. Copy `.env.example` to `.env` and edit.

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | switches log format and error verbosity |
| `LOG_LEVEL` | `info` | pino level |
| `UPLOAD_DIR` | `./uploads` | where multipart uploads land temporarily |
| `MAX_UPLOAD_MB` | `25` | hard cap; bigger uploads get a 413 |
| `CORS_ORIGIN` | `*` | tighten this in production |
| `RATE_LIMIT_WINDOW_MS` | `60000` | rate-limit window |
| `RATE_LIMIT_MAX` | `60` | requests per IP per window |

For real deployments, don't ship a `.env`. Use whatever your host gives you (Render env vars, Railway secrets, AWS Secrets Manager, etc.).

---

## Things to know before deploying this

- The `xlsx` package on npm has open advisories that the maintainer ships fixes for only on the SheetJS CDN. For an FYP / hobby project this is fine. For production, swap in `exceljs`.
- OCR via `tesseract.js` is single-threaded JavaScript and *slow* — about 1–3 seconds per page on a normal laptop. If you expect lots of image input, run multiple worker processes or move OCR to a queue.
- Big PDFs block the Node event loop while parsing. `pdf-parse` doesn't stream. If you need to convert 500-page PDFs, run conversions in a separate worker process or move to a queue.
- There's no auth. Put it behind something that authenticates if you expose it.

---

## Roadmap

Stuff that isn't built yet, roughly in the order I'd like to do it:

- `/api/convert/chunks` — Markdown in, RAG-ready chunks out. Heading-aware splitting with configurable size and overlap. **This is the next thing.**
- OCR fallback for scanned PDFs (detect empty text layer → run through Tesseract automatically)
- Layout-aware PDF parsing using `pdfjs-dist` so columns and tables don't get scrambled
- PPTX support (`officeparser`)
- Async job queue for big or slow conversions (BullMQ + Redis)
- Token cost estimator for GPT-4o, Claude, Gemini side by side
- Streaming response for huge outputs
- A small React front-end with drag-and-drop
- Auth + per-user upload history
- Docker image + `docker-compose.yml`

Embeddings, vector storage, and retrieval will probably live in a sibling repo when I get there, not in this one. This service should stay focused on doing one thing well.

---

## License

ISC. See `LICENSE`.
