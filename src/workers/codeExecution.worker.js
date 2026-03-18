const { Worker } = require("bullmq");
const fs = require("fs/promises");
const path = require("path");
const Docker = require("dockerode");

const config = require("../config");
const pool = require("../database/pool");

const docker = new Docker();

const EXECUTION_IMAGES = {
  python: "python:3.9-slim",
  javascript: "node:18-alpine",
};

const codeWorker = new Worker(
  "code-execution",
  async (job) => {
    const { execution_id, language, source_code } = job.data;

    const imageName = EXECUTION_IMAGES[language];
    if (!imageName) {
      await pool.query(
        "UPDATE code_executions SET status = 'FAILED', stderr = 'Language not supported' WHERE execution_id = $1",
        [execution_id]
      );
      return;
    }

    await pool.query(
      "UPDATE code_executions SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP WHERE execution_id = $1",
      [execution_id]
    );

    const startTime = Date.now();
    let status = "COMPLETED";
    let outputResult = "";
    let errorResult = "";

    const encodedCode = Buffer.from(source_code).toString("base64");

    try {
      try {
        await docker.getImage(imageName).inspect();
      } catch (inspectErr) {
        if (
          inspectErr.statusCode == 404 ||
          String(inspectErr.message).includes("404")
        ) {
          const stream = await docker.pull(imageName);
          await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) =>
              err ? reject(err) : resolve(res)
            );
          });
        } else {
          throw inspectErr;
        }
      }

      const command = [
        "sh",
        "-c",
        language === "python"
          ? `echo "${encodedCode}" | base64 -d > /tmp/code.py && exec python -u /tmp/code.py`
          : `echo "${encodedCode}" | base64 -d > /tmp/code.js && exec node /tmp/code.js`,
      ];

      const container = await docker.createContainer({
        Image: imageName,
        Cmd: command,
        HostConfig: {
          NetworkMode: "none",
          Memory: 128 * 1024 * 1024,
        },
      });

      try {
        await container.start();

        const EXECUTION_TIMEOUT_MS = 5000;
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve({ isTimeout: true }), EXECUTION_TIMEOUT_MS)
        );

        const waitResult = await Promise.race([
          container.wait(),
          timeoutPromise,
        ]);

        if (waitResult && waitResult.isTimeout) {
          status = "TIMEOUT";
          errorResult = `Execution timed out after ${
            EXECUTION_TIMEOUT_MS / 1000
          } seconds. Infinite loop detected.`;
          await container.kill().catch(() => {});
        }

        const logsBuffer = await container.logs({ stdout: true, stderr: true });

        if (Buffer.isBuffer(logsBuffer)) {
          let offset = 0;
          while (offset + 8 <= logsBuffer.length) {
            const type = logsBuffer[offset];
            const payloadSize = logsBuffer.readUInt32BE(offset + 4);
            offset += 8;
            if (offset + payloadSize > logsBuffer.length) break;

            const payload = logsBuffer.toString(
              "utf8",
              offset,
              offset + payloadSize
            );
            if (type === 1) outputResult += payload;
            else if (type === 2) errorResult += payload;

            offset += payloadSize;
          }
        } else {
          outputResult = String(logsBuffer || "");
        }

        if (status !== "TIMEOUT") {
          if (waitResult.StatusCode !== 0) {
            status = "FAILED";
            errorResult =
              errorResult ||
              outputResult ||
              "Execution failed with non-zero exit code.";
          }
        }
      } finally {
        try {
          await container.remove({ force: true });
        } catch (e) {}
      }
    } catch (error) {
      status = "FAILED";
      errorResult =
        error.message ||
        "An unexpected error occurred during Docker execution.";
    } finally {
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const updateQuery = `
        UPDATE code_executions 
        SET status = $1, stdout = $2, stderr = $3, execution_time_ms = $4, finished_at = CURRENT_TIMESTAMP
        WHERE execution_id = $5
      `;
      await pool.query(updateQuery, [
        status,
        outputResult,
        errorResult,
        executionTime,
        execution_id,
      ]);
    }
  },
  {
    connection: config.redis,
    concurrency: 5,
  }
);

module.exports = codeWorker;
