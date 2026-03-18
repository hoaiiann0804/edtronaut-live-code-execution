const codeExecutionService = require("../services/codeExecutions.service");

const runCode = async (req, res) => {
  const { sessionId } = req.params;
  const result = await codeExecutionService.runCode(sessionId);

  if (!result.success) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(result.status).json(result.data);
};

const getExecution = async (req, res) => {
  const { executionId } = req.params;
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
