# Backups — Mocciaro Soft V001

> **Última actualización:** 2026-05-07
> **Estado:** Fase 0.5 del PLAN-REFACTOR pendiente. Hoy solo backup de Supabase.

---

## Estado actual

| Capa | Cobertura | Retención |
|---|---|---|
| Supabase Pro PITR | Diario automático | 7 días |
| Backup off-site | ❌ NO HAY | — |

⚠ **Para datos contables/fiscales argentinos y españoles, AEAT y AFIP exigen retención mínima 5–10 años.** El backup actual no cubre eso.

---

## Estado objetivo (Fase 0.5 del PLAN-REFACTOR)

| Capa | Frecuencia | Retención | Almacén |
|---|---|---|---|
| Supabase PITR | Continuo | 7d | Supabase |
| Snapshot diario | Cada 24h | 30 días | S3/Backblaze B2 |
| Snapshot semanal | Cada lunes | 12 semanas | S3/Backblaze B2 |
| Snapshot mensual | Día 1 de cada mes | 24 meses | S3/Backblaze B2 |
| Snapshot anual | Día 1 de enero | Permanente | S3/Backblaze B2 |

**Cifrado en reposo** (AES-256 server-side de S3). Clave de cifrado fuera del repo.

---

## Estrategia de implementación (TODO)

1. Cron GitHub Action o Vercel Cron `0 3 * * *` (3 AM UTC) que:
   - Ejecuta `pg_dump --no-owner --no-acl --format=custom`.
   - Comprime con `gzip -9`.
   - Cifra con `gpg --symmetric --cipher-algo AES256` usando passphrase de secreto.
   - Sube a `s3://mocciaro-backups/daily/YYYY-MM-DD.dump.gz.gpg`.
2. Lifecycle policy en S3 que mueve a Glacier los snapshots >90 días.
3. Test trimestral de restore: traer un snapshot, restaurarlo en DB efímera, correr smoke tests.

---

## Runbook de restore (TODO Fase 0.5)

### Restore parcial (una tabla específica)

```bash
# 1. Bajar snapshot
aws s3 cp s3://mocciaro-backups/daily/2026-05-06.dump.gz.gpg .

# 2. Descifrar
gpg --decrypt 2026-05-06.dump.gz.gpg > 2026-05-06.dump.gz
gunzip 2026-05-06.dump.gz

# 3. Extraer una tabla específica
pg_restore --dbname=postgres --schema=public --table=tt_documents 2026-05-06.dump
```

### Restore completo a DB efímera

```bash
# 1. Crear DB temporal
createdb -h localhost mocciaro_restore_test

# 2. Restaurar
pg_restore --dbname=mocciaro_restore_test --no-owner --no-acl 2026-05-06.dump

# 3. Smoke
psql -d mocciaro_restore_test -c "SELECT count(*) FROM tt_documents;"
```

### Restore de emergencia a producción

⚠ **NUNCA hacer esto solo.** Coordinar con Juan + dev senior.

1. Pause de la app en Vercel (deploy de página de mantenimiento).
2. Backup del estado actual (otro snapshot inmediato — antes de tocar nada).
3. Restore en DB temporal primero, validar.
4. Renombrar tablas en prod (suffix `_pre_restore`).
5. Importar tablas restauradas con nombres correctos.
6. Validar manual con cuentas de prueba.
7. Volver a poner la app online.
8. Comunicación a clientes con honestidad sobre el incidente.

---

## Política de no-borrado

- Cancelar documento (soft delete) → OK, queda en DB con `status='cancelled'`.
- Borrar fila físicamente → ❌ prohibido salvo migración explícita aprobada.
- Borrar tablas legacy (Fase 1.6): permitido **solo después** de:
  - 2 sprints de coexistencia validada (sin escrituras nuevas).
  - Backup explícito off-site confirmado.
  - PR aprobado por Juan.

---

## TODO Fase 0.5

- [ ] Setear bucket S3/Backblaze B2 con KMS/encryption.
- [ ] Crear secret `BACKUP_GPG_PASSPHRASE` en GitHub.
- [ ] GitHub Action workflow `.github/workflows/backup.yml`.
- [ ] Cron `0 3 * * *` para diario, `0 3 * * 1` para semanal.
- [ ] Test de restore probado en DB efímera.
- [ ] Email de alerta si backup falla 2 veces consecutivas (Sentry — Fase 0.6).
