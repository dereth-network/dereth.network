# dereth.network

The website for Dereth Network: one landing page for the Dereth client and the Empyrean server.

- `index.html`, `src/style.css`, and `src/main.ts` (the before-and-after sliders).
- `public/media/`: the screenshots, the launcher's painting, the icons, and the two fonts, Cinzel
  and EB Garamond, under the SIL Open Font Licence (`public/media/fonts/OFL-*.txt`). Files in
  `public/` keep their names, so they live under `/media/`, not `/assets/`, which the server
  caches for a year for Vite's hashed files.
- The server's content-security policy allows no inline styles or scripts, so none go in
  `index.html`.

```text
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # builds dist/ and checks it
npm run deploy     # builds, copies to the server, switches it in, checks it
```

`server.mjs` serves `dist/` (Node, no dependencies), with `/healthz` for the deploy. The deploy's
destination is yours, never the repository's: `deploy/target.json` (untracked, from
`deploy/target.example.json`), the `DERETH_DEPLOY_TARGET` environment variable, or
`npm run deploy -- you@your-vm`.

## Notices

Asheron's Call and all related names, marks, and artwork are the property of their respective
owners; this is an unaffiliated, non-commercial fan project and claims no rights to them.
