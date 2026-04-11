const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/config');
const { encryptToken, decryptToken } = require('../utils/tokenEncryption');

const OAUTH_SCOPE = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
].join(' ');

function getConfig() {
  const tenant = process.env.OUTLOOK_TENANT_ID || 'common';
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Outlook OAuth env vars');
  }
  return { tenant, clientId, clientSecret, redirectUri };
}

function getAuthBase(tenant) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

function isAzureConfigured() {
  return !!(
    process.env.OUTLOOK_CLIENT_ID
    && process.env.OUTLOOK_CLIENT_SECRET
    && process.env.OUTLOOK_REDIRECT_URI
  );
}

function createStateToken(userId) {
  return jwt.sign(
    {
      purpose: 'outlook_oauth',
      userId,
      nonce: `${userId}-${Date.now()}`,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyStateToken(stateToken) {
  const decoded = jwt.verify(stateToken, process.env.JWT_SECRET);
  if (!decoded || decoded.purpose !== 'outlook_oauth' || !decoded.userId) {
    throw new Error('Invalid oauth state token');
  }
  return decoded;
}

function getAuthUrl(userId) {
  const { tenant, clientId, redirectUri } = getConfig();
  const state = createStateToken(userId);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: OAUTH_SCOPE,
    state,
    prompt: 'consent',
  });
  return {
    url: `${getAuthBase(tenant)}/authorize?${params.toString()}`,
    state,
  };
}

async function exchangeCodeForTokens(code) {
  const { tenant, clientId, clientSecret, redirectUri } = getConfig();
  const tokenEndpoint = `${getAuthBase(tenant)}/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description || json.error || 'OAuth token exchange failed');
  }
  return json;
}

async function fetchGraphProfile(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to fetch Microsoft profile');
  }
  return json;
}

async function upsertConnection(userId, tokenResponse, profile) {
  const expiresAt = new Date(Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000));
  const accessEnc = encryptToken(tokenResponse.access_token);
  const refreshEnc = tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : null;

  const result = await pool.query(
    `INSERT INTO crm_outlook_connections (
       user_id, microsoft_account_id, email_address,
       access_token_enc, refresh_token_enc, token_expires_at,
       connection_status, error_message, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,'active',NULL,NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       microsoft_account_id = EXCLUDED.microsoft_account_id,
       email_address = EXCLUDED.email_address,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       token_expires_at = EXCLUDED.token_expires_at,
       connection_status = 'active',
       error_message = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      profile.id || null,
      profile.mail || profile.userPrincipalName || null,
      accessEnc,
      refreshEnc,
      expiresAt,
    ]
  );

  return result.rows[0];
}

async function getConnectionStatus(userId) {
  const result = await pool.query(
    `SELECT user_id, email_address, connection_status, last_synced_at, token_expires_at
     FROM crm_outlook_connections
     WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows.length) {
    return { connected: false, status: 'not_connected' };
  }
  const row = result.rows[0];
  return {
    connected: row.connection_status === 'active',
    email: row.email_address,
    status: row.connection_status,
    last_synced_at: row.last_synced_at,
    token_expires_at: row.token_expires_at,
  };
}

async function refreshAccessToken(connectionRow) {
  if (!connectionRow?.refresh_token_enc) {
    throw new Error('No refresh token found');
  }

  const { tenant, clientId, clientSecret, redirectUri } = getConfig();
  const tokenEndpoint = `${getAuthBase(tenant)}/token`;
  const refreshToken = decryptToken(connectionRow.refresh_token_enc);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description || json.error || 'Token refresh failed');
  }

  const expiresAt = new Date(Date.now() + (Number(json.expires_in || 3600) * 1000));
  const accessEnc = encryptToken(json.access_token);
  const refreshEnc = json.refresh_token ? encryptToken(json.refresh_token) : connectionRow.refresh_token_enc;

  const updated = await pool.query(
    `UPDATE crm_outlook_connections
     SET access_token_enc = $2,
         refresh_token_enc = $3,
         token_expires_at = $4,
         connection_status = 'active',
         error_message = NULL,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [connectionRow.user_id, accessEnc, refreshEnc, expiresAt]
  );

  return {
    row: updated.rows[0],
    accessToken: json.access_token,
  };
}

async function getValidAccessToken(userId) {
  const connection = await pool.query(
    `SELECT * FROM crm_outlook_connections WHERE user_id = $1`,
    [userId]
  );
  if (!connection.rows.length) {
    throw new Error('Outlook not connected');
  }

  const row = connection.rows[0];
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : new Date(0);
  const nowPlusBuffer = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt > nowPlusBuffer) {
    return decryptToken(row.access_token_enc);
  }

  try {
    const refreshed = await refreshAccessToken(row);
    return refreshed.accessToken;
  } catch (error) {
    await pool.query(
      `UPDATE crm_outlook_connections
       SET connection_status = 'expired',
           error_message = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, error.message]
    );
    throw error;
  }
}

async function disconnectOutlook(userId) {
  const result = await pool.query(
    `DELETE FROM crm_outlook_connections WHERE user_id = $1 RETURNING user_id`,
    [userId]
  );
  return result.rows.length > 0;
}

async function createWebhookSubscription(userId, accessToken) {
  const notificationUrl = process.env.OUTLOOK_WEBHOOK_NOTIFICATION_URL;
  if (!notificationUrl) {
    return { created: false, reason: 'OUTLOOK_WEBHOOK_NOTIFICATION_URL not configured' };
  }

  const clientState = process.env.OUTLOOK_WEBHOOK_CLIENT_STATE || undefined;
  const expiration = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000)).toISOString();

  const payload = {
    changeType: 'created,updated',
    notificationUrl,
    resource: "/me/mailFolders('Inbox')/messages",
    expirationDateTime: expiration,
  };
  if (clientState) payload.clientState = clientState;

  const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || 'Failed to create Outlook webhook subscription');
  }

  await pool.query(
    `UPDATE crm_outlook_connections
     SET webhook_subscription_id = $2,
         webhook_subscription_expiry = $3,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, json.id || null, json.expirationDateTime || expiration]
  );

  return {
    created: true,
    subscriptionId: json.id || null,
    expirationDateTime: json.expirationDateTime || expiration,
  };
}

module.exports = {
  isAzureConfigured,
  getAuthUrl,
  verifyStateToken,
  exchangeCodeForTokens,
  fetchGraphProfile,
  upsertConnection,
  getConnectionStatus,
  getValidAccessToken,
  disconnectOutlook,
  createWebhookSubscription,
};
