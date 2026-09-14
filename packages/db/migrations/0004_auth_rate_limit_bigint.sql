-- Better Auth stores Date.now() (ms) in last_request; integer overflows after ~2038 and already fails in 2026.
ALTER TABLE auth.rate_limit ALTER COLUMN last_request TYPE bigint USING last_request::bigint;
