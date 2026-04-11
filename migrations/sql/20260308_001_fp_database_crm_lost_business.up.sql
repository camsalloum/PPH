-- Lost Business tracking table
-- Allows sales reps to mark customers as "lost business" with a reason,
-- creating a per-rep list of customers who will not re-order.

CREATE TABLE IF NOT EXISTS crm_lost_business (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES fp_customer_unified(customer_id),
  marked_by       INTEGER NOT NULL,                     -- user ID from auth DB
  marked_by_name  VARCHAR(200),                         -- denormalized rep name
  reason          VARCHAR(50) NOT NULL DEFAULT 'other'
    CHECK (reason IN (
      'competitor',         -- lost to competitor
      'price',              -- pricing issue
      'quality',            -- quality complaints
      'service',            -- poor service experience
      'closed_business',    -- customer closed / bankrupt
      'relocated',          -- moved out of territory
      'no_demand',          -- no longer needs our products
      'payment_issues',     -- credit / payment problems
      'other'               -- free-text only
    )),
  notes           TEXT,                                 -- free-form explanation
  lost_date       DATE NOT NULL DEFAULT CURRENT_DATE,   -- when this was marked
  last_order_amount NUMERIC(14,2),                      -- snapshot at time of marking
  last_order_month  VARCHAR(7),                         -- e.g. "2025-11"
  monthly_avg_revenue NUMERIC(14,2),                    -- snapshot
  is_recovered    BOOLEAN NOT NULL DEFAULT false,       -- if customer comes back
  recovered_at    TIMESTAMPTZ,
  recovered_note  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active lost-business record per customer per rep
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_lost_business_active
  ON crm_lost_business (customer_id, marked_by)
  WHERE is_recovered = false;

-- Fast lookup by rep
CREATE INDEX IF NOT EXISTS idx_crm_lost_business_marked_by
  ON crm_lost_business (marked_by);

-- Fast lookup by reason for analytics
CREATE INDEX IF NOT EXISTS idx_crm_lost_business_reason
  ON crm_lost_business (reason);
