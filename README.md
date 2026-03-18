# Live Code Execution Backend 🚀

A robust, scalable, and secure backend system for executing user-submitted code within an isolated environment. Built as part of the **SWE Intern (Backend) assignment for Edtronaut**.

## ✨ Key Features

- **Live Code Sessions:** Create sessions, autosave code, and execute on demand.
- **Isolated Execution Sandbox:** Uses Docker-in-Docker (DooD) to run code safely with restricted memory (128MB) and zero network access.
- **Asynchronous Processing:** Built on **BullMQ** and **Redis** for non-blocking API responses.
- **Infinite Loop Protection:** Enforces strict execution time limits (5 seconds) using `Promise.race` and forcefully terminates stuck containers.
- **Accurate Log Demultiplexing:** Captures and separates exactly what goes into `stdout` and `stderr` directly from the Docker stream buffers.
- **Comprehensive Observability:** Tracks exact timestamps for every lifecycle stage (`created_at`, `updated_at`, `started_at`, `finished_at`).

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (Express.js)
- **Database:** PostgreSQL 15 (managed via `pg` pool)
- **Queue:** Redis & BullMQ
- **Execution Engine:** Docker API (`dockerode`)
- **Infrastructure:** Docker Compose

---

## 🚀 Getting Started (Local Setup)

### Prerequisites

- Docker and Docker Compose installed on your machine.

### 1. Start the Infrastructure

Run the following command in the root directory to build and start the API, PostgreSQL, and Redis containers in the background:

```bash
docker-compose up -d --build
```

### 2. Initialize the Database

Once the containers are up and running, execute the database setup script to create the necessary tables (`code_sessions` and `code_executions`):

```bash
docker-compose exec app npm run db:setup
```

_Expected output: `Tables created successfully`_

### 3. Usage & Testing

The server is now running on `http://localhost:3000`.

You can use the provided `test-api/test.http` file with the REST Client extension in VS Code to test the complete flow (Python, JavaScript, and Infinite Loop Timeout scenarios).

---

## 📖 API Documentation

### 1. Create a Live Coding Session

**POST** `/code-sessions`

```json
// Request
{ "language": "python" }

// Response (201 Created)
{
  "session_id": "uuid",
  "status": "ACTIVE"
}
```

### 2. Autosave Code (Live Editing)

**PATCH** `/code-sessions/:sessionId`

```json
// Request
{
  "language": "python",
  "source_code": "print('Hello World')"
}

// Response (200 OK)
{
  "session_id": "uuid",
  "status": "ACTIVE"
}
```

### 3. Submit Code for Execution

**POST** `/code-sessions/:sessionId/run`

```json
// Response (202 Accepted)
{
  "execution_id": "uuid",
  "status": "QUEUED"
}
```

### 4. Retrieve Execution Result

**GET** `/executions/:executionId`

```json
// Response (200 OK) - When COMPLETED
{
  "execution_id": "uuid",
  "session_id": "uuid",
  "status": "COMPLETED",
  "stdout": "Hello World\n",
  "stderr": "",
  "execution_time_ms": 120,
  "created_at": "2026-03-18T10:00:00.000Z",
  "started_at": "2026-03-18T10:00:01.000Z",
  "finished_at": "2026-03-18T10:00:01.120Z"
}
```

_Supported Statuses: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `TIMEOUT`._

---

## 📁 Project Structure

- `src/api`: Express Server setup.
- `src/controllers` & `src/routes`: API Layer.
- `src/services`: Business logic & Queue Producer (`BullMQ`).
- `src/workers`: Background job consumer and Docker Engine interaction.
- `src/database`: PostgreSQL connection pool and initialization script.

---

## 🏗️ System Architecture & Design Decisions

### 1. Architecture Overview

#### End-to-End Request Flow

1. **Session Creation & Autosave:** The client interacts directly with the Express API. State and raw source code are synced rapidly to **PostgreSQL**.
2. **Execution Request:** When a run is triggered, the Express Service generates an `execution_id`, stores a `QUEUED` state in PostgreSQL, and pushes the job payload (execution_id, language, code) into a **Redis Queue (BullMQ)**. It immediately returns `202 Accepted` to the client.
3. **Background Worker:** A dedicated Worker consumes jobs from the queue. It updates the DB status to `RUNNING`.
4. **Docker Sandbox:** The worker interacts with the Host's Docker Daemon via the mounted `/var/run/docker.sock`. It creates a fresh, isolated container (`python:3.9-slim` or `node:18-alpine`), base64 decodes the source code inside, and runs it.
5. **Result Polling:** The client polls the `GET /executions/:id` endpoint until the status shifts to `COMPLETED`, `FAILED`, or `TIMEOUT`.

---

### 2. Reliability & Data Model

#### Execution States

The lifecycle of an execution is strictly tracked:
`QUEUED` → `RUNNING` → `COMPLETED` / `FAILED` / `TIMEOUT`.

#### Failure Handling & Idempotency

- **Idempotency:** Each execution request generates a unique `execution_id` (UUID v4) which acts as the Primary Key in PostgreSQL. This guarantees that duplicate execution requests for the same ID will fail at the database level, preventing double-runs.
- **Worker Crash & Retries:** BullMQ is configured with retry logic. If the Docker daemon fails to start the container, the job is retried up to **3 times** with exponential backoff (1s, 2s, 4s).
- **Dead-letter Queue (DLQ):** Jobs that fail all 3 retry attempts are moved to BullMQ's failed queue (acting as a DLQ) for manual inspection, ensuring no job is silently lost.
- **Safety limits (Infinite Loops):** The system protects itself against malicious or broken loops (e.g., `while True:`). Using `Promise.race`, the worker waits a maximum of **5 seconds**. If the container exceeds this, it is forcefully killed via `container.kill()`, and the state is logged as `TIMEOUT`.
- **Log Demultiplexing:** Instead of relying on volatile live streams, the system waits for the container to finish, then pulls the complete binary log buffer. It parses the 8-byte Docker stream headers to perfectly separate `stdout` and `stderr`.

---

### 3. Security & Isolation

Running user-submitted code is inherently dangerous. This system prevents host-system compromise via:

1. **Docker Containerization:** Code is not executed via standard `child_process`. It runs inside a disposable container.
2. **Resource Limits:** `HostConfig.Memory` is hard-capped at **128MB** to prevent OOM (Out of Memory) attacks.
3. **Zero Network Access:** `NetworkMode: "none"` ensures the container has no internet access, preventing users from downloading malware or making outbound API requests.
4. **Base64 Code Transmission:** Instead of using host-volume binds (which can cause permission issues and expose host paths), the raw code is Base64 encoded, passed to the container's bash initialization string, and decoded directly into a temporary `/tmp/code.*` file.

---

### 4. Scalability Considerations

- **Stateless API:** The Express API nodes are completely stateless. They can be scaled horizontally behind a Load Balancer to handle thousands of concurrent `PATCH` (autosave) and `POST` requests.
- **Queue Backlog Handling:** Since code execution is heavy, heavy traffic is absorbed by the Redis Queue.
- **Horizontal Worker Scaling:** More worker instances (or dedicated worker servers) can be spun up effortlessly. They will independently connect to Redis and process jobs concurrently. Currently, the local worker is limited to `concurrency: 5` to avoid overwhelming the local Docker daemon.

---

### 5. Trade-offs

- **Technology Choices:**

  - _PostgreSQL:_ Chosen for strict ACID compliance and relational integrity between `sessions` and `executions`.
  - _Redis + BullMQ:_ Chosen over heavy brokers like RabbitMQ or Kafka because it is incredibly lightweight, perfectly integrated with Node.js, and natively supports robust features like exponential backoff and delayed jobs out of the box.
  - _Docker-in-Docker (DooD):_ Used via `dockerode` instead of a bulky Kubernetes setup to keep the infrastructure portable, lightweight, and easy to run locally with a single `docker-compose up` command, while still achieving strict process isolation.

- **Cold Start vs. Reliability:**
  - _Decision:_ Booting a completely new Docker container for every execution adds an overhead of ~300-500ms per run.
  - _Trade-off:_ While a pre-warmed pool of processes (like running a continuous REPL server) would be faster, creating fresh containers ensures a 100% clean state and maximum security isolation. For a learning platform, reliability and security outweigh sub-millisecond execution times.
- **Polling vs. WebSockets:**
  - _Decision:_ The client must poll the REST API to get execution results.
  - _Trade-off:_ WebSockets or Server-Sent Events (SSE) would provide real-time feedback and save HTTP overhead. However, REST polling is significantly simpler to implement, cache, and scale for an MVP within the assignment timeframe.

---

### 6. What I Would Improve With More Time

1. **WebSockets/SSE:** Implement real-time streaming of stdout/stderr directly to the frontend as the code runs, rather than waiting for the entire process to finish.
2. **Container Pre-warming:** Maintain a small pool of paused containers to eliminate the 500ms Docker cold-start penalty.
3. **Job Cleanup:** Implement a cron job to automatically prune old executions and orphaned Docker images to reclaim disk space.
4. **Rate Limiting:** Add API rate limiting (e.g., via Redis) to prevent "Repeated execution abuse" (spamming the `/run` endpoint).
