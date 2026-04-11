-- CRM Worklist Preferences Table
-- Used by: CRM worklist filters, user preferences

CREATE TABLE IF NOT EXISTS crm_worklist_preferences (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  list_type       VARCHAR(20) NOT NULL
                    CHECK (list_type IN ('tasks','meetings','calls','deals')),
  default_status  VARCHAR(40),
  default_query   VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, list_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_worklist_pref_user ON crm_worklist_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_worklist_pref_type ON crm_worklist_preferences(list_type);
