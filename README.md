# dereth.network

The website for Dereth Network. For now it is one parked page.

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
