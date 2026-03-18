const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { Queue } = require("bullmq");
const { Worker } = require("bullmq");
const fs = require("fs/promises");
const path = require("path");
const util = require("util");
const { exec } = require("child_process");
const execPromise = util.promisify(exec);
const app = express();

app.use(express.json());

const SessionDB = {};
const executionDB = {};
console.log("executionDB", executionDB);

const redisOptions = {
  host: "127.0.0.1",
  port: 6379,
};

const codeExecutionQueue = new Queue("code-execution", {
  connection: redisOptions,
});

app.post("/code-sessions", (req, res) => {
  const SessionId = uuidv4();

  const language = req.body.language || "python";
  console.log(`[Tiếp tân ] đã tạo thành công phòng code: ${SessionId}`);

  SessionDB[SessionId] = {
    status: "ACTIVE",
    language: language,
    source_code: "",
  };
  res.status(200).json({
    session_id: SessionId,
    status: "ACTIVE",
  });
});

app.patch("/code-sessions/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const { language, source_code } = req.body;

  if (!SessionDB[sessionId]) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (language) {
    SessionDB[sessionId].language = language;
  }
  if (source_code !== undefined) {
    SessionDB[sessionId].source_code = source_code;
  }
  console.log(`[Tiếp tân đã tự động lưu code cho phòng: ${sessionId}]`);
  res.status(200).json({
    session_id: sessionId,
    status: SessionDB[sessionId].status,
  });
});

app.post("/code-sessions/:sessionId/run", async (req, res) => {
  const sessionId = req.params.sessionId;

  if (!SessionDB[sessionId]) {
    return res.status(404).json({ error: "Không tìm thấy phiên làm việc!" });
  }
  const language = SessionDB[sessionId].language;
  const sourceCode = SessionDB[sessionId].source_code;

  if (!sourceCode || sourceCode.trim() === "") {
    return res.status(400).json({ error: "Chưa thấy đoạn code nào chạy" });
  }
  const executionId = uuidv4();
  console.log("executionId", executionId);
  executionDB[executionId] = {
    session_id: sessionId,
    status: "QUEUE",
    stdout: null,
    sterr: null,
    execution_time_ms: null,
  };

  await codeExecutionQueue.add("run-code-job", {
    execution_id: executionId,
    session_id: sessionId,
    language: language,
    source_code: sourceCode,
  });
  console.log(`[Tiếp tân] Đã ném code vào Queue. Mã thực thi: ${executionId}`);
  res.status(200).json({
    execution_id: executionId,
    status: "QUEUE",
  });
});

const codeWorker = new Worker(
  "code-execution",
  async (job) => {
    const { execution_id, session_id, language, source_code } = job.data;
    console.log(
      `\n👷 [Anh thợ] Đang chạy thật vé ${execution_id} bằng ${language}...`
    );
    executionDB[execution_id].status = "RUNNING";
    const startTime = Date.now();
    let outputReSult = "";
    let errorResult = "";

    try {
      if (language.toLowerCase() === "python") {
        const fileName = `temp_${execution_id}.py`;
        const filePath = path.join(__dirname, fileName);
        console.log(`👉 1. Đang tạo file tạm ở: ${filePath}`);
        await fs.writeFile(filePath, source_code);
        console.log(`👉 2. Đã lưu file xong! Đang gọi Python...`);
        try {
          const { stdout, stderr } = await execPromise(
            `python -X utf8 "${filePath}"`,
            { timeout: 5000 }
          );
          outputReSult = stdout;
          errorResult = stderr;
        } catch (execError) {
          outputReSult = execError.stdout || "";
          errorResult = execError.stderr || execError.message;
          if (execError.killed) {
            errorResult =
              "LỖI TIMEOUT: Code chạy quá 5 giây (Có thể do lặp vô hạn). Đã bị hệ thống ngắt!";
          }
        } finally {
          console.log(`👉 4. Đang dọn dẹp xóa file tạm...`);
          await fs
            .unlink(filePath)
            .catch((e) => console.log("Không xóa được file:", e));
        }
      } else {
        errorResult = "Hiện tại Anh thợ chỉ mới biết chạy Python thôi nha!";
      }
    } catch (systemError) {
      errorResult = "Lỗi hệ thống: " + systemError.message;
    }
    // await new Promise((resolve) => setTimeout(resolve, 2000));

    // const simulatedOutput = `Output giả lập của đoạn code: ${source_code}`;
    const endTime = Date.now();

    executionDB[execution_id].status = errorResult ? "FAILED" : "COMPLETED";
    executionDB[execution_id].stdout = outputReSult;
    executionDB[execution_id].stderr = errorResult;
    executionDB[execution_id].execution_time_ms = endTime - startTime;
    console.log(
      `✅ [Anh thợ] Xong vé ${execution_id}! Mất ${endTime - startTime}ms`
    );
  },
  { connection: redisOptions }
);
codeWorker.on("error", (err) => {
  console.log("❌ [Anh thợ] Gặp tai nạn lao động:", err);
});

app.get("/executions/:executionId", (req, res) => {
  const executionId = req.params.executionId;
  if (!executionDB[executionId]) {
    return res.status(404).json({ error: "Không tìm thấy mã thực thi này!" });
  }
  res.status(200).json({
    execution_id: executionId,
    status: executionDB[executionId].status,
    stdout: executionDB[executionId].stdout,
    stderr: executionDB[executionId].stderr,
    execution_time_ms: executionDB[executionId].execution_time_ms,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Rạp phim (Server) đã mở cửa tại http://localhost:${PORT}`);
});
