# iMMAP OpenSign fork: theming + upstream updates

## What changed in this fork
- **iMMAP Microsoft login**: Server-driven Azure AD sign-in (`GET/POST …/auth/microsoft/*`) and `/microsoft-login` callback. Configure `MICROSOFT_*` in server env (see root `.env.example`). Register redirect URI `https://<opensign-host>/microsoft-login` in the same Azure app as immap-project (local: `http://localhost:3000/microsoft-login`).
- **SharePoint document source**: Create-document forms (Sign Yourself, Request Signatures, New Template) can load a PDF/DOCX/image from SharePoint folders the Outlook SSO user can access. After signing is complete, the signed PDF is saved back to the same folder as `{originalName}_signed_YYYY-MM-DD.pdf`. Encrypted Graph tokens are stored on `contracts_Users`.
- **Theme**: Added a new DaisyUI theme named `immapLight` and set it as the default light theme.
- **Typography**: Added minimal global overrides (Barlow + background/text colors) to align with `immap-project-frontend`.
- **Email builder**: Updated the MUI email builder palette to match iMMAP branding.

## Azure Graph permissions (SharePoint)
On the same Azure app used for iMMAP SSO, add **delegated** Microsoft Graph permissions and grant **admin consent**:
- `User.Read`
- `Files.ReadWrite.All`
- `Sites.Read.All`
- `offline_access` (plus `openid`, `profile`, `email`)

OpenSign requests these scopes at Microsoft login. iProject login scopes are unchanged. After deploy, existing Outlook users must sign in with Microsoft once more so a refresh token with file/site scopes is stored.

Optional env: `MICROSOFT_TOKEN_ENCRYPTION_KEY` (falls back to `MASTER_KEY`).

## Files we intentionally keep small (to reduce merge conflicts)
- `tailwind.config.js` (only imports and appends the theme)
- `src/index.jsx` (sets `data-theme` default)
- `src/components/ThemeToggle.jsx` (switches light theme to `immapLight`)
- `src/components/emailbuilder/EmailBuildertheme.ts` (palette update)
- Additive files:
  - `immapTheme.cjs`
  - `src/styles/immap-theme-overrides.css`
  - `apps/OpenSignServer/auth/microsoftTokenCrypto.js`
  - `apps/OpenSignServer/cloud/helpers/microsoftGraphTokens.js`
  - `apps/OpenSignServer/cloud/helpers/sharePointGraph.js`
  - `apps/OpenSignServer/cloud/parsefunction/sharePoint.js`
  - `apps/OpenSign/src/components/shared/fields/SharePointSourcePicker.jsx`
  - `apps/OpenSign/src/components/shared/fields/SharePointBrowserModal.jsx`

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

