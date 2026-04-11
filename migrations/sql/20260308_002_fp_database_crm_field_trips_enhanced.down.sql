-- ROLLBACK for enhanced field trips

DROP TABLE IF EXISTS crm_trip_adjustments;
DROP TABLE IF EXISTS crm_trip_expenses;
DROP TABLE IF EXISTS crm_travel_reports;

ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS contact_person;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS contact_phone;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS contact_email;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS visit_notes;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS products_discussed;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS samples_delivered;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS quotation_requested;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS next_action;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS competitor_info;
ALTER TABLE crm_field_trip_stops DROP COLUMN IF EXISTS visit_result;

ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS trip_type;
ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS budget_estimate;
ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS transport_mode;
ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS accommodation;
ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS visa_required;
ALTER TABLE crm_field_trips DROP COLUMN IF EXISTS country_code;
