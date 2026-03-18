const { Queue } = require("bullmq");
const config = require("../config");

const codeExecutionQueue = new Queue("code-execution", {
  connection: config.redis,
});

module.exports = {
  codeExecutionQueue,
};
