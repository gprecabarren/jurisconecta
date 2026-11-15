-- Additive only: legacy applications and professional permissions stay unchanged.
ALTER TABLE lawyer_applications ADD COLUMN country TEXT CHECK (country IS NULL OR length(country) BETWEEN 2 AND 80);
ALTER TABLE lawyer_applications ADD COLUMN practice_topics_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(practice_topics_json) AND json_type(practice_topics_json) = 'array' AND length(practice_topics_json) <= 10000);
ALTER TABLE lawyer_applications ADD COLUMN referral_code TEXT CHECK (referral_code IS NULL OR length(referral_code) <= 32);
