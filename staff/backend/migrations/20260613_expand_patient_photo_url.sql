-- Allow long Google avatar URLs from patient Google authentication.
ALTER TABLE patients
MODIFY COLUMN photo_url TEXT NULL;
