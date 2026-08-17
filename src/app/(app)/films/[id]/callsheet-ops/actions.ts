"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { storeMediaFile } from "@/lib/media";
import { renderCallSheetPdf } from "@/lib/pdf/call-sheet-pdf";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { generateAckToken } from "@/lib/callsheet/ack-token";
import { ActionError } from "@/lib/action-error";

// Every action re-checks the specific callsheet_ops capability it needs —
// view/edit/dispatch/dpr_submit/view_variance — rather than a single
// module-wide gate, matching phase-1-findings.md §2's capability split.
// Same try/catch-ActionError-redirect pattern as every other module's
// actions file.

async function requireFilmCapability(filmId: string, capability: string) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const film = await prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } });
  if (!film) throw new ActionError("Film not found in this org.");

  const allowed = await hasCapability(session.user.id, filmId, "callsheet_ops", capability);
  if (!allowed) {
    throw new ActionError(`You don't have "${capability}" access to CallSheet Ops on this film.`);
  }

  return { session, film };
}

// UTC throughout, deliberately — every display point in this module reads
// a Date back via .toISOString().slice(...), which is UTC. Constructing
// from a bare "YYYY-MM-DDTHH:mm:00" string (no zone) parses as the
// *server's local* time instead, so a shoot date entered as Sept 1 could
// round-trip and display as Aug 31 whenever the server runs ahead of UTC
// (caught by browser verification, not by tsc/build — see phase-1
// verification notes). The "Z" suffix pins parsing to UTC so the values
// that go in match the values that come back out, with no local-timezone
// step in between.
function parseDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function eighthsFromForm(formData: FormData, wholeKey: string, eighthsKey: string): number {
  const whole = Math.max(0, parseInt(String(formData.get(wholeKey) ?? "0"), 10) || 0);
  const eighths = Math.min(7, Math.max(0, parseInt(String(formData.get(eighthsKey) ?? "0"), 10) || 0));
  return whole * 8 + eighths;
}

// ---------------------------------------------------------------------------
// Shooting day
// ---------------------------------------------------------------------------

export async function createShootingDay(filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmCapability(filmId, "edit");

    const shootDateStr = String(formData.get("shootDate") ?? "").trim();
    if (!shootDateStr) throw new ActionError("Shoot date is required.");
    const shootDate = new Date(`${shootDateStr}T00:00:00Z`);
    if (isNaN(shootDate.getTime())) throw new ActionError("Invalid shoot date.");

    const unitCallTimeStr = String(formData.get("unitCallTime") ?? "").trim();

    const day = await prisma.shootingDay.create({
      data: {
        orgId: session.user.orgId,
        filmId,
        shootDate,
        unitCallTime: unitCallTimeStr ? parseDateTime(shootDateStr, unitCallTimeStr) : null,
        locationLabel: String(formData.get("locationLabel") ?? "").trim() || null,
        locationNote: String(formData.get("locationNote") ?? "").trim() || null,
        weatherNote: String(formData.get("weatherNote") ?? "").trim() || null,
        hospitalContact: String(formData.get("hospitalContact") ?? "").trim() || null,
        safetyNote: String(formData.get("safetyNote") ?? "").trim() || null,
        createdByUserId: session.user.id,
      },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "shooting_day",
      entityId: day.id,
      after: { shootDate: day.shootDate, locationLabel: day.locationLabel },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops`);
    redirect(`/films/${filmId}/callsheet-ops/${day.id}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function addScene(dayId: string, filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmCapability(filmId, "edit");

    const sceneLabel = String(formData.get("sceneLabel") ?? "").trim();
    if (!sceneLabel) throw new ActionError("Scene label is required.");
    const plannedEighths = eighthsFromForm(formData, "pagesWhole", "pagesEighths");

    const maxOrder = await prisma.shootingDayScene.aggregate({
      where: { shootingDayId: dayId },
      _max: { sortOrder: true },
    });

    const scene = await prisma.shootingDayScene.create({
      data: {
        shootingDayId: dayId,
        sceneLabel,
        plannedEighths,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "shooting_day_scene",
      entityId: scene.id,
      after: { sceneLabel, plannedEighths },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops/${dayId}`);
    redirect(`/films/${filmId}/callsheet-ops/${dayId}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops/${dayId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function addCallTime(dayId: string, filmId: string, formData: FormData) {
  try {
    const { session, film } = await requireFilmCapability(filmId, "edit");

    const personId = String(formData.get("personId") ?? "").trim() || null;
    const departmentLabel = String(formData.get("departmentLabel") ?? "").trim() || null;
    if (!personId && !departmentLabel) {
      throw new ActionError("Choose a person or enter a department label.");
    }
    if (personId && departmentLabel) {
      throw new ActionError("Set either a person or a department, not both.");
    }

    const timeStr = String(formData.get("callTime") ?? "").trim();
    const day = await prisma.shootingDay.findFirst({ where: { id: dayId, filmId } });
    if (!day) throw new ActionError("Shooting day not found.");
    const callTime = parseDateTime(day.shootDate.toISOString().slice(0, 10), timeStr);
    if (!callTime) throw new ActionError("Valid call time is required.");

    if (personId) {
      const person = await prisma.person.findFirst({ where: { id: personId, orgId: film.orgId } });
      if (!person) throw new ActionError("Person not found in this org.");
    }

    const entry = await prisma.shootingDayCallTime.create({
      data: { shootingDayId: dayId, personId, departmentLabel, callTime },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "shooting_day_call_time",
      entityId: entry.id,
      after: { personId, departmentLabel },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops/${dayId}`);
    redirect(`/films/${filmId}/callsheet-ops/${dayId}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops/${dayId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Call sheet version (generate + publish)
// ---------------------------------------------------------------------------

export async function publishCallSheet(dayId: string, filmId: string, formData: FormData) {
  try {
    const { session, film } = await requireFilmCapability(filmId, "edit");

    const day = await prisma.shootingDay.findFirst({
      where: { id: dayId, filmId },
      include: { scenes: true, callTimes: { include: { person: true } } },
    });
    if (!day) throw new ActionError("Shooting day not found.");
    if (!day.safetyNote) {
      throw new ActionError(
        "Set the safety/grievance contact block on this shooting day before publishing — it's " +
          "mandatory on every call sheet."
      );
    }

    const priorMax = await prisma.callSheetVersion.aggregate({
      where: { shootingDayId: dayId },
      _max: { versionNumber: true },
    });
    const versionNumber = (priorMax._max.versionNumber ?? 0) + 1;
    const changeNote = String(formData.get("changeNote") ?? "").trim() || null;
    if (versionNumber > 1 && !changeNote) {
      throw new ActionError("A change note is required for an amended call sheet (version 2+).");
    }

    // Minors are omitted from the call sheet PDF by default — the same
    // opt-in-not-opt-out posture as dispatch.ts's minor-recipient block
    // (Phase 0 sign-off open question 9), applied to a second exposure
    // that block doesn't cover. Dispatch-exclusion only controls who
    // *receives* the document; a minor's name/role/call time printed
    // inside a PDF that then gets forwarded, photographed, or left on a
    // dashboard isn't protected by that at all — it's the same
    // information walking out a different door. Kept as one consistent
    // rule (opt-in per publish, explicit, by whoever already holds
    // publish/edit capability) rather than a second, differently-shaped
    // judgment call. See phase-1-findings.md open question (i).
    const includeMinorCallTimeIds = new Set(formData.getAll("includeMinorCallTimeIds").map(String));
    const includedCallTimes = day.callTimes.filter(
      (c) => !c.person?.isMinor || includeMinorCallTimeIds.has(c.id)
    );
    const omittedMinorCount = day.callTimes.length - includedCallTimes.length;

    const pdfBuffer = await renderCallSheetPdf({
      filmTitle: film.title,
      shootDate: day.shootDate,
      versionNumber,
      unitCallTime: day.unitCallTime,
      locationLabel: day.locationLabel,
      locationNote: day.locationNote,
      weatherNote: day.weatherNote,
      sunriseTime: day.sunriseTime,
      sunsetTime: day.sunsetTime,
      hospitalContact: day.hospitalContact,
      safetyNote: day.safetyNote,
      scenes: day.scenes.map((s) => ({
        sceneLabel: s.sceneLabel,
        plannedEighths: s.plannedEighths,
        sortOrder: s.sortOrder,
      })),
      callTimes: includedCallTimes.map((c) => ({
        label: c.person?.fullName ?? c.departmentLabel ?? "—",
        callTime: c.callTime,
      })),
    });

    const stored = await storeMediaFile(pdfBuffer);
    const filename = `Call Sheet — ${day.shootDate.toISOString().slice(0, 10)} v${versionNumber}.pdf`;

    const asset = await prisma.mediaAsset.create({
      data: {
        orgId: session.user.orgId,
        filmId,
        uploadedByUserId: session.user.id,
        filename,
        mimeType: "application/pdf",
        versions: {
          create: {
            versionNumber: 1,
            storageProvider: stored.storageProvider,
            storageKey: stored.storageKey,
            byteSize: stored.byteSize,
            checksumSha256: stored.checksumSha256,
            encryptionKeyRef: stored.encryptionKeyRef,
            originalFilename: filename,
            uploadedByUserId: session.user.id,
          },
        },
      },
      include: { versions: true },
    });
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: asset.versions[0].id },
    });

    const version = await prisma.callSheetVersion.create({
      data: {
        shootingDayId: dayId,
        versionNumber,
        pdfMediaAssetId: asset.id,
        changeNote,
        publishedByUserId: session.user.id,
      },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "call_sheet_version",
      entityId: version.id,
      after: {
        shootingDayId: dayId,
        versionNumber,
        changeNote,
        omittedMinorCount,
        includedMinorCallTimeIds: [...includeMinorCallTimeIds],
      },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops/${dayId}`);
    redirect(
      `/films/${filmId}/callsheet-ops/${dayId}?saved=1${omittedMinorCount > 0 ? `&omittedMinors=${omittedMinorCount}` : ""}`
    );
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops/${dayId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dispatch — plain-text WhatsApp message with a tokenized ack link
// (sign-off answer a). Reuses the existing dispatch service as-is; the
// only new thing is the ackToken + call_sheet_dispatch row layered on top,
// per dispatch.ts's own header comment about how a module should do this.
//
// KNOWN LIMITATION, explicit rather than silent: WHATSAPP_ACCESS_TOKEN /
// WHATSAPP_PHONE_NUMBER_ID are not configured in this deployment (Meta
// application still pending, phase-1-findings.md open question b). Every
// call below will reach dispatchNotification(), which will attempt a real
// send, fail inside the adapter, and land the NotificationMessage as
// FAILED — that failure is caught and handled per-recipient, exactly as
// designed, but it means dispatch has only been verified against that
// failure path, not a real delivered WhatsApp message. Do not read a
// "SENT" status here as proof of real-world delivery until WhatsApp
// approval lands and this has been re-verified against a live send.
// ---------------------------------------------------------------------------

export async function dispatchCallSheet(versionId: string, filmId: string, formData: FormData) {
  try {
    const { session, film } = await requireFilmCapability(filmId, "dispatch");

    const version = await prisma.callSheetVersion.findFirst({
      where: { id: versionId, shootingDay: { filmId } },
      include: { shootingDay: true },
    });
    if (!version) throw new ActionError("Call sheet version not found.");

    const personIds = formData.getAll("personIds").map(String).filter(Boolean);
    if (personIds.length === 0) throw new ActionError("Choose at least one recipient.");

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const shootDateLabel = version.shootingDay.shootDate.toISOString().slice(0, 10);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const personId of personIds) {
      const existing = await prisma.callSheetDispatch.findUnique({
        where: { callSheetVersionId_personId: { callSheetVersionId: versionId, personId } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const ackToken = generateAckToken();
      const ackUrl = `${baseUrl}/ack/${ackToken}`;
      const body =
        `${film.title} — Call Sheet for ${shootDateLabel} (v${version.versionNumber}).\n` +
        `Please confirm you've seen it: ${ackUrl}`;

      try {
        const message = await dispatchNotification({
          orgId: session.user.orgId,
          filmId,
          actorUserId: session.user.id,
          channel: "WHATSAPP",
          recipientPersonId: personId,
          bodyRendered: body,
        });

        await prisma.callSheetDispatch.create({
          data: {
            callSheetVersionId: versionId,
            personId,
            notificationMessageId: message.id,
            ackToken,
          },
        });

        if (message.status === "FAILED") failed++;
        else sent++;
      } catch (err) {
        // ActionError from dispatchNotification (no contact on file, minor
        // not opted in, recipient not found) — no message was created, so
        // no call_sheet_dispatch row either. Counted, not fatal to the loop.
        failed++;
      }
    }

    revalidatePath(`/films/${filmId}/callsheet-ops/${version.shootingDayId}`);
    redirect(
      `/films/${filmId}/callsheet-ops/${version.shootingDayId}?saved=1&sent=${sent}&failed=${failed}&skipped=${skipped}`
    );
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Daily Production Report
// ---------------------------------------------------------------------------

export async function submitDpr(dayId: string, filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmCapability(filmId, "dpr_submit");

    const day = await prisma.shootingDay.findFirst({
      where: { id: dayId, filmId },
      include: { scenes: true },
    });
    if (!day) throw new ActionError("Shooting day not found.");

    const shootDateStr = day.shootDate.toISOString().slice(0, 10);
    const actualCallTimeStr = String(formData.get("actualCallTime") ?? "").trim();
    const actualWrapTimeStr = String(formData.get("actualWrapTime") ?? "").trim();

    const num = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").trim();
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    };

    const dpr = await prisma.dailyProductionReport.upsert({
      where: { shootingDayId: dayId },
      update: {
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        actualCallTime: actualCallTimeStr ? parseDateTime(shootDateStr, actualCallTimeStr) : null,
        actualWrapTime: actualWrapTimeStr ? parseDateTime(shootDateStr, actualWrapTimeStr) : null,
        cateringBreakfast: num("cateringBreakfast"),
        cateringLunch: num("cateringLunch"),
        cateringDinner: num("cateringDinner"),
        juniorArtistPlanned: num("juniorArtistPlanned"),
        juniorArtistActual: num("juniorArtistActual"),
        incidentsNote: String(formData.get("incidentsNote") ?? "").trim() || null,
        equipmentIssuesNote: String(formData.get("equipmentIssuesNote") ?? "").trim() || null,
      },
      create: {
        shootingDayId: dayId,
        submittedByUserId: session.user.id,
        actualCallTime: actualCallTimeStr ? parseDateTime(shootDateStr, actualCallTimeStr) : null,
        actualWrapTime: actualWrapTimeStr ? parseDateTime(shootDateStr, actualWrapTimeStr) : null,
        cateringBreakfast: num("cateringBreakfast"),
        cateringLunch: num("cateringLunch"),
        cateringDinner: num("cateringDinner"),
        juniorArtistPlanned: num("juniorArtistPlanned"),
        juniorArtistActual: num("juniorArtistActual"),
        incidentsNote: String(formData.get("incidentsNote") ?? "").trim() || null,
        equipmentIssuesNote: String(formData.get("equipmentIssuesNote") ?? "").trim() || null,
      },
    });

    for (const scene of day.scenes) {
      const status = String(formData.get(`sceneStatus_${scene.id}`) ?? "").trim();
      if (!status) continue; // not reported on — leave no result row rather than guessing
      if (status !== "COMPLETED" && status !== "PARTIAL" && status !== "DROPPED") continue;
      const pagesShotEighths = eighthsFromForm(
        formData,
        `scenePagesWhole_${scene.id}`,
        `scenePagesEighths_${scene.id}`
      );

      await prisma.dprSceneResult.upsert({
        where: { dprId_shootingDaySceneId: { dprId: dpr.id, shootingDaySceneId: scene.id } },
        update: { status: status as "COMPLETED" | "PARTIAL" | "DROPPED", pagesShotEighths },
        create: {
          dprId: dpr.id,
          shootingDaySceneId: scene.id,
          status: status as "COMPLETED" | "PARTIAL" | "DROPPED",
          pagesShotEighths,
        },
      });
    }

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "update",
      entityType: "daily_production_report",
      entityId: dpr.id,
      after: { shootingDayId: dayId },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops/${dayId}`);
    redirect(`/films/${filmId}/callsheet-ops/${dayId}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops/${dayId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function addOvertimeEntry(dayId: string, filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmCapability(filmId, "dpr_submit");

    const dpr = await prisma.dailyProductionReport.findFirst({ where: { shootingDayId: dayId } });
    if (!dpr) {
      throw new ActionError("Submit the main DPR for this day before adding overtime entries.");
    }

    const departmentLabel = String(formData.get("departmentLabel") ?? "").trim();
    const overtimeMinutes = parseInt(String(formData.get("overtimeMinutes") ?? ""), 10);
    if (!departmentLabel) throw new ActionError("Department is required.");
    if (isNaN(overtimeMinutes) || overtimeMinutes <= 0) {
      throw new ActionError("Overtime minutes must be a positive number.");
    }

    await prisma.dprOvertimeEntry.create({
      data: { dprId: dpr.id, departmentLabel, overtimeMinutes },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "dpr_overtime_entry",
      entityId: dpr.id,
      after: { departmentLabel, overtimeMinutes },
    });

    revalidatePath(`/films/${filmId}/callsheet-ops/${dayId}`);
    redirect(`/films/${filmId}/callsheet-ops/${dayId}?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/callsheet-ops/${dayId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
