// HIVE design tokens — the layer the brand guideline never wrote down.
// The brand doc (Drive: "HIVE BRAND REFERENCE.pdf") gives two fonts and five
// colors; everything else here is the grammar codified from the screens the
// team loves (Home, the tab footer, Admin). New UI should pull from these
// instead of inventing new sizes/tints — that drift is exactly what made the
// app feel like "each page had a different designer."

export const fonts = {
  /** Libre Baskerville bold — page titles, member names, display moments ONLY. */
  display: 'LibreBaskerville_700Bold',
  /** Libre Baskerville regular — italic quotes, "known for" lines. */
  displayRegular: 'LibreBaskerville_400Regular',
  /** Lato bold — buttons, tabs, labels, emphasized body. */
  bold: 'Lato_700Bold',
  /** Lato regular — everything else. */
  regular: 'Lato_400Regular',
} as const;

// Six sizes. If a design wants something between two steps, pick a step.
export const type = {
  /** 11 — timestamps, fine print, tiny counts. */
  fine: 11,
  /** 13 — secondary body, detail lines, list metadata. */
  small: 13,
  /** 15 — default body and list rows. */
  body: 15,
  /** 17 — card titles, emphasized copy. */
  emphasis: 17,
  /** 19 — gold-bar page titles (display serif, letterSpacing ~1.2). */
  title: 19,
  /** 26 — hero/display moments (serif). */
  display: 26,
} as const;

export const colors = {
  // Brand core (from the guideline).
  gold: '#bd9348',
  goldLight: '#dec181',
  charcoal: '#313130',
  cream: '#f6f4e5',
  // Warm neutrals (codified from Home's panel grammar).
  /** Card/panel background — warm paper. */
  paper: '#fffdf5',
  /** Softer parchment card fill (wish cards, callouts). */
  parchment: '#fdf8ec',
  /** Selected/active fill (chosen tab, active row). */
  selected: '#fdf3dc',
  /** Small-caps section labels, secondary icons. */
  label: '#8e7a5e',
  /** Muted warm text — timestamps, counts, placeholders. */
  softInk: '#a09274',
  /** Deep gold text on selected fills. */
  goldInk: '#8e6f35',
  /** Disabled fills (send buttons etc.). */
  sand: '#ddd3b6',
  // Borders.
  border: 'rgba(222,193,129,0.7)',
  borderSoft: 'rgba(222,193,129,0.5)',
  borderFaint: 'rgba(222,193,129,0.28)',
} as const;

/** The Home-panel shadow — use on floating cards/panels. */
export const goldShadow = {
  shadowColor: '#bd9348',
  shadowOpacity: 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
} as const;
