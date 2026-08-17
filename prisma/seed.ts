import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev-only fixture data for verifying RBAC end-to-end in the browser.
// Fixed IDs make this script idempotent (safe to re-run with `npm run
// prisma:seed`) — every record is upserted, nothing is ever duplicated.
//
// All seed users share the password below. This is throwaway dev data,
// not real crew — the real first users (per phase-0-findings.md open
// question 7) still need to be supplied before any real pilot.
const DEV_PASSWORD = "ChangeMe123!";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { id: "org_demo" },
    update: {},
    create: { id: "org_demo", name: "Backlot Demo Productions" },
  });

  // ---- Role catalog -------------------------------------------------
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { orgId_key: { orgId: org.id, key: "first_ad" } },
      update: {},
      create: { id: "role_first_ad", orgId: org.id, key: "first_ad", label: "1st AD" },
    }),
    prisma.role.upsert({
      where: { orgId_key: { orgId: org.id, key: "production_coordinator" } },
      update: {},
      create: {
        id: "role_production_coordinator",
        orgId: org.id,
        key: "production_coordinator",
        label: "Production Coordinator",
      },
    }),
    prisma.role.upsert({
      where: { orgId_key: { orgId: org.id, key: "location_manager" } },
      update: {},
      create: {
        id: "role_location_manager",
        orgId: org.id,
        key: "location_manager",
        label: "Location Manager",
      },
    }),
    prisma.role.upsert({
      where: { orgId_key: { orgId: org.id, key: "business_affairs" } },
      update: {},
      create: {
        id: "role_business_affairs",
        orgId: org.id,
        key: "business_affairs",
        label: "Business Affairs",
      },
    }),
    // Phase 1 (CallSheet Ops): the producer is a secondary user of the
    // module — a consumer of variance reporting, not a day-to-day editor —
    // per backlot-pass2-deep-dive.md §2.1. Added now specifically to have
    // a real role to grant callsheet_ops:view_variance to below.
    prisma.role.upsert({
      where: { orgId_key: { orgId: org.id, key: "producer" } },
      update: {},
      create: { id: "role_producer", orgId: org.id, key: "producer", label: "Producer" },
    }),
  ]);
  const [firstAd, coordinator, locationManager, businessAffairs, producer] = roles;

  // ---- role_permission grid ------------------------------------------
  // module_key : capability. "view" is what makes a module appear in the
  // nav rail; other capabilities gate specific actions within it.
  const permissionGrid: Array<[string, string, string]> = [
    // roleId, moduleKey, capability
    [firstAd.id, "callsheet_ops", "view"],
    [firstAd.id, "callsheet_ops", "edit"],
    [firstAd.id, "scenespine", "view"],
    [firstAd.id, "scenespine", "edit"],

    [coordinator.id, "callsheet_ops", "view"],
    [coordinator.id, "callsheet_ops", "edit"],
    [coordinator.id, "callsheet_ops", "dispatch"],
    [coordinator.id, "callsheet_ops", "dpr_submit"],

    // callsheet_ops:view_variance is deliberately separate from the
    // module's general "view" capability — per phase-1-findings.md sign-
    // off answer (e): working-hours/variance data (actual call/wrap
    // times, overtime by department) is the direct product consequence
    // of the Hema Committee compliance point in backlot-pass2-deep-dive.md
    // §2.6 ("a system that produces an auditable record of actual working
    // hours is genuinely valuable to the company's compliance position").
    // That's exactly the data this capability gates, so it's granted to
    // production leadership and the producer, not to every CallSheet Ops
    // viewer by default — a 1st AD who can `view`/`edit` a call sheet does
    // NOT get it here without a separate grant.
    [producer.id, "callsheet_ops", "view_variance"],
    [firstAd.id, "callsheet_ops", "view_variance"],

    [locationManager.id, "locationbank", "view"],
    [locationManager.id, "locationbank", "edit"],

    [businessAffairs.id, "rightsledger", "view"],
    [businessAffairs.id, "rightsledger", "edit"],
    [businessAffairs.id, "rightsledger", "admin"],
  ];

  for (const [roleId, moduleKey, capability] of permissionGrid) {
    await prisma.rolePermission.upsert({
      where: { roleId_moduleKey_capability: { roleId, moduleKey, capability } },
      update: {},
      create: { roleId, moduleKey, capability },
    });
  }

  // ---- role_field_access ----------------------------------------------
  // Contact info restricted to roles that operationally need it.
  // Business Affairs and (deliberately, for contrast in the demo) the
  // 1st AD's counterpart producer persona do NOT get it — the /me page
  // should render those as withheld.
  const fieldAccessGrants: Array<[string, "CONTACT_RESTRICTED" | "RATE_RESTRICTED"]> = [
    [firstAd.id, "CONTACT_RESTRICTED"],
    [coordinator.id, "CONTACT_RESTRICTED"],
    [locationManager.id, "CONTACT_RESTRICTED"],
    [locationManager.id, "RATE_RESTRICTED"],
  ];

  for (const [roleId, fieldGroup] of fieldAccessGrants) {
    await prisma.roleFieldAccess.upsert({
      where: { roleId_fieldGroup: { roleId, fieldGroup } },
      update: { canView: true },
      create: { roleId, fieldGroup, canView: true },
    });
  }

  // ---- Films (placeholder — real fields land with the Film registry
  // component) -----------------------------------------------------------
  const filmA = await prisma.film.upsert({
    where: { id: "film_kumarakom_nights" },
    update: {},
    create: {
      id: "film_kumarakom_nights",
      orgId: org.id,
      title: "Kumarakom Nights",
      status: "SHOOT",
      primaryLanguage: "Malayalam",
    },
  });

  const filmB = await prisma.film.upsert({
    where: { id: "film_fort_kochi_stories" },
    update: {},
    create: {
      id: "film_fort_kochi_stories",
      orgId: org.id,
      title: "Fort Kochi Stories",
      status: "POST",
      primaryLanguage: "Malayalam",
    },
  });

  // ---- Users --------------------------------------------------------
  // admin: org owner, holds two different roles across two different
  // films at once — this is the film-switcher demo case per sign-off.
  const admin = await prisma.user.upsert({
    where: { email: "admin@backlot.dev" },
    update: {},
    create: {
      id: "user_admin",
      orgId: org.id,
      email: "admin@backlot.dev",
      name: "Admin User",
      passwordHash,
    },
  });

  const coordinatorUser = await prisma.user.upsert({
    where: { email: "coordinator@backlot.dev" },
    update: {},
    create: {
      id: "user_coordinator",
      orgId: org.id,
      email: "coordinator@backlot.dev",
      name: "Priya Coordinator",
      passwordHash,
    },
  });

  const locationUser = await prisma.user.upsert({
    where: { email: "locations@backlot.dev" },
    update: {},
    create: {
      id: "user_locations",
      orgId: org.id,
      email: "locations@backlot.dev",
      name: "Ravi Location Manager",
      passwordHash,
    },
  });

  // Org member with no film assignment at all — the nav rail's empty
  // state (Step 4 sign-off requirement) needs a real user to verify
  // against, not just an inferred code path. A brand-new hire between
  // being invited to the org and being staffed on a film is exactly
  // this shape.
  const unassignedUser = await prisma.user.upsert({
    where: { email: "noassignment@backlot.dev" },
    update: {},
    create: {
      id: "user_noassignment",
      orgId: org.id,
      email: "noassignment@backlot.dev",
      name: "New Hire Unassigned",
      passwordHash,
    },
  });

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: admin.id } },
    update: {},
    create: { orgId: org.id, userId: admin.id, orgRole: "OWNER" },
  });
  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: coordinatorUser.id } },
    update: {},
    create: { orgId: org.id, userId: coordinatorUser.id, orgRole: "MEMBER" },
  });
  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: locationUser.id } },
    update: {},
    create: { orgId: org.id, userId: locationUser.id, orgRole: "MEMBER" },
  });
  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: unassignedUser.id } },
    update: {},
    create: { orgId: org.id, userId: unassignedUser.id, orgRole: "MEMBER" },
  });

  // ---- Film assignments ------------------------------------------------
  const assignments: Array<[string, string, string, string | null]> = [
    // userId, filmId, roleId, department
    [admin.id, filmA.id, firstAd.id, "Direction"],
    [admin.id, filmB.id, businessAffairs.id, "Business Affairs"],
    [coordinatorUser.id, filmA.id, coordinator.id, "Production"],
    [locationUser.id, filmA.id, locationManager.id, "Locations"],
  ];

  for (const [userId, filmId, roleId, department] of assignments) {
    await prisma.filmAssignment.upsert({
      where: { filmId_userId_roleId: { filmId, userId, roleId } },
      update: {},
      create: { userId, filmId, roleId, department },
    });
  }

  // ---- Notification templates (seeded, not UI-authored — template
  // *content* is explicitly out of Phase 0 scope per phase-0-findings.md's
  // "not building" list; these exist only so the dispatch service has
  // something real to render and send in the /notifications test screen).
  await prisma.notificationTemplate.upsert({
    where: {
      orgId_key_channel_language: {
        orgId: org.id,
        key: "phase0_test",
        channel: "WHATSAPP",
        language: "en",
      },
    },
    update: {},
    create: {
      orgId: org.id,
      key: "phase0_test",
      channel: "WHATSAPP",
      language: "en",
      bodyTemplate: "Hi {{name}}, this is a test notification from Backlot for {{filmTitle}}.",
    },
  });
  await prisma.notificationTemplate.upsert({
    where: {
      orgId_key_channel_language: {
        orgId: org.id,
        key: "phase0_test",
        channel: "EMAIL",
        language: "en",
      },
    },
    update: {},
    create: {
      orgId: org.id,
      key: "phase0_test",
      channel: "EMAIL",
      language: "en",
      subject: "Backlot test notification",
      bodyTemplate:
        "Hi {{name}},\n\nThis is a test notification from Backlot for {{filmTitle}}.\n\n— Sent via the Phase 0 notification/dispatch service.",
    },
  });

  // ---- OrchaLLM provider registry (seeded, not UI-managed — a real
  // deployment would grow this list as providers are approved) --------
  await prisma.llmProvider.upsert({
    where: { key: "anthropic-claude" },
    update: {},
    create: {
      key: "anthropic-claude",
      label: "Anthropic Claude",
      // Honest default for a standard API key, not a placeholder: real
      // zero-retention requires a specific enterprise agreement, which
      // this deployment doesn't have. See lib/orchallm/anthropic-provider.ts.
      zeroRetention: false,
      allowedFor: [],
      enabled: true,
    },
  });

  console.log("Seed complete.");
  console.log(`  Org: ${org.name}`);
  console.log(`  Users (password for all: ${DEV_PASSWORD}):`);
  console.log("    admin@backlot.dev        — owner; 1st AD on Kumarakom Nights, Business Affairs on Fort Kochi Stories");
  console.log("    coordinator@backlot.dev  — Production Coordinator on Kumarakom Nights");
  console.log("    locations@backlot.dev    — Location Manager on Kumarakom Nights");
  console.log("    noassignment@backlot.dev — org member, zero film assignments (nav rail empty-state case)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
