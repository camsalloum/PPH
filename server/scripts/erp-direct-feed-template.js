/*
  ERP Direct Feed Template
  ------------------------
  Fill in the required settings below (preferably via environment variables).

  Use:
    MODE=api  -> call ERP REST API
    MODE=db   -> connect to ERP database view/table

  Notes:
  - Keep credentials out of source control. Use .env or secret manager.
  - If using DB mode, install a driver:
      - Oracle: npm i oracledb
      - ODBC:   npm i odbc
  - If using API mode and Node < 18, install: npm i node-fetch
*/

const MODE = process.env.ERP_MODE || "api"; // "api" or "db"

const config = {
  // === API MODE SETTINGS ===
  api: {
    baseUrl: process.env.ERP_API_BASE_URL || "https://erp.example.com",
    endpoint: process.env.ERP_API_ENDPOINT || "/v1/actuals",
    authType: process.env.ERP_API_AUTH_TYPE || "bearer", // bearer | basic | oauth2
    // Bearer token
    token: process.env.ERP_API_TOKEN || "",
    // Basic auth
    username: process.env.ERP_API_USER || "",
    password: process.env.ERP_API_PASSWORD || "",
    // OAuth2 client credentials
    clientId: process.env.ERP_API_CLIENT_ID || "",
    clientSecret: process.env.ERP_API_CLIENT_SECRET || "",
    tokenUrl: process.env.ERP_API_TOKEN_URL || "",
    scope: process.env.ERP_API_SCOPE || "",
    // Request options
    params: {
      // Example: fromDate, toDate, period, company, division, etc.
      // fromDate: "2025-01-01",
      // toDate: "2025-12-31",
    },
  },

  // === DB MODE SETTINGS ===
  db: {
    driver: process.env.ERP_DB_DRIVER || "oracle", // oracle | odbc
    host: process.env.ERP_DB_HOST || "PRODDB-SCAN.ITSUPPORT.HG",
    port: Number(process.env.ERP_DB_PORT || 1521),
    service: process.env.ERP_DB_SERVICE || "REPDB",
    user: process.env.ERP_DB_USER || "",
    password: process.env.ERP_DB_PASSWORD || "",
    schema: process.env.ERP_DB_SCHEMA || "HAP111",
    object: process.env.ERP_DB_OBJECT || "XL_FPSALESVSCOST_FULL",
    // Optional filters
    where: process.env.ERP_DB_WHERE || "",
  },
};

async function main() {
  if (MODE === "api") {
    await fetchFromApi(config.api);
  } else if (MODE === "db") {
    await fetchFromDb(config.db);
  } else {
    throw new Error("ERP_MODE must be 'api' or 'db'.");
  }
}

// ===== API MODE =====
async function fetchFromApi(api) {
  const url = new URL(api.endpoint, api.baseUrl);
  Object.entries(api.params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const headers = { "Accept": "application/json" };

  if (api.authType === "bearer") {
    if (!api.token) throw new Error("ERP_API_TOKEN is required for bearer auth.");
    headers.Authorization = `Bearer ${api.token}`;
  } else if (api.authType === "basic") {
    if (!api.username || !api.password) throw new Error("ERP_API_USER/ERP_API_PASSWORD required for basic auth.");
    headers.Authorization = `Basic ${Buffer.from(`${api.username}:${api.password}`).toString("base64")}`;
  } else if (api.authType === "oauth2") {
    const token = await fetchOAuthToken(api);
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API request failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  console.log("API rows:", Array.isArray(data) ? data.length : "object");
  return data;
}

async function fetchOAuthToken(api) {
  if (!api.tokenUrl || !api.clientId || !api.clientSecret) {
    throw new Error("ERP_API_TOKEN_URL, ERP_API_CLIENT_ID, ERP_API_CLIENT_SECRET required for oauth2.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: api.clientId,
    client_secret: api.clientSecret,
    scope: api.scope || "",
  });

  const res = await fetch(api.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token request failed ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}

// ===== DB MODE =====
async function fetchFromDb(db) {
  if (!db.user || !db.password) throw new Error("ERP_DB_USER and ERP_DB_PASSWORD are required.");

  const fullObject = `${db.schema}.${db.object}`;
  const sql = `SELECT * FROM ${fullObject}${db.where ? ` WHERE ${db.where}` : ""}`;

  if (db.driver === "oracle") {
    // npm i oracledb
    const oracledb = require("oracledb");
    const connectString = `${db.host}:${db.port}/${db.service}`;

    const connection = await oracledb.getConnection({
      user: db.user,
      password: db.password,
      connectString,
    });

    try {
      const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log("DB rows:", result.rows?.length || 0);
      return result.rows;
    } finally {
      await connection.close();
    }
  }

  if (db.driver === "odbc") {
    // npm i odbc
    const odbc = require("odbc");
    const connectionString = `Driver={Oracle in OraClient19Home1};Dbq=${db.host}:${db.port}/${db.service};Uid=${db.user};Pwd=${db.password};`;

    const connection = await odbc.connect(connectionString);
    try {
      const result = await connection.query(sql);
      console.log("DB rows:", result.length || 0);
      return result;
    } finally {
      await connection.close();
    }
  }

  throw new Error("Unsupported ERP_DB_DRIVER. Use 'oracle' or 'odbc'.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
