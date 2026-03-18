const express = require("express");
const router = express.Router();
const codeSessionController = require("../controllers/codeSessions.controller");
const codeExecutionController = require("../controllers/codeExecutions.controller");

router.post("/code-sessions", codeSessionController.createSession);
router.patch("/code-sessions/:sessionId", codeSessionController.updateSession);
router.post("/code-sessions/:sessionId/run", codeExecutionController.runCode);
router.get("/executions/:executionId", codeExecutionController.getExecution);

module.exports = router;
