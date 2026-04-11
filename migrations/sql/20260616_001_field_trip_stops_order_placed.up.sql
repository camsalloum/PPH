-- Add order_placed column to crm_field_trip_stops
ALTER TABLE crm_field_trip_stops
  ADD COLUMN IF NOT EXISTS order_placed BOOLEAN DEFAULT false;
