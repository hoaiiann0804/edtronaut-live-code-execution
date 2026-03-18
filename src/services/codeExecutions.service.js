const { v4: uuidv4 } = require("uuid");
const { codeExecutionQueue } = require("../lib/queue");
const pool = require("../database/pool");

const runCode = async (sessionId) => {
  try {
    const sessionResult = await pool.query(
      "SELECT * FROM code_sessions WHERE session_id = $1",
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      return { success: false, status: 404, error: "Session not found" };
    }

    const session = sessionResult.rows[0];
    const { language, source_code } = session;

    if (!source_code || source_code.trim() === "") {
      return { success: false, status: 400, error: "Source code is empty" };
    }

    const executionId = uuidv4();

    await pool.query(
      "INSERT INTO code_executions (execution_id, session_id, status) VALUES ($1, $2, 'QUEUED')",
      [executionId, sessionId]
    );

    await codeExecutionQueue.add(
      "run-code-job",
      {
        execution_id: executionId,
        language: language,
        source_code: source_code,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    return {
      success: true,
      status: 202,
      data: { execution_id: executionId, status: "QUEUED" },
    };
  } catch (err) {
    return { success: false, status: 500, error: "Internal server error" };
  }
};

const getExecution = async (executionId) => {
  try {
    const result = await pool.query(
      "SELECT * FROM code_executions WHERE execution_id = $1",
      [executionId]
    );
    if (result.rows.length === 0) {
      return { success: false, status: 404, error: "Execution not found" };
    }
    return { success: true, status: 200, data: result.rows[0] };
  } catch (err) {
    return { success: false, status: 500, error: "Internal server error" };
  }
};

module.exports = {
  runCode,
  getExecution,
};
