# iMMAP OpenSign fork: theming + upstream updates

## What changed in this fork
- **iMMAP Microsoft login**: Server-driven Azure AD sign-in (`GET/POST …/auth/microsoft/*`) and `/microsoft-login` callback. Configure `MICROSOFT_*` in server env (see root `.env.example`). Register redirect URI `https://<opensign-host>/microsoft-login` in the same Azure app as immap-project (local: `http://localhost:3000/microsoft-login`).
- **Theme**: Added a new DaisyUI theme named `immapLight` and set it as the default light theme.
- **Typography**: Added minimal global overrides (Barlow + background/text colors) to align with `immap-project-frontend`.
- **Email builder**: Updated the MUI email builder palette to match iMMAP branding.

## Files we intentionally keep small (to reduce merge conflicts)
- `tailwind.config.js` (only imports and appends the theme)
- `src/index.jsx` (sets `data-theme` default)
- `src/components/ThemeToggle.jsx` (switches light theme to `immapLight`)
- `src/components/emailbuilder/EmailBuildertheme.ts` (palette update)
- Additive files:
  - `immapTheme.cjs`
  - `src/styles/immap-theme-overrides.css`

## How to keep receiving upstream updates cleanly
1. **Add upstream remote once** (if not already):

```bash
git remote add upstream https://github.com/opensignlabs/opensign.git
```

2. **Update from upstream** (recommended: rebase your branch):

```bash
git fetch upstream
git checkout <your-branch>
git rebase upstream/main
```

3. If you prefer merge:

```bash
git fetch upstream
git checkout <your-branch>
git merge upstream/main
```

## Conventions
- Prefer **additive** files over modifying many upstream files.
- Avoid broad formatting runs on the OpenSign codebase.
- Keep any iMMAP-specific values in `immapTheme.cjs` so updates remain localized.

