// The Gmail app recognizes "light only" to avoid forced inversion on Google
// accounts. Clients that support the dark media query can use our own palette.
export const EMAIL_PALETTE = {
  background: "#ebece7",
  card: "#ffffff",
  border: "#b9bdb2",
  ink: "#20231f",
  secondary: "#454b43",
  darkBackground: "#141713",
  darkCard: "#232721",
  darkBorder: "#667063",
  darkInk: "#f1f3ee",
  darkSecondary: "#c3cbbf",
  ctaBackground: "#f4c400",
  ctaInk: "#20231f",
} as const;

const p = EMAIL_PALETTE;
export const EMAIL_THEME_HEAD = `
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<style>
  :root { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) {
    .incora-email-bg { background-color:${p.darkBackground} !important; }
    .incora-email-card { background-color:${p.darkCard} !important; border-color:${p.darkBorder} !important; }
    .incora-email-ink { color:${p.darkInk} !important; }
    .incora-email-secondary { color:${p.darkSecondary} !important; border-color:${p.darkBorder} !important; }
    .incora-email-cta { background-color:${p.ctaBackground} !important; color:${p.ctaInk} !important; }
    .incora-email-logo { background-color:${p.card} !important; }
  }
</style>`;
