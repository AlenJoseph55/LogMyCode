# LogMyCode API Documentation

This document describes the REST API endpoints provided by the **LogMyCode** backend service.

- **Production Base URL (Default)**: `https://logmycode-production.up.railway.app`
- **Local Base URL**: `http://localhost:4001`
- **Swagger UI**:
  - Production: `https://logmycode-production.up.railway.app/api-docs`
  - Local: `http://localhost:4001/api-docs`
- **Raw OpenAPI Spec (JSON)**: [`openapi.json`](./openapi.json) / `/api-docs.json`
- **Raw OpenAPI Spec (YAML)**: [`openapi.yaml`](./openapi.yaml)

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
  - [1. Ingest Commits & Generate Daily Summary (`POST /api/commits`)](#1-ingest-commits--generate-daily-summary-post-apicommits)
  - [2. Get Daily Summary (`GET /api/daily-summary`)](#2-get-daily-summary-get-apidaily-summary)
  - [3. Get Recent Summaries (`GET /api/recent-summaries`)](#3-get-recent-summaries-get-apirecent-summaries)
  - [4. Health Check (`GET /health`)](#4-health-check-get-health)
- [Data Models & Zod Schemas](#data-models--zod-schemas)

---

## Overview

The LogMyCode backend acts as the bridge between the client extension and cloud AI inference:

1. Receives multi-repository Git commits and developer activity notes.
2. Persists normalized commit records and daily summaries in PostgreSQL (NeonDB).
3. Synthesizes concise, action-oriented bullet points using Groq's high-speed Llama-3.3-70B model.
4. Performs chronological lookback queries to provide previous workday context ("smart yesterday") for standups.

### Rate Limiting

All `/api/*` endpoints are currently rate-limited to **10 requests per hour per IP** using standard draft-7 rate limit headers (`RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`). Exceeding this limit returns HTTP `429 Too Many Requests`. Documentation and `/health` endpoints are exempt.

---

## Endpoints

### 1. Ingest Commits & Generate Daily Summary (`POST /api/commits`)

Ingests commits across repositories for a given user and date, executes AI summarization via Groq, stores the records in the database, and returns today's generated summary along with the previous workday's summary.

- **Method**: `POST`
- **URL**: `/api/commits`
- **Headers**:
  - `Content-Type: application/json`

#### Request Body

```json
{
  "userId": "alen_joseph",
  "date": "2026-10-07",
  "template": "standup",
  "otherActivities": "Conducted sprint backlog refinement; assisted DevOps team in resolving staging deployment pipeline.",
  "repos": [
    {
      "name": "LogMyCode-backend",
      "commits": [
        {
          "hash": "a1b2c3d4e5f678901234567890abcdef12345678",
          "message": "feat: add Swagger UI and OpenAPI documentation endpoints",
          "timestamp": "2026-10-07T14:32:00Z"
        },
        {
          "hash": "b2c3d4e5f678901234567890abcdef12345678a1",
          "message": "fix: handle weekend gaps in latest summary lookback query",
          "timestamp": "2026-10-07T16:15:22Z"
        }
      ]
    },
    {
      "name": "LogMyCode-vscode-extension",
      "commits": [
        {
          "hash": "c3d4e5f678901234567890abcdef12345678a1b2",
          "message": "style: align webview colors with active VS Code theme tokens",
          "timestamp": "2026-10-07T11:05:40Z"
        }
      ]
    }
  ]
}
```

#### Fields:

| Field             | Type     | Required | Description                                                                    |
| ----------------- | -------- | -------- | ------------------------------------------------------------------------------ |
| `userId`          | `string` | Yes      | Unique identifier for developer (e.g. username or Git handle).                 |
| `date`            | `string` | Yes      | Date string formatted as `YYYY-MM-DD`.                                         |
| `repos`           | `array`  | Yes      | Array of repositories containing commits made on this date.                    |
| `template`        | `string` | No       | Prompt formatting style (e.g. `"standup"`, `"bullet"`).                        |
| `otherActivities` | `string` | No       | Freeform developer notes on non-Git work (meetings, reviews, design sessions). |

#### Response (`200 OK`)

```json
{
  "userId": "alen_joseph",
  "date": "2026-10-07",
  "summary": "- Added Swagger UI and OpenAPI documentation endpoints to backend service\n- Fixed weekend date gap resolution in smart yesterday summary lookback\n- Synchronized VS Code webview theme tokens with active IDE palette\n- Conducted sprint backlog refinement with product team\n- Assisted DevOps with staging deployment pipeline stabilization",
  "repos": [
    {
      "name": "LogMyCode-backend",
      "commits": [
        {
          "hash": "a1b2c3d4e5f678901234567890abcdef12345678",
          "message": "feat: add Swagger UI and OpenAPI documentation endpoints"
        },
        {
          "hash": "b2c3d4e5f678901234567890abcdef12345678a1",
          "message": "fix: handle weekend gaps in latest summary lookback query"
        }
      ]
    },
    {
      "name": "LogMyCode-vscode-extension",
      "commits": [
        {
          "hash": "c3d4e5f678901234567890abcdef12345678a1b2",
          "message": "style: align webview colors with active VS Code theme tokens"
        }
      ]
    }
  ],
  "yesterday": {
    "date": "2026-10-06",
    "summary": "- Refactored database connection pooling for Neon serverless\n- Implemented commit deduplication filter in VS Code GitService",
    "totalCommits": 4
  }
}
```

#### Error Responses

- **`400 Bad Request`**:
  ```json
  {
    "error": "Invalid payload",
    "details": {
      "date": { "_errors": ["Expected string, received undefined"] }
    }
  }
  ```
- **`500 Internal Server Error`**:
  ```json
  {
    "error": "Internal Server Error"
  }
  ```

---

### 2. Get Daily Summary (`GET /api/daily-summary`)

Retrieves an existing saved summary and unique commits grouped by repository for a specific user and date without triggering LLM inference.

- **Method**: `GET`
- **URL**: `/api/daily-summary`
- **Query Parameters**:
  - `userId` (required, `string`): Developer ID.
  - `date` (required, `string`): Date in `YYYY-MM-DD` format.

#### Example Request

```bash
curl -X GET "http://localhost:4001/api/daily-summary?userId=alen_joseph&date=2026-10-07"
```

#### Response (`200 OK`)

```json
{
  "userId": "alen_joseph",
  "date": "2026-10-07",
  "summary": "- Added Swagger UI and OpenAPI documentation endpoints to backend service\n- Fixed weekend date gap resolution in smart yesterday summary lookback",
  "repos": [
    {
      "name": "LogMyCode-backend",
      "commits": [
        {
          "hash": "a1b2c3d4e5f678901234567890abcdef12345678",
          "message": "feat: add Swagger UI and OpenAPI documentation endpoints"
        }
      ]
    }
  ]
}
```

---

### 3. Get Recent Summaries (`GET /api/recent-summaries`)

Fetches the summary metadata for today and the most recent prior workday ("smart yesterday") for comparison in standup formats. Automatically resolves weekend and holiday gaps.

- **Method**: `GET`
- **URL**: `/api/recent-summaries`
- **Query Parameters**:
  - `userId` (required, `string`): Developer ID.
  - `date` (optional, `string`): Reference date in `YYYY-MM-DD` format.

#### Example Request

```bash
curl -X GET "http://localhost:4001/api/recent-summaries?userId=alen_joseph&date=2026-10-07"
```

#### Response (`200 OK`)

```json
{
  "userId": "alen_joseph",
  "today": {
    "date": "2026-10-07",
    "summary": "- Added Swagger UI and OpenAPI documentation endpoints to backend service",
    "totalCommits": 3
  },
  "yesterday": {
    "date": "2026-10-06",
    "summary": "- Refactored database connection pooling for Neon serverless",
    "totalCommits": 4
  }
}
```

---

### 4. Health Check (`GET /health`)

Liveness check for container orchestration and uptime monitoring.

- **Method**: `GET`
- **URL**: `/health`

#### Response (`200 OK`)

```json
{
  "status": "ok"
}
```

---

## Interactive Swagger Documentation

When running the backend server locally:

```bash
cd packages/backend
pnpm run dev
```

Visit **`http://localhost:4001/api-docs`** in your browser to interactively test endpoints, inspect schemas, and view real payload examples directly from the Swagger UI console.
