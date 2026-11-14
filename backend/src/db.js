const { Pool } = require('pg');

function createPool(connectionString) {
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
}

module.exports = { createPool };
