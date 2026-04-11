-- CRM Meetings Table
-- Used by: Meetings scheduling, calendar, CRM dashboard

CREATE TABLE IF NOT EXISTS crm_meetings (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  date_start      TIMESTAMPTZ NOT NULL,
  date_end        TIMESTAMPTZ,
  duration_mins   INTEGER DEFAULT 30,
  location        VARCHAR(500),
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','held','not_held','canceled')),
  customer_id     INTEGER,
  prospect_id     INTEGER,
  deal_id         INTEGER,
  assigned_to_id  INTEGER NOT NULL,
  assigned_to_name VARCHAR(255),
  attendees       JSONB DEFAULT '[]',
  reminders       JSONB DEFAULT '[]',
  created_by      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_meetings_assigned ON crm_meetings(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_crm_meetings_date ON crm_meetings(date_start);
CREATE INDEX IF NOT EXISTS idx_crm_meetings_status ON crm_meetings(status);
CREATE INDEX IF NOT EXISTS idx_crm_meetings_customer ON crm_meetings(customer_id);
