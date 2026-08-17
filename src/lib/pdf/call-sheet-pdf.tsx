import path from "path";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { ML_LABELS } from "./malayalam-labels";

// Call sheet PDF — the standard block layout the deep-dive describes:
// shoot-day header, safety/grievance block (mandatory, non-removable —
// backlot-pass2-deep-dive.md §2.6), scene plan, call times.
//
// Bilingual per sign-off answer (c): the fixed field LABELS render in
// English + Malayalam (Baloo Chettan 2, embedded — see fonts/). Every
// piece of actual DATA (scene descriptions, location names, anything a
// coordinator typed) renders exactly as entered, in whichever language
// that was — there is no live translation of populated content, ever.
// See malayalam-labels.ts for why the Malayalam wordlist itself is
// flagged as needing native-speaker review before real use, separate
// from this rendering mechanism, which is real and verified.
//
// Font is Baloo Chettan 2, not the more obvious default of Noto Sans
// Malayalam — two real, verified-by-actually-generating-PDFs problems
// with Noto and with a second candidate (Manjari), not assumptions:
//   1. Noto Sans Malayalam crashes fontkit's OpenType shaper (TypeError:
//      Cannot read properties of null (reading 'xCoordinate')) on any
//      conjunct/gemination ending in a bare virama — ഷീറ്റ്, പതിപ്പ്,
//      യൂണിറ്റ് all reproduce it in isolation, and that's exactly the
//      kind of text this document needs to render, not an edge case.
//   2. Manjari doesn't crash, but silently DROPS glyphs in some
//      conjuncts — "സ്ഥലം" (location) rendered as "സലം", losing the
//      ്ഥ cluster entirely. Worse than a crash: a crash is loud.
// Baloo Chettan 2 renders every test string from both failure classes
// correctly. Swapped to it rather than working around either problem.
//
// @react-pdf/renderer over Puppeteer per sign-off answer (d): pure JS, no
// native binary, the right fit for Vercel's serverless functions.

const FONTS_DIR = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
let fontsRegistered = false;
function ensureFontsRegistered() {
  // Registered once per process (renderCallSheetPdf may be called many
  // times in a long-lived server) — @react-pdf's Font registry is global,
  // re-registering is harmless but pointless work to skip.
  if (fontsRegistered) return;
  // @react-pdf/font's loader (this.src passed straight to fontkit.open())
  // wants a plain filesystem path string here, not a Buffer — it only
  // special-cases http(s) URLs and data: URLs; anything else goes through
  // fontkit's own file read. Confirmed by reading @react-pdf/font's
  // source rather than assuming from the docs, since the TS types alone
  // (src: string) don't say which forms of "string" actually work.
  Font.register({
    family: "BalooChettan2",
    fonts: [
      { src: path.join(FONTS_DIR, "BalooChettan2-Regular.ttf") },
      { src: path.join(FONTS_DIR, "BalooChettan2-Bold.ttf"), fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 2, fontWeight: 700 },
  titleMl: { fontSize: 12, marginBottom: 4, fontFamily: "BalooChettan2" },
  subtitle: { fontSize: 10, marginBottom: 12, color: "#555" },
  sectionHeading: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 1, textTransform: "uppercase" },
  sectionHeadingMl: { fontSize: 9, marginBottom: 6, color: "#555", fontFamily: "BalooChettan2" },
  row: { flexDirection: "row", marginBottom: 3, alignItems: "flex-start" },
  labelCol: { width: 130 },
  label: { color: "#555" },
  labelMl: { color: "#888", fontSize: 8, fontFamily: "BalooChettan2" },
  value: { flex: 1 },
  table: { marginTop: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 4 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000", paddingBottom: 4, fontWeight: 700 },
  colScene: { width: "50%" },
  colPages: { width: "20%" },
  colOrder: { width: "30%" },
  safetyBlock: { marginTop: 14, padding: 10, borderWidth: 1, borderColor: "#000" },
  safetyTitle: { fontWeight: 700, marginBottom: 1, textTransform: "uppercase" },
  safetyTitleMl: { fontSize: 9, marginBottom: 4, color: "#555", fontFamily: "BalooChettan2" },
  versionFooter: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#888" },
  versionFooterMl: {
    position: "absolute",
    bottom: 12,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#aaa",
    fontFamily: "BalooChettan2",
  },
});

// Renders an English label with its (flagged-as-draft) Malayalam
// translation directly beneath it, smaller and muted — matches how a
// bilingual form field typically reads: primary language on top, the
// second language as a clarifying gloss underneath, not competing for
// the same visual weight.
function BilingualLabel({ en, ml }: { en: string; ml: string }) {
  return (
    <View>
      <Text style={styles.label}>{en}</Text>
      <Text style={styles.labelMl}>{ml}</Text>
    </View>
  );
}

function eighthsToPages(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (rem === 0) return `${whole}`;
  return whole > 0 ? `${whole} ${rem}/8` : `${rem}/8`;
}

function fmtTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(11, 16);
}

export type CallSheetPdfInput = {
  filmTitle: string;
  shootDate: Date;
  versionNumber: number;
  unitCallTime: Date | null;
  locationLabel: string | null;
  locationNote: string | null;
  weatherNote: string | null;
  sunriseTime: Date | null;
  sunsetTime: Date | null;
  hospitalContact: string | null;
  safetyNote: string;
  scenes: Array<{ sceneLabel: string; plannedEighths: number; sortOrder: number }>;
  callTimes: Array<{ label: string; callTime: Date }>;
};

function CallSheetDocument({ data }: { data: CallSheetPdfInput }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {data.filmTitle} — Call Sheet
        </Text>
        <Text style={styles.titleMl}>{ML_LABELS.callSheet}</Text>
        <Text style={styles.subtitle}>
          {data.shootDate.toISOString().slice(0, 10)} · Version {data.versionNumber}
        </Text>

        <View style={styles.row}>
          <View style={styles.labelCol}>
            <BilingualLabel en="Unit call" ml={ML_LABELS.unitCall} />
          </View>
          <Text style={styles.value}>{fmtTime(data.unitCallTime)}</Text>
        </View>
        <View style={styles.row}>
          <View style={styles.labelCol}>
            <BilingualLabel en="Location" ml={ML_LABELS.location} />
          </View>
          <Text style={styles.value}>
            {data.locationLabel ?? "—"}
            {data.locationNote ? ` — ${data.locationNote}` : ""}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={styles.labelCol}>
            <BilingualLabel en="Sunrise / Sunset" ml={ML_LABELS.sunriseSunset} />
          </View>
          <Text style={styles.value}>
            {fmtTime(data.sunriseTime)} / {fmtTime(data.sunsetTime)}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={styles.labelCol}>
            <BilingualLabel en="Weather" ml={ML_LABELS.weather} />
          </View>
          <Text style={styles.value}>{data.weatherNote ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <View style={styles.labelCol}>
            <BilingualLabel en="Hospital / emergency" ml={ML_LABELS.hospitalEmergency} />
          </View>
          <Text style={styles.value}>{data.hospitalContact ?? "—"}</Text>
        </View>

        <Text style={styles.sectionHeading}>Scene plan</Text>
        <Text style={styles.sectionHeadingMl}>{ML_LABELS.scenePlan}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colOrder}>#</Text>
            <View style={styles.colScene}>
              <Text>Scene</Text>
              <Text style={styles.labelMl}>{ML_LABELS.scene}</Text>
            </View>
            <View style={styles.colPages}>
              <Text>Pages</Text>
              <Text style={styles.labelMl}>{ML_LABELS.pages}</Text>
            </View>
          </View>
          {data.scenes.length === 0 ? (
            <Text style={{ marginTop: 6, color: "#888" }}>No scenes entered for this day.</Text>
          ) : (
            data.scenes
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s, i) => (
                <View style={styles.tableRow} key={i}>
                  <Text style={styles.colOrder}>{i + 1}</Text>
                  <Text style={styles.colScene}>{s.sceneLabel}</Text>
                  <Text style={styles.colPages}>{eighthsToPages(s.plannedEighths)}</Text>
                </View>
              ))
          )}
        </View>

        <Text style={styles.sectionHeading}>Call times</Text>
        <Text style={styles.sectionHeadingMl}>{ML_LABELS.callTimes}</Text>
        <View style={styles.table}>
          {data.callTimes.length === 0 ? (
            <Text style={{ color: "#888" }}>No call times entered for this day.</Text>
          ) : (
            data.callTimes.map((c, i) => (
              <View style={styles.tableRow} key={i}>
                <Text style={styles.colScene}>{c.label}</Text>
                <Text style={styles.colPages}>{fmtTime(c.callTime)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Mandatory, non-removable per the Hema Committee compliance
            point (backlot-pass2-deep-dive.md §2.6) — rendered on every
            call sheet regardless of recipient role. Bilingual heading
            deliberately: this is the one block where a junior crew
            member not reading English fluently matters most. */}
        <View style={styles.safetyBlock}>
          <Text style={styles.safetyTitle}>Safety &amp; Grievance Contact</Text>
          <Text style={styles.safetyTitleMl}>{ML_LABELS.safetyGrievance}</Text>
          <Text>{data.safetyNote}</Text>
        </View>

        <Text style={styles.versionFooter}>
          Version {data.versionNumber} — generated by Backlot. A revised call sheet supersedes
          this one; check you have the latest version before relying on it.
        </Text>
        <Text style={styles.versionFooterMl}>{ML_LABELS.versionFooter}</Text>
      </Page>
    </Document>
  );
}

export async function renderCallSheetPdf(data: CallSheetPdfInput): Promise<Buffer> {
  ensureFontsRegistered();
  return renderToBuffer(<CallSheetDocument data={data} />);
}
