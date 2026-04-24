// Centralized theme tokens for the iMMAP fork.
// Keep this file additive and referenced from config to reduce upstream conflicts.

const immapColors = {
  primary: "#be2126",
  // Secondary is used heavily for surfaces (e.g. `op-bg-secondary`).
  // Keep it neutral to avoid blue dashboard cards.
  secondary: "#6d6e71",
  gray: "#6d6e71",
  background: "#f6f6f6",
  surface: "#ffffff",
  surfaceMuted: "#e6e7e8",
  text: "#505050",
  heading: "#3d3d3d",
};

const immapLight = {
  "immapLight": {
    primary: immapColors.primary,
    "primary-content": "#ffffff",

    secondary: immapColors.secondary,
    "secondary-content": "#ffffff",

    // Use a slightly softer primary as accent for hover/highlights.
    accent: "#af4745",
    "accent-content": "#ffffff",

    neutral: immapColors.gray,
    "neutral-content": "#ffffff",

    "base-100": immapColors.surface,
    "base-200": immapColors.background,
    "base-300": immapColors.surfaceMuted,
    "base-content": immapColors.heading,

    info: "#086cb6",
    success: "#1f9d6b",
    warning: "#faad14",
    error: "#cf1322",

    "--rounded-btn": "0.5rem",
    "--tab-border": "2px",
    "--tab-radius": "0.5rem",
  },
};

module.exports = { immapColors, immapLight };

