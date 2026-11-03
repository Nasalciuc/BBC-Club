-- ADR-IMPL-086: a city's photo is now its main image first (a night view second), and a town's only photograph counts
-- from 640 px wide (it had to be wider than 1280). Every row the job chose itself is looked at again now, not up to 33
-- days from now: a night view gives way to the city's main image, a satellite view to the town's own photograph. An
-- operator's photo (`override`, never expiring) is left as it is; a row already due is left due.
UPDATE catalog.place_photos
SET expires_at = now()
WHERE source IS DISTINCT FROM 'override' AND expires_at > now();
