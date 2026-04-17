/**
 * scripts/seed-simpa-history.ts
 *
 * Importa el histórico de notas de trabajo SIMPA desde el PDF
 * "mantenimiento SIMPA.pdf" al sistema SAT.
 *
 * 1) Sube el PDF al bucket sat-pdfs
 * 2) Para cada NTT (Nota de Trabajo) parseada del PDF:
 *    - Normaliza número de serie
 *    - Busca activo en tt_sat_assets por serial_number (o internal_id)
 *    - Si matchea, crea registro en tt_sat_service_history con pdf_url
 *    - Si no matchea, crea el activo + el registro
 * 3) Reporta un resumen con matches, creados, skipped
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const PDF_PATH = process.env.HOME! + '/Downloads/mantenimiento SIMPA.pdf'
const TARGET_COMPANY = process.env.TARGET_COMPANY_NAME || 'TorqueTools SL'

// ---------------------------------------------------------------------
// DATOS PARSEADOS DEL PDF
// ---------------------------------------------------------------------
type ServiceEntry = {
  ntt: string
  fecha: string               // YYYY-MM-DD
  tipo: 'PREVENTIVO' | 'CORRECTIVO' | 'GARANTIA'
  ntt_title: string
  sucursal: 'PILAR' | 'CAMPANA'
  internal_id: string | null  // ej "P009", "C008", "L11", "LM3-58"
  model: string               // "ASW18-45-PC"
  serial: string | null
  obs: string                 // notas/observaciones de ese servicio
  partes?: Record<string, string>  // {carcasa:'OK', ...}
}

const SERVICES: ServiceEntry[] = [
  // ──────── NTT00005 — 2024/01/12 PILAR PREVENTIVO ────────
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L1', model:'ASM18-12-PC', serial:'202107023546', obs:'Mandril roto, se hizo el cambio. La luz verde titila cuando comienza a apretar.', partes:{carcasa:'OK',tornillos:'OK',conectores:'OK',embrague:'OK',firmware:'OK',reversa:'OK',cabezal:'OK',rotor:'OK'}},
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'P007', model:'ASM18-12-PC', serial:'202011001970', obs:'Se recibe equipo con falla en la carcasa partida. Reposición de pilolas falantes en el embrague, se reprograma la plaqueta electrónica.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L3', model:'ASM18-12-PC', serial:'202011020991', obs:'Mandril roto, se hizo el cambio. La luz verde titila cuando comienza a apretar.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L4', model:'ASM18-12-PC', serial:'202011020990', obs:'Mandril roto/cambio rápido y limpieza.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L6', model:'ASM18-12-PC', serial:'202005015969', obs:'Presenta una falla muy esporádica al tener la batería colocada que la herramienta no reacciona.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'P004', model:'ASM18-12-PC', serial:'202011015940', obs:'No funciona la reversa. Se reprograma firmware de la plaqueta electrónica. APRIETES: 133875. Cambio de plaqueta electrónica.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'P005', model:'ASM18-12-PC', serial:'202011015965', obs:'Se reprograma la plaqueta electrónica, se limpian contactos.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L8', model:'ASW18-30-PC', serial:'202009015259', obs:'No funciona la reversa.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L9', model:'ASW18-30-PC', serial:'21060169770', obs:'Cambio de cabezal (invertido con L11). Reparación de embrague (sin bolillas).' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L10', model:'ASW18-45-PC', serial:'20100314230', obs:'Limpieza total y reparación provisoria de carcasa. Carcasa rota del lado derecho.' },
  { ntt:'NTT00005', fecha:'2024-01-12', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA PILAR', internal_id:'L11', model:'ASW18-60-PC', serial:'23030234310', obs:'Cambio de cabezal estaba invertido con L9. Cabezal era muy chico, se cambió por el cabezal de la L9.' },

  // ──────── NTT00006 — 2024/02/02 CAMPANA PREVENTIVO ────────
  { ntt:'NTT00006', fecha:'2024-02-02', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA CAMPANA OC 26/1/2023', internal_id:'L1', model:'ASM18-12-PC', serial:'202107023546', obs:'Mantenimiento preventivo campana.' },
  { ntt:'NTT00006', fecha:'2024-02-02', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA CAMPANA OC 26/1/2023', internal_id:'P007', model:'ASM18-12-PC', serial:'202011001970', obs:'Carcasa partida, reprogramación firmware.' },
  { ntt:'NTT00006', fecha:'2024-02-02', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA CAMPANA OC 26/1/2023', internal_id:'L9', model:'ASW18-30-PC', serial:'21060169770', obs:'VIDA APRIETES: 103803. ÚLTIMO SERVICE: 05.01.2023 APRIETES 35863. Cambio de cabezal estaba invertido con L11.' },
  { ntt:'NTT00006', fecha:'2024-02-02', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA CAMPANA OC 26/1/2023', internal_id:'L10', model:'ASW18-45-PC', serial:'20100314230', obs:'Limpieza total y reparación provisoria de carcasa.' },
  { ntt:'NTT00006', fecha:'2024-02-02', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO HERRAMIENTAS FEIN - PLANTA CAMPANA OC 26/1/2023', internal_id:'L11', model:'ASW18-60-PC', serial:'23030234310', obs:'Cabezal invertido con L9, cambio por cabezal nuevo de la L9.' },

  // ──────── NTT00007 — 2024/06/24 CAMPANA CORRECTIVO ────────
  { ntt:'NTT00007', fecha:'2024-06-24', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'ATORNILLADORES FEIN CAMPANA', internal_id:null, model:'ASM18-8-PC', serial:'202011023052', obs:'Llegó con la traba del cambio rápido rota.' },
  { ntt:'NTT00007', fecha:'2024-06-24', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'ATORNILLADORES FEIN CAMPANA', internal_id:null, model:'ASW18-60-PC', serial:'201207015783', obs:'Embrague sin bolillos.' },
  { ntt:'NTT00007', fecha:'2024-06-24', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'ATORNILLADORES FEIN CAMPANA', internal_id:'LM3-58', model:'ASM18-12-PC', serial:'202011001955', obs:'N° CARCASA: 2020-11.001955 - N° PLACA: 2020-08.014203.' },
  { ntt:'NTT00007', fecha:'2024-06-24', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'ATORNILLADORES FEIN CAMPANA', internal_id:'C010', model:'ASW18-60-PC', serial:'201207023757', obs:'La herramienta llegó sin las bolillas en el embrague.' },
  { ntt:'NTT00007', fecha:'2024-06-24', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'ATORNILLADORES FEIN CAMPANA', internal_id:'C002', model:'ASM18-8-PC', serial:'202008014223', obs:'Herramienta queda parpadeando las luces cuando está funcionando. Cambio de plaqueta. Bolillas sueltas embrague.' },

  // ──────── NTT00008 — 2024/09/02 GARANTIA ────────
  { ntt:'NTT00008', fecha:'2024-09-02', tipo:'GARANTIA', sucursal:'PILAR', ntt_title:'Herramientas en Garantia', internal_id:null, model:'ASW18-60-PC', serial:null, obs:'2 equipos ASW18-60-PC reparados en garantía.' },
  { ntt:'NTT00008', fecha:'2024-09-02', tipo:'GARANTIA', sucursal:'PILAR', ntt_title:'Herramientas en Garantia', internal_id:null, model:'ASW18-30-PC', serial:null, obs:'Equipo ASW18-30-PC reparado en garantía.' },
  { ntt:'NTT00008', fecha:'2024-09-02', tipo:'GARANTIA', sucursal:'PILAR', ntt_title:'Herramientas en Garantia', internal_id:null, model:'ASM18-8-PC', serial:null, obs:'Equipo ASM18-8 reparado en garantía.' },

  // ──────── NTT00009 — 2024/10/31 CORRECTIVO EMBRAGUE ────────
  { ntt:'NTT00009', fecha:'2024-10-31', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'REPARACION DE EMBRAGUE DE ASW18-60', internal_id:'L11', model:'ASW18-60-PC', serial:'23030234310', obs:'VIDA APRIETES: 2844. Cambio de cabezal estaba invertido con la herramienta L9.' },
  { ntt:'NTT00009', fecha:'2024-10-31', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'REPARACION DE EMBRAGUE DE ASW18-60', internal_id:'L11', model:'ASW18-60-PC', serial:'23030234100', obs:'Problemas con las bolillas del embrague, cambio total de embrague.' },

  // ──────── NTT00010 — 2024/11/28 CAMPANA CORRECTIVO ────────
  { ntt:'NTT00010', fecha:'2024-11-28', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'REMITO PENDIENTE 02-REPARACION ATORNILLADORES FEIN', internal_id:'C007', model:'ASW18-30-PC', serial:'202006016975', obs:'VIDA APRIETES: 29635. Cambio de plaqueta electrónica, firmware actualizado, torque 4,5 NM.' },
  { ntt:'NTT00010', fecha:'2024-11-28', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'REMITO PENDIENTE 02-REPARACION ATORNILLADORES FEIN', internal_id:'C004', model:'ASM18-12-PC', serial:'202006016774', obs:'VIDA APRIETES: 73873. Firmware actualizado y calibrado.' },
  { ntt:'NTT00010', fecha:'2024-11-28', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'REMITO PENDIENTE 02-REPARACION ATORNILLADORES FEIN', internal_id:'C005', model:'ASM18-45-PC', serial:'202006016766', obs:'Ultimo service APRIETES: 31686. Cambio de placa ASW18-45 por ASW18-30. Nota: la placa llegó rota.' },

  // ──────── NTT00014 — 2025/01/27 PILAR ────────
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P007', model:'ASM18-12-PC', serial:'202011001970', obs:'Carcasa partida. Mantenimiento preventivo. Reposición de pilolas faltantes del embrague.' },
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P001', model:'ASM18-3-PC', serial:'202011015970', obs:'Se reciben equipos con falla en la carcasa partida. Se corta el torque. Mantenimiento preventivo.' },
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P005', model:'ASM18-12-PC', serial:'202011020992', obs:'Mandril roto, se hizo el cambio. La luz verde titila cuando comienza a apretar.' },
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P003', model:'ASM18-12-PC', serial:'202009091320', obs:'Mandril roto, cambio rápido y limpieza.' },
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P002', model:'ASM18-12-PC', serial:'202011020990', obs:'Presenta una falla muy esporádica al tener la batería colocada, no reacciona.' },
  { ntt:'NTT00014', fecha:'2025-01-27', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO PILAR', internal_id:'P006', model:'ASM18-12-PC', serial:'202011020993', obs:'Se cambia juego completo de casquillo. Reposición de piolas faltantes.' },

  // ──────── NTT00015 — 2025/01/29 CAMPANA ────────
  { ntt:'NTT00015', fecha:'2025-01-29', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES CAMPANA', internal_id:'C011', model:'ASW18-30-PC', serial:'202106016973', obs:'VIDA APRIETES: 39761. Se reposicionaron las 3 piolillas del embrague.' },
  { ntt:'NTT00015', fecha:'2025-01-29', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES CAMPANA', internal_id:'C010', model:'ASW18-60-PC', serial:'201207023757', obs:'VIDA APRIETES: 27002. Mantenimiento preventivo. Herramienta llegó sin bolillas en el embrague.' },
  { ntt:'NTT00015', fecha:'2025-01-29', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES CAMPANA', internal_id:'C009', model:'ASW18-6-PC', serial:'202107012577', obs:'VIDA APRIETES: 15726. La rosca del cabezal se encuentra trabada. Reposición de 3 bolillas del embrague. Humedad en el embrague.' },

  // ──────── NTT00017 — 2025/02/26 PILAR ANGULAR FEBRERO ────────
  { ntt:'NTT00017', fecha:'2025-02-26', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN ANGULAR FEBRERO 2025', internal_id:'P009', model:'ASW18-12-PC', serial:'202106022844', obs:'El equipo sufrió un golpe en el uso. Plaqueta electrónica defectuosa, cambio necesario. Firmware KO.' },
  { ntt:'NTT00017', fecha:'2025-02-26', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN ANGULAR FEBRERO 2025', internal_id:'P010', model:'ASW18-60-PC', serial:'202409000052', obs:'Se recibe equipo con programación en 3 ciclos de apriete. Se programa equipo en un ciclo.' },

  // ──────── NTT00018 — 2025/04/29 PILAR PREVENTIVO ────────
  { ntt:'NTT00018', fecha:'2025-04-29', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES ANGULARES PILAR', internal_id:'P011', model:'ASW18-30-PC', serial:'202106016977', obs:'Sector del cabezal estaba dañado, se realiza reposición de cables y conexiones.' },
  { ntt:'NTT00018', fecha:'2025-04-29', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES ANGULARES PILAR', internal_id:'P012', model:'ASW18-45-PC', serial:'202209002746', obs:'Se verifica que el cabezal de la máquina estaba trabado.' },
  { ntt:'NTT00018', fecha:'2025-04-29', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES ANGULARES PILAR', internal_id:'P013', model:'ASW18-30-PC', serial:'202303017851', obs:'Mantenimiento preventivo. Limpieza contactos plaqueta y aceite en el embrague.' },
  { ntt:'NTT00018', fecha:'2025-04-29', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES ANGULARES PILAR', internal_id:'P014', model:'ASW18-30-PC', serial:'202303017849', obs:'Cambio plaqueta electrónica, reprogramación firmware.' },

  // ──────── NTT00019 — 2025/05/05 CAMPANA ────────
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C009', model:'ASW18-45-PC', serial:'15726', obs:'Embrague ok, carcasa ok, reversa reducción 60%. Serie planilla nueva.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C010', model:'ASW18-30-PC', serial:'202107021577', obs:'VIDA APRIETES: 598713. Firmware OK.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C013', model:'ASM18-12-PC', serial:'7744', obs:'VIDA APRIETES: 7744. Reprogramación firmware.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C014', model:'ASM18-30-PC', serial:'202107015781', obs:'Fallaba cabezal, se reprograma firmware plaqueta.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C015', model:'ASW18-60-PC', serial:'202107015771', obs:'Reposición de 3 bolillas. Reducción al 60%.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C016', model:'ASW18-30-PC', serial:'124281', obs:'Mantenimiento preventivo.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C017', model:'ASW18-30-PC', serial:'31502', obs:'Reprograma firmware, limpieza contactos.' },
  { ntt:'NTT00019', fecha:'2025-05-05', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN CAMPANA', internal_id:'C018', model:'ASW18-30-PC', serial:'202303017857', obs:'Equipo reformateado.' },

  // ──────── NTT00020 — 2025/07/15 PILAR CORRECTIVO ────────
  { ntt:'NTT00020', fecha:'2025-07-15', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO CORRECTIVO ATORNILLADORES ANGULARES FEIN PILAR', internal_id:'P013', model:'ASW18-60-PC', serial:'202303023431', obs:'Placa electrónica nueva. Mantenimiento preventivo con reformateo de contactos.' },
  { ntt:'NTT00020', fecha:'2025-07-15', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO CORRECTIVO ATORNILLADORES ANGULARES FEIN PILAR', internal_id:'P015', model:'ASW18-60-PC', serial:'202303023460', obs:'Mantenimiento preventivo y reformateo de firmware.' },
  { ntt:'NTT00020', fecha:'2025-07-15', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO CORRECTIVO ATORNILLADORES ANGULARES FEIN PILAR', internal_id:'P017', model:'ASW18-60-PC', serial:'202303023461', obs:'Firmware nuevo + limpieza contactos.' },
  { ntt:'NTT00020', fecha:'2025-07-15', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO CORRECTIVO ATORNILLADORES ANGULARES FEIN PILAR', internal_id:'P018', model:'ASW18-45-PC', serial:'202304015465', obs:'Cambio cabezal + reprogramación.' },

  // ──────── NTT00021 — 2025/08/25 PILAR AGOSTO ────────
  { ntt:'NTT00021', fecha:'2025-08-25', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN PILAR AGOSTO 2025', internal_id:'P016', model:'ASW18-60-PC', serial:'202409000053', obs:'VIDA APRIETES: 7016. Se realiza mantenimiento preventivo.' },
  { ntt:'NTT00021', fecha:'2025-08-25', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN PILAR AGOSTO 2025', internal_id:'P017', model:'ASW18-60-PC', serial:'202409000050', obs:'VIDA APRIETES: 5459. Cambio de plaqueta.' },
  { ntt:'NTT00021', fecha:'2025-08-25', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN PILAR AGOSTO 2025', internal_id:'P018', model:'ASW18-45-PC', serial:'202304015468', obs:'VIDA APRIETES: 135322. Carcasa rota, se reemplaza.' },
  { ntt:'NTT00021', fecha:'2025-08-25', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN PILAR AGOSTO 2025', internal_id:'P019', model:'ASW18-30-PC', serial:'202106016961', obs:'VIDA APRIETES: 33374. Se recibe con falla en funcionamiento.' },
  { ntt:'NTT00021', fecha:'2025-08-25', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO ATORNILLADORES FEIN PILAR AGOSTO 2025', internal_id:'P020', model:'ASM18-12-PC', serial:'202304015467', obs:'VIDA APRIETES: 11085. Mantenimiento preventivo.' },

  // ──────── NTT00022 — 2025/09/09 FEIN SEPTIEMBRE ────────
  { ntt:'NTT00022', fecha:'2025-09-09', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'2025 09 01 MANTENIMIENTO PREVENTIVO FEIN SEPTIEMBRE', internal_id:'P021', model:'ASW18-60-PC', serial:'202409000051', obs:'VIDA APRIETES: 10212. Embrague trabado con el cuerpo. Reemplazan las 3 bolillas del embrague por nuevas.' },

  // ──────── NTT00024 — 2025/11/14 CHEQUEO PILAR ────────
  { ntt:'NTT00024', fecha:'2025-11-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Herramienta de mantenimiento para chequeo y aprobacion del cliente', internal_id:'P014', model:'ASW18-45-PC', serial:'202409000054', obs:'Equipo con pocos ciclos pero 100% componentes nuevos. Se aconseja ya que equipo con ciclos y 100% piezas condiciones óptimas.' },
  { ntt:'NTT00024', fecha:'2025-11-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Herramienta de mantenimiento para chequeo y aprobacion del cliente', internal_id:'P018', model:'ASW18-45-PC', serial:'202304015467', obs:'VIDA APRIETES: 11085. Se desarmaron problemas, todo funcionando. Reposición bolillas del embrague.' },
  { ntt:'NTT00024', fecha:'2025-11-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Herramienta de mantenimiento para chequeo y aprobacion del cliente', internal_id:'P022', model:'ASW18-60-PC', serial:'202303023450', obs:'VIDA APRIETES: 3670. Equipo con falla embrague de máquina. Reemplazan 3 bolillas del embrague.' },
  { ntt:'NTT00024', fecha:'2025-11-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Herramienta de mantenimiento para chequeo y aprobacion del cliente', internal_id:'P025', model:'ASW18-60-PC', serial:'202303023448', obs:'VIDA APRIETES: 14773. No se encontró problema, se reprograma y cambio de bolillas.' },

  // ──────── NTT00025 — 2026/01/23 ATORNILLADORES CAMPANA ────────
  { ntt:'NTT00025', fecha:'2026-01-23', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'2025 01 23 MANTENIMIENTO PREVENTIVO ATORNILLADORES CAMPANA', internal_id:'C008', model:'ASW18-45-PC', serial:'202107015752', obs:'VIDA APRIETES: 27011. Cambio placa (placa ASW18-45 por una ASW18-30). Placa llegó rota.' },
  { ntt:'NTT00025', fecha:'2026-01-23', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'2025 01 23 MANTENIMIENTO PREVENTIVO ATORNILLADORES CAMPANA', internal_id:'C005', model:'ASM18-8-PC', serial:'202008014218', obs:'VIDA APRIETES: 91444. Firmware actualizado y calibrado.' },
  { ntt:'NTT00025', fecha:'2026-01-23', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'2025 01 23 MANTENIMIENTO PREVENTIVO ATORNILLADORES PILAR', internal_id:'P010', model:'ASW18-60-PC', serial:'202409000052', obs:'Se recibe equipo con programación 3 ciclos apriete. Se programa en un ciclo.' },
  { ntt:'NTT00025', fecha:'2026-01-23', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'2025 01 23 MANTENIMIENTO PREVENTIVO ATORNILLADORES PILAR', internal_id:'P019', model:'ASW18-30-PC', serial:'202106016961', obs:'VIDA APRIETES: 33374. Se recibe equipo con falla. Verifica cable prensado debido a un mal armado.' },

  // ──────── NTT00026 — 2026/04/14 PREVENTIVO Y CORRECTIVO ────────
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'CORRECTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P024', model:'ASW18-45-PC', serial:'142164', obs:'VIDA APRIETES: 142164. Reprograma firmware, torneo de embrague.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P030', model:'ASM18-12-PC', serial:'202212001182', obs:'VIDA APRIETES: 73921. Reversa no reprograma, firmware KO.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'CORRECTIVO', sucursal:'CAMPANA', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P031', model:'ASM18-12-PC', serial:'202304017567', obs:'VIDA APRIETES: 31686. Reprograma con imán más potente. Torque 4,5 NM.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P032', model:'ASW18-18-PC', serial:'202502000022', obs:'VIDA APRIETES: 6311. No funciona la reversa, reprograma firmware.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P033', model:'ASW18-45-PC', serial:'202304015469', obs:'VIDA APRIETES: 6892. Reprograma firmware, embrague reducido 60%.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P034', model:'ASW18-45-PC', serial:'202209002742', obs:'VIDA APRIETES: 42997. Reducción embrague 60%.' },
  { ntt:'NTT00026', fecha:'2026-04-14', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'MANTENIMIENTO PREVENTIVO Y CORRECTIVO', internal_id:'P035', model:'ASW18-30-PC', serial:'202005019377', obs:'VIDA APRIETES: 179357. Se reprograma firmware.' },

  // ──────── NTT00027 — 2026/03/10 SIMPA ────────
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'Mantenimiento 10/03/2026', internal_id:'LM2-53', model:'ASW18-45-PC', serial:null, obs:'SIMPA CAMPANA 2026/02/31. VIDA APRIETES: 26168. ÚLTIMO SERVICE: primer servicio. Tarea realizada: reprogramación y cambio de bolillas.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'Mantenimiento 10/03/2026', internal_id:'C008', model:'ASW18-30-PC', serial:'202307007227', obs:'Fallaba cabezal, se reprograma Firmware plaqueta electrónica.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P025', model:'ASW18-60-PC', serial:'202303023448', obs:'VIDA APRIETES: 14773. Reprograma y cambio de bolillas.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P028', model:'ASW18-60-PC', serial:'3264', obs:'VIDA APRIETES: 32264. Ciclos: 2026 03 10 1. Reprograma firmware + 3 bolillas nuevas.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P029', model:'ASW18-60-PC', serial:'202303023192', obs:'VIDA APRIETES: 56172. FECHA: 2026 03 10 1. Firmware OK + limpieza contactos + 3 bolillas nuevas.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P033', model:'ASW18-45-PC', serial:'56172', obs:'VIDA APRIETES: 56172. Firmware OK + limpieza contactos + 3 bolillas nuevas.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P034', model:'ASM18-12-PC', serial:'202307007551', obs:'Fallaba cabezal, se reprograma firmware.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'CAMPANA', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P026', model:'ASM18-8-PC', serial:'202107027032', obs:'No funciona la reversa, se reprograma firmware.' },
  { ntt:'NTT00027', fecha:'2026-03-10', tipo:'PREVENTIVO', sucursal:'PILAR', ntt_title:'Mantenimiento 10/03/2026', internal_id:'P027', model:'ASM18-12-PC', serial:'202307003565', obs:'No funciona la reversa, se reprograma firmware.' },
]

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
function normalizeSerial(s: string | null): string {
  if (!s) return ''
  return s.replace(/[\s.\-/]/g, '').toLowerCase()
}

function normalizeName(s: string | null): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

async function main() {
  console.log('🔍 Leyendo PDF...')
  if (!existsSync(PDF_PATH)) {
    console.error(`PDF no encontrado: ${PDF_PATH}`)
    process.exit(1)
  }
  const pdfBuffer = readFileSync(PDF_PATH)

  // 1) Subir PDF a storage
  console.log('\n📤 Subiendo PDF al bucket sat-pdfs...')
  const pdfPath = `simpa/mantenimiento-simpa-historico-${Date.now()}.pdf`
  const { error: upErr } = await sb.storage.from('sat-pdfs').upload(pdfPath, pdfBuffer, {
    contentType: 'application/pdf', upsert: true,
  })
  if (upErr) { console.error('Error uploading PDF:', upErr); process.exit(1) }
  const { data: urlData } = sb.storage.from('sat-pdfs').getPublicUrl(pdfPath)
  const PDF_URL = urlData.publicUrl
  console.log(`   ✓ PDF subido: ${PDF_URL}`)

  // 2) Buscar empresa TorqueTools
  const { data: companies } = await sb.from('tt_companies').select('id, name').ilike('name', `%${TARGET_COMPANY}%`).limit(1)
  if (!companies?.length) { console.error('Empresa no encontrada'); process.exit(1) }
  const COMPANY_ID = companies[0].id
  console.log(`   Empresa: ${companies[0].name}`)

  // 3) Buscar cliente SIMPA
  const { data: clients } = await sb.from('tt_clients').select('id, name').ilike('name', '%simpa%').limit(5)
  let simpaClientId: string | null = null
  if (clients?.length) {
    simpaClientId = clients[0].id
    console.log(`   Cliente matcheado: ${clients[0].name} (${simpaClientId})`)
  } else {
    // Crear cliente Grupo Simpa
    const { data: newCli } = await sb.from('tt_clients').insert({
      name: 'Grupo Simpa S.A.', city: 'Campana', state: 'Buenos Aires', country: 'AR', active: true, source: 'fein_seed',
    } as any).select('id').single()
    simpaClientId = (newCli as { id: string } | null)?.id || null
    console.log(`   Cliente creado: Grupo Simpa S.A. (${simpaClientId})`)
  }

  // 4) Traer TODOS los activos SIMPA existentes (por nombre cliente normalizado)
  const { data: allAssets } = await sb.from('tt_sat_assets').select('id, ref, internal_id, serial_number, model, client_name_raw').limit(10000)
  const simpaAssets = (allAssets || []).filter((a) => {
    const raw = (a.client_name_raw as string | null) || ''
    return normalizeName(raw).includes('simpa')
  })
  console.log(`\n📋 Activos SIMPA en DB: ${simpaAssets.length}`)

  // Index por serial y por internal_id
  const bySerial = new Map<string, any>()
  const byInternalId = new Map<string, any>()
  for (const a of simpaAssets) {
    const s = normalizeSerial(a.serial_number as string)
    if (s) bySerial.set(s, a)
    const iid = normalizeName(a.internal_id as string)
    if (iid) byInternalId.set(iid, a)
  }

  // 5) Procesar cada servicio
  console.log(`\n▶ Procesando ${SERVICES.length} servicios del PDF...`)
  let matched = 0, createdAssets = 0, insertedHistory = 0, skipped = 0
  const assetIdByInternalId = new Map<string, string>()

  for (const svc of SERVICES) {
    // Intentar match por serial, luego por internal_id
    const serialNorm = normalizeSerial(svc.serial)
    let asset = serialNorm ? bySerial.get(serialNorm) : null
    if (!asset && svc.internal_id) {
      asset = byInternalId.get(normalizeName(svc.internal_id))
    }

    let assetId: string | null = asset?.id || null

    if (!assetId) {
      // Reusar activo creado en esta corrida con mismo internal_id (para servicios repetidos)
      if (svc.internal_id && assetIdByInternalId.has(svc.internal_id)) {
        assetId = assetIdByInternalId.get(svc.internal_id)!
      } else if (svc.serial || svc.internal_id) {
        // Crear activo nuevo
        const sucursal = svc.sucursal === 'PILAR' ? 'Simpa Pilar' : 'Simpa Campana'
        const ref = `SIMPA-${svc.internal_id || svc.serial || Math.random().toString(36).slice(2,6)}`
        const { data: newA, error: cErr } = await sb.from('tt_sat_assets').insert({
          ref, internal_id: svc.internal_id,
          serial_number: svc.serial, brand: 'FEIN',
          model: svc.model, model_normalized: svc.model.replace(/\s+/g,'').replace(/-PC$/i,'').toUpperCase(),
          client_id: simpaClientId, client_name_raw: sucursal,
          company_id: COMPANY_ID, city: svc.sucursal === 'PILAR' ? 'Pilar' : 'Campana',
          province: 'Buenos Aires', country: 'AR', is_new: false,
        } as any).select('id').single()
        if (cErr || !newA) {
          console.log(`   ⚠️  No se pudo crear activo ${ref}: ${cErr?.message}`)
          skipped++
          continue
        }
        assetId = (newA as { id: string }).id
        createdAssets++
        if (svc.internal_id) assetIdByInternalId.set(svc.internal_id, assetId)
      } else {
        skipped++
        continue
      }
    } else {
      matched++
    }

    // Numerar servicios para ese activo
    const { count } = await sb
      .from('tt_sat_service_history')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', assetId)
    const serviceNumber = (count || 0) + 1

    // Insertar histórico
    const { error: insErr } = await sb.from('tt_sat_service_history').insert({
      asset_id: assetId,
      service_number: serviceNumber,
      fecha: svc.fecha,
      tecnico: 'BuscaTools',
      tecnico_recepcion: 'BuscaTools',
      tecnico_mant: 'BuscaTools',
      tipo: svc.tipo,
      partes: svc.partes || {},
      torque_measurements: {},
      cot_estado: 'APROBADA',
      estado_final: 'APROBADA',
      obs: svc.obs,
      company_id: COMPANY_ID,
      pdf_url: PDF_URL,
      ntt_number: svc.ntt,
      source: 'fein_legacy_import',
    } as any)
    if (insErr) {
      console.log(`   ⚠️  Error insertando historial ${svc.ntt}/${svc.internal_id}: ${insErr.message}`)
      skipped++
      continue
    }
    insertedHistory++
  }

  console.log('\n═══════════════════════════════════')
  console.log('  RESUMEN')
  console.log('═══════════════════════════════════')
  console.log(`  Servicios procesados:   ${SERVICES.length}`)
  console.log(`  ✅ Activos matcheados:   ${matched}`)
  console.log(`  🆕 Activos creados:      ${createdAssets}`)
  console.log(`  📝 Registros historial:  ${insertedHistory}`)
  console.log(`  ⏭  Skipped:              ${skipped}`)
  console.log(`  📄 PDF:                  ${PDF_URL}`)
  console.log('\n✓ Seed histórico SIMPA completado.')
}

main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1) })
