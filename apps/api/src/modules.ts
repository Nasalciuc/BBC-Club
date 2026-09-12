import type { ModuleDescriptor } from "./registry";
import { identityModule } from "@bbc/identity/module";
import { emailModule } from "@bbc/email/module";
import { membersModule } from "@bbc/members/module";
import { proposalsModule } from "@bbc/proposals/module";
import { engagementModule } from "@bbc/engagement/module";
import { notificationsModule } from "@bbc/notifications/module";
import { crmModule } from "@bbc/crm/module";
import { mobileBff } from "./presentation/mobile";

/** The ordered inventory of modules. Overrides let tests replace adapters (email → capturing sender, crm → mock).
 *  Adding a module = adding a line here; forgetting one = the boot test fails (a consumer with no handler). */
export function modules(overrides: Record<string, unknown>): ModuleDescriptor<any, any>[] {
  return [
    emailModule(overrides.email as any),          // integration
    crmModule(overrides.crm as any),              // integration (mock until CRM access exists)
    identityModule(),                             // core  — needs: email
    membersModule(),                              // core  — needs: crm
    notificationsModule(overrides.push as any),   // core  — needs: members (preferences/timezone)
    proposalsModule(),                            // domain
    engagementModule(),                           // domain — needs: proposals
    mobileBff(),                                  // presentation — needs: proposals, engagement, notifications, members
  ];
}
