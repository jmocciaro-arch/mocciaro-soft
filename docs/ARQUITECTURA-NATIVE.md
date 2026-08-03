# Arquitectura Native App — Mocciaro Soft en macOS

> **Estado:** POC en `feat/electron-shell` (Fase 1 de 3).
> **Owner:** Juan Manuel Mocciaro.
> **Última actualización:** 2026-05-20.

---

## 1. Objetivo

Que Mocciaro Soft corra como app nativa en la Mac, se abra del Dock como cualquier otra app, funcione local-first y se actualice sola cuando hay internet.

## 2. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Empaquetado | **Electron + Next standalone embebido** | No tocamos código de la app; Next sigue corriendo igual que en Vercel pero adentro de Electron |
| Sync offline | **PowerSync sobre Supabase** (Fase 2) | Multi-empresa con RLS encaja con reglas de sync por `company_id`. Producción-ready. |
| Auto-update | **electron-updater + GitHub Releases (repo privado)** | Standard, soporta firma + notarización Apple |
| Code signing | **Apple Developer ID** | Sin esto el .dmg da warning de Gatekeeper. Pendiente que JMJM genere el cert. |

## 3. Fases

### Fase 1 — Shell de Electron (este POC, branch `feat/electron-shell`)
- [x] Electron 42 + electron-builder + electron-updater + electron-log instalados
- [x] `next.config.ts` con `output: 'standalone'` activable por `ELECTRON_BUILD=1`
- [x] `electron/main.js` que arranca Next standalone en localhost interno (puerto auto)
- [x] BrowserWindow con `titleBarStyle: hiddenInset`, links externos al browser
- [x] electron-builder configurado para `.dmg` arm64 + x64
- [x] Wiring de electron-updater contra GitHub Releases (auto-check inicial + cada hora)
- [ ] Probado en dev (`npm run electron:dev`)
- [ ] Probado dist sin firmar (`npm run electron:pack`)

### Fase 2 — Local-first con PowerSync
- [ ] Provisionar PowerSync Cloud o self-host
- [ ] Definir sync rules por `company_id` espejando policies RLS
- [ ] SQLite local con `@powersync/web` (Electron renderer) + `@powersync/node` (main si hace falta)
- [ ] Capa de abstracción: queries leen de SQLite local, mutaciones van a cola → PowerSync
- [ ] Resolver conflictos: last-write-wins por default, manual review para documentos fiscales emitidos
- [ ] Migrar módulo por módulo: empezar por catálogo (read-only-ish) → clientes → cotizaciones → todo el flujo

### Fase 3 — Distribución pulida
- [ ] Apple Developer ID + notarización automatizada
- [ ] Icon set completo (icon.icns 1024px)
- [ ] DMG background custom + layout
- [ ] Release pipeline en GitHub Actions: tag `v*` → build → notarize → publish
- [ ] Onboarding del usuario: login con Supabase OAuth dentro de la app

## 4. Cómo correr

```bash
# Dev (hot reload, Next dev server)
npm run electron:dev

# Build sin firmar — para probar localmente
npm run electron:pack       # genera release/mac/Mocciaro Soft.app
open "release/mac/Mocciaro Soft.app"

# Dist completo (.dmg arm64 + x64)
npm run electron:dist

# Publicar release a GitHub (requiere GH_TOKEN)
GH_TOKEN=ghp_xxx npm run electron:publish
```

## 5. Cómo funciona el embed de Next

En producción:
1. `electron-builder` empaqueta `.next/standalone/`, `.next/static/` y `public/` dentro del `.app`.
2. Al boot del main process, `electron/main.js`:
   - Reserva un puerto libre (`get-port-please`).
   - `require()` del `server.js` standalone con `PORT` + `HOSTNAME=127.0.0.1` en env.
   - Hace HTTP healthcheck hasta que el server responde.
   - Abre `BrowserWindow` apuntando a `http://127.0.0.1:<puerto>/`.

El renderer es Chromium pegándole a Next como si fuera Vercel. No hay diferencia desde el código.

## 6. Auto-update — flujo de release

1. Bump de versión en `package.json`.
2. `git tag v0.x.y && git push --tags`.
3. GitHub Action (pendiente) corre `npm run electron:publish`:
   - Hace `next build` con `ELECTRON_BUILD=1`.
   - `electron-builder` firma con Developer ID, notariza con Apple, sube .dmg + `latest-mac.yml` al Release.
4. Apps instaladas detectan la nueva versión en el próximo check (≤1 hora), bajan en background, prompt al usuario para reiniciar.

## 7. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Server actions de Next escriben en filesystem temporal raro dentro del `.app` | Usar `app.getPath('userData')` para storage local; chequear cada server action que persista archivos (uploads, PDFs) |
| Supabase Auth cookies en context isolation | `@supabase/ssr` debería funcionar igual, validar en POC |
| `xlsx` y `pdf-lib` cargan binarios — chequear que el asar no los corte | Probar export Excel + PDF en `.app` empaquetada |
| Tamaño del .dmg con todo `node_modules` | Activar `asar` (✓ ya), excluir `*.md`, `*.d.ts`, `*.map` (✓ ya) |
| Variables `.env.local` no están adentro del `.app` | Pasar a `app.getPath('userData')/.env` o pedir login on-first-launch |

## 8. Pendientes para Juan

- [ ] Decidir: ¿el repo `mocciaro-soft` queda privado en GitHub (necesario para Releases privados)?
- [ ] Generar Apple Developer ID Application certificate y exportar el `.p12`.
- [ ] Crear App-Specific Password para notarización (`xcrun notarytool`).
- [ ] Validar que PowerSync entra en presupuesto (~$30-100/mes según volumen).
- [ ] Confirmar política de actualizaciones: silenciosa en background vs. prompt explícito (hoy va prompt).

## 9. Por qué NO hicimos otras cosas (para no re-discutir)

- **Static export**: rompe server actions, API routes y los componentes que consultan Supabase del lado server. Inviable sin reescritura grande.
- **Tauri**: bundle más chico, pero el ecosistema Rust + IPC custom suma fricción que no necesitamos hoy. Si en 12 meses el tamaño del .dmg es un problema, migramos.
- **SPA pegándole a Vercel**: deja de ser local-first. Contradice la decisión #2.
- **Sync custom**: meses de trabajo en infra que no es core del negocio. PowerSync existe.
