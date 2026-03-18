const express = require("express");
require("dotenv").config();
const routes = require("../routes");
require("../workers/codeExecution.worker");

const app = express();

app.use(express.json());
app.use("/", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT);
