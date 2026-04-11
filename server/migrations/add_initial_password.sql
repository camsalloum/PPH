-- Add initial_password column for admin reference
ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_password VARCHAR(100);
