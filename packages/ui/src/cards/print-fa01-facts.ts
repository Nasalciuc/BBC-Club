import { fixture } from "@bbc/shared/fixture";
import { fareFacts } from "./fare-facts";

process.stdout.write(fareFacts(fixture.fares[0]!));
