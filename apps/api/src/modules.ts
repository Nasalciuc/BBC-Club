import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { emailModule } from "@bbc/email/module";
import { pushModule } from "@bbc/push/module";
import { crmModule } from "@bbc/crm/module";
import { identityModule } from "@bbc/identity/module";
import { membersModule } from "@bbc/members/module";
import { notificationsModule } from "@bbc/notifications/module";
import { proposalsModule } from "@bbc/proposals/module";
import { engagementModule } from "@bbc/engagement/module";
import { mobileBff } from "./presentation/mobile";

/** The ordered inventory. Overrides let tests replace adapters (email → capturing, crm → mock, push → recording). */
export function modules(overrides: Record<string, any> = {}): ModuleDescriptor<any, any>[] {
  return [
    emailModule(overrides.email), pushModule(overrides.push), crmModule(overrides.crm),   // integration
    identityModule(), membersModule(), notificationsModule(overrides.push),               // core
    proposalsModule(), engagementModule(),                                                 // domain
    mobileBff(),                                                                           // presentation
  ];
}
