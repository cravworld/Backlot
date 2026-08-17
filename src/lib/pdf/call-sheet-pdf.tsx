import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// Call sheet PDF — the standard block layout the deep-dive describes:
// shoot-day header, safety/grievance block (mandatory, non-removable —
// backlot-pass2-deep-dive.md §2.6), scene plan, call times. English only
// for now; the bilingual Malayalam render is sign-off answer (c)'s static
// pre-authored template, layered on top of this once that template exists
// — not built in this slice.
//
// @react-pdf/renderer over Puppeteer per sign-off answer (d): pure JS, no
// native binary, the right fit for Vercel's serverless functions.

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4, fontWeight: 700 },
  subtitle: { fontSize: 10, marginBottom: 12, color: "#555" },
  sectionHeading: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 110, color: "#555" },
  value: { flex: 1 },
  table: { marginTop: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 4 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000", paddingBottom: 4, fontWeight: 700 },
  colScene: { width: "50%" },
  colPages: { width: "20%" },
  colOrder: { width: "30%" },
  safetyBlock: { marginTop: 14, padding: 10, borderWidth: 1, borderColor: "#000" },
  safetyTitle: { fontWeight: 700, marginBottom: 4, textTransform: "uppercase" },
  versionFooter: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#888" },
});

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
        <Text style={styles.title}>{data.filmTitle} — Call Sheet</Text>
        <Text style={styles.subtitle}>
          {data.shootDate.toISOString().slice(0, 10)} · Version {data.versionNumber}
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Unit call</Text>
          <Text style={styles.value}>{fmtTime(data.unitCallTime)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.value}>
            {data.locationLabel ?? "—"}
            {data.locationNote ? ` — ${data.locationNote}` : ""}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sunrise / Sunset</Text>
          <Text style={styles.value}>
            {fmtTime(data.sunriseTime)} / {fmtTime(data.sunsetTime)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Weather</Text>
          <Text style={styles.value}>{data.weatherNote ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Hospital / emergency</Text>
          <Text style={styles.value}>{data.hospitalContact ?? "—"}</Text>
        </View>

        <Text style={styles.sectionHeading}>Scene plan</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colOrder}>#</Text>
            <Text style={styles.colScene}>Scene</Text>
            <Text style={styles.colPages}>Pages</Text>
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
            call sheet regardless of recipient role. */}
        <View style={styles.safetyBlock}>
          <Text style={styles.safetyTitle}>Safety &amp; Grievance Contact</Text>
          <Text>{data.safetyNote}</Text>
        </View>

        <Text style={styles.versionFooter}>
          Version {data.versionNumber} — generated by Backlot. A revised call sheet supersedes
          this one; check you have the latest version before relying on it.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderCallSheetPdf(data: CallSheetPdfInput): Promise<Buffer> {
  return renderToBuffer(<CallSheetDocument data={data} />);
}
