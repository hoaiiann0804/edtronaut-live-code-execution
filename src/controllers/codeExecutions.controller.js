const codeExecutionService = require("../services/codeExecutions.service");

const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const runCode = async (req, res) => {
  const { sessionId } = req.params;

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ error: "Invalid session_id format" });
  }

  const result = await codeExecutionService.runCode(sessionId);

  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
};

const getExecution = async (req, res) => {
  const { executionId } = req.params;

  if (!isValidUUID(executionId)) {
    return res.status(400).json({ error: "Invalid execution_id format" });
  }

  const result = await codeExecutionService.getExecution(executionId);

  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
};

module.exports = {
  runCode,
  getExecution,
};
