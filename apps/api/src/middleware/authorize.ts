/** Re-export — authorize/registerRoute live in `@bbc/shared/authz/authorize` so modules never import the host. */
export {
  authorize,
  registerRoute,
  routeRegistry,
  rateRuleRegistry,
  err,
  type PrincipalVars,
} from "@bbc/shared/authz/authorize";
