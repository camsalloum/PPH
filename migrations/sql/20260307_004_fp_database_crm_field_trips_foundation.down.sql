-- Rollback: CRM field trip planner foundation tables

DROP INDEX IF EXISTS idx_crm_field_trip_stops_customer;
DROP INDEX IF EXISTS idx_crm_field_trip_stops_visit_date;
DROP INDEX IF EXISTS idx_crm_field_trip_stops_trip_order;
DROP TABLE IF EXISTS crm_field_trip_stops;

DROP INDEX IF EXISTS idx_crm_field_trips_departure;
DROP INDEX IF EXISTS idx_crm_field_trips_rep_status;
DROP TABLE IF EXISTS crm_field_trips;
