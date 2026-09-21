import type { Principal } from "../authz/principal";

/** Hono env for every module route and the host. Typo in the Variables key is a compile error. */
export type AppEnv = { Variables: { principal: Principal; requestId: string } };
