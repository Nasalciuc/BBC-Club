import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { emailModule } from "@bbc/email/module";
import { pushModule } from "@bbc/push/module";
import { crmModule } from "@bbc/crm/module";
import { identityModule } from "@bbc/identity/module";
import { membersModule } from "@bbc/members/module";
import { notificationsModule } from "@bbc/notifications/module";
import { proposalsModule } from "@bbc/proposals/module";
import { engagementModule } from "@bbc/engagement/module";
import { requestsModule } from "@bbc/requests/module";
import { catalogModule } from "@bbc/catalog/module";
import { personalizationModule } from "@bbc/personalization/module";
import { mobileBff } from "./presentation/mobile";

/** The ordered inventory. Overrides let tests replace adapters (email → capturing, crm → mock, push → recording). */
export function modules(overrides: Record<string, any> = {}): ModuleDescriptor<any, any>[] {
  return [
    emailModule(overrides.email),
    pushModule(overrides.push),
    crmModule(overrides.crm), // integration
    identityModule(),
    membersModule(),
    notificationsModule(), // core — push via needs; override lands on pushModule
    proposalsModule(),
    engagementModule(), // domain — implicit signals only after Branch 3
    requestsModule(), // domain — member requests → CRM
    catalogModule(),
    personalizationModule(),
    mobileBff(), // presentation
  ];
}
