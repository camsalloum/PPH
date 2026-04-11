-- CRM Calls Table
-- Used by: Call logging, CRM follow-ups, activity tracking

CREATE TABLE IF NOT EXISTS crm_calls (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  direction       VARCHAR(10) NOT NULL DEFAULT 'outbound'
                    CHECK (direction IN ('inbound','outbound')),
  phone_number    VARCHAR(50),
  date_start      TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER DEFAULT 5,
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','held','not_answered','busy','canceled')),
  outcome         TEXT,
  customer_id     INTEGER,
  prospect_id     INTEGER,
  deal_id         INTEGER,
  assigned_to_id  INTEGER NOT NULL,
  assigned_to_name VARCHAR(255),
  created_by      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_calls_assigned ON crm_calls(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_crm_calls_date ON crm_calls(date_start);
CREATE INDEX IF NOT EXISTS idx_crm_calls_status ON crm_calls(status);
CREATE INDEX IF NOT EXISTS idx_crm_calls_customer ON crm_calls(customer_id);
