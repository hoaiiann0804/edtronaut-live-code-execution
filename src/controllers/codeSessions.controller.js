const { v4: uuidv4 } = require("uuid");
const pool = require("../database/pool");

const SUPPORTED_LANGUAGES = ["python", "javascript"];

const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const createSession = async (req, res) => {
  const language = req.body.language || "python";

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({
      error: `Unsupported language. Allowed: ${SUPPORTED_LANGUAGES.join(", ")}`,
    });
  }

  const sessionId = uuidv4();

  try {
    const query = `
      INSERT INTO code_sessions (session_id, status, language, source_code) 
      VALUES ($1, 'ACTIVE', $2, '')
    `;
    await pool.query(query, [sessionId, language]);

    res.status(201).json({
      session_id: sessionId,
      status: "ACTIVE",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateSession = async (req, res) => {
  const { sessionId } = req.params;
  const { language, source_code } = req.body;

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ error: "Invalid session_id format" });
  }

  if (language !== undefined && !SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({
      error: `Unsupported language. Allowed: ${SUPPORTED_LANGUAGES.join(", ")}`,
    });
  }
  if (source_code !== undefined && typeof source_code !== "string") {
    return res.status(400).json({ error: "source_code must be a string" });
  }

  try {
    const sessionResult = await pool.query(
      "SELECT * FROM code_sessions WHERE session_id = $1",
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const updateFields = {};
    if (language) updateFields.language = language;
    if (source_code !== undefined) updateFields.source_code = source_code;

    if (Object.keys(updateFields).length > 0) {
      const setClauses = Object.keys(updateFields)
        .map((key, i) => `${key} = $${i + 2}`)
        .join(", ");

      const values = [sessionId, ...Object.values(updateFields)];

      const updateQuery = `UPDATE code_sessions SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`;
      await pool.query(updateQuery, values);
    }

    res.status(200).json({
      session_id: sessionId,
      status: "ACTIVE",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  createSession,
  updateSession,
};
