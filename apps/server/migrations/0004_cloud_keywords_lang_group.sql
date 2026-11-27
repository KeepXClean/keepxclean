-- Add language-pack grouping column to cloud_keywords for 10-language public packs (v0.2.0)
ALTER TABLE cloud_keywords ADD COLUMN lang_group TEXT NOT NULL DEFAULT 'universal';
