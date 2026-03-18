const { Client } = require("pg");
const config = require("../config");

const client = new Client(config.postgres);

const createTables = async () => {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS code_sessions (
        session_id UUID PRIMARY KEY,
        status VARCHAR(255) NOT NULL,
        language VARCHAR(255) NOT NULL,
        source_code TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS code_executions (
        execution_id UUID PRIMARY KEY,
        session_id UUID REFERENCES code_sessions(session_id),
        status VARCHAR(255) NOT NULL,
        stdout TEXT,
        stderr TEXT,
        execution_time_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP WITH TIME ZONE,
        finished_at TIMESTAMP WITH TIME ZONE
      );
    `);
  } catch (err) {
  } finally {
    await client.end();
  }
};

createTables();
