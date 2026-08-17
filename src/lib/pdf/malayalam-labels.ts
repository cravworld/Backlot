// Static, pre-authored Malayalam labels for the call sheet's fixed field
// headings — per phase-1-findings.md sign-off answer (c): no live
// translation of populated data, ever. Only these structural labels get a
// second-language render; scene descriptions, location names, and every
// other free-text field a coordinator types stay exactly as entered, in
// whichever language they were typed in.
//
// FLAGGED, NOT SILENTLY SHIPPED: the Malayalam strings below were drafted
// by Claude, not verified by a native Malayalam speaker. Sign-off answer
// (c) was explicit that call times and locations are a safety-relevant
// field, not a UX nicety — the same standard applies to labels a crew
// member reads to find those fields. Treat this file as a first draft:
// get it reviewed by a Malayalam-speaking crew member or coordinator
// before a real call sheet goes out bilingual. The rendering mechanism
// (font embedding, layout) is real and verified; this wordlist is not.
export const ML_LABELS = {
  callSheet: "കോൾ ഷീറ്റ്",
  version: "പതിപ്പ്",
  unitCall: "യൂണിറ്റ് കോൾ",
  location: "സ്ഥലം",
  sunriseSunset: "സൂര്യോദയം / അസ്തമയം",
  weather: "കാലാവസ്ഥ",
  hospitalEmergency: "ആശുപത്രി / അടിയന്തര ബന്ധം",
  scenePlan: "രംഗ പദ്ധതി",
  scene: "രംഗം",
  pages: "പേജുകൾ",
  callTimes: "കോൾ സമയങ്ങൾ",
  safetyGrievance: "സുരക്ഷയും പരാതി ബന്ധപ്പെടലും",
  versionFooter:
    "പുതുക്കിയ കോൾ ഷീറ്റ് ഇത് മാറ്റിസ്ഥാപിക്കുന്നു — ഏറ്റവും പുതിയ പതിപ്പാണെന്ന് ഉറപ്പാക്കുക.",
} as const;
