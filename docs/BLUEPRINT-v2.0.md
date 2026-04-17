# MOCCIARO SOFT ERP v2.0 — Blueprint Tecnico Completo

> Sistema integral CRM + ERP + MRP + Mantenimiento + E-Commerce + Comunicaciones + IA
> Autor: Blueprint generado para equipo de desarrollo
> Fecha: 2026-04-14
> Base: StelOrder (replica 100%) + Mocciaro Soft v1.0 + Buscatools Mantenimiento

---

## INDICE

1. [Vision General](#1-vision-general)
2. [Stack Tecnologico](#2-stack-tecnologico)
3. [Arquitectura del Sistema](#3-arquitectura-del-sistema)
4. [Modelo de Datos (Base de Datos)](#4-modelo-de-datos)
5. [Sistema Multi-Tenant y Multi-Empresa](#5-multi-tenant)
6. [Autenticacion, Usuarios y Permisos (RBAC)](#6-rbac)
7. [Interfaces Visuales (3 Modos)](#7-interfaces-visuales)
8. [Dashboard Configurable](#8-dashboard)
9. [Modulo CRM](#9-crm)
10. [Modulo Catalogo / Productos](#10-catalogo)
11. [Modulo Ventas](#11-ventas)
12. [Modulo Compras](#12-compras)
13. [Modulo Stock / Inventario](#13-stock)
14. [Modulo SAT / Mantenimiento](#14-sat)
15. [Modulo Facturacion y Tesoreria](#15-facturacion)
16. [Modulo Clientes](#16-clientes)
17. [Modulo Informes](#17-informes)
18. [Modulo Comunicaciones (Chat + Inbox)](#18-comunicaciones)
19. [Modulo E-Commerce (Shop)](#19-ecommerce)
20. [Portal de Clientes y Distribuidores](#20-portales)
21. [Integraciones Externas](#21-integraciones)
22. [Motor de Procesos (BPM)](#22-bpm)
23. [Sistema de Automatizacion e IA](#23-ia)
24. [Modulo Administracion](#24-admin)
25. [API REST / GraphQL](#25-api)
26. [Seguridad](#26-seguridad)
27. [Infraestructura y Deploy](#27-infra)
28. [Plan de Migracion](#28-migracion)
29. [Roadmap de Implementacion](#29-roadmap)

---

## 1. VISION GENERAL

### 1.1 Objetivo
Construir un sistema de gestion empresarial completo que:
- Replique el 100% de las funcionalidades de StelOrder
- Incorpore el motor de mantenimiento de Buscatools (workflow de 5 pasos)
- Extienda con CRM avanzado, e-commerce, chat interno, portales externos e IA
- Soporte multi-empresa (TorqueTools SL, BuscaTools SA, Torquear SA, Global Assembly Solutions LLC)
- Ofrezca 3 modos visuales intercambiables

### 1.2 Usuarios del Sistema

| Tipo | Acceso | Ejemplos |
|------|--------|----------|
| **Admin** | Todo el sistema, todas las empresas | Direccion, IT |
| **Vendedor** | CRM, cotizaciones, pedidos, clientes asignados | Equipo comercial |
| **Tecnico** | SAT, mantenimiento, ordenes de trabajo | Equipo tecnico |
| **Compras** | Proveedores, OC, recepciones, pagos | Dept. compras |
| **Viewer** | Solo lectura en modulos asignados | Auditores |
| **Cliente externo** | Portal: pedidos, seguimiento, historial, incidencias | Clientes finales |
| **Distribuidor externo** | Portal: precios mayoristas, stock, OC, seguimiento | Distribuidores |
| **Proveedor externo** | Portal: OC recibidas, entregas, facturas | Proveedores |

### 1.3 Empresas del Grupo

| Empresa | Pais | Moneda | CIF/CUIT |
|---------|------|--------|----------|
| TorqueTools SL | Espana | EUR | Configurado |
| BuscaTools SA | Argentina | ARS | Configurado |
| Torquear SA | Argentina | ARS | Configurado |
| Global Assembly Solutions LLC | USA | USD | Configurado |

---

## 2. STACK TECNOLOGICO

### 2.1 Frontend
```
Framework:       Next.js 16+ (App Router, RSC)
UI:              React 19+ con Server Components
Estilos:         Tailwind CSS 4 + CSS Variables (tema oscuro/claro)
Componentes:     Libreria propia (Button, Input, Modal, Table, Card, etc.)
                 + Radix UI primitives para accesibilidad
Drag & Drop:     react-grid-layout (dashboard), dnd-kit (kanban, listas)
Graficos:        Recharts + custom SVG para KPIs
Iconos:          Lucide React
Estado:          React Context + Zustand (stores globales)
Forms:           React Hook Form + Zod (validacion)
Tablas:          TanStack Table v8 (columnas configurables, paginacion server-side)
Editor rich:     TipTap (notas, descripciones, emails)
PDF:             react-pdf + @react-pdf/renderer (generacion client-side)
                 + Puppeteer server-side para PDFs complejos
Real-time:       Supabase Realtime (WebSockets)
Offline:         Service Worker + IndexedDB para modo offline parcial
```

### 2.2 Backend
```
Runtime:         Node.js 22+ (via Next.js API Routes + Server Actions)
Base de datos:   Supabase (PostgreSQL 16+)
Auth:            Supabase Auth (email/pass, Google OAuth, Magic Link)
Storage:         Supabase Storage (archivos, imagenes, PDFs)
Real-time:       Supabase Realtime (PostgreSQL LISTEN/NOTIFY)
Edge Functions:  Supabase Edge Functions (Deno) para webhooks, integraciones
Background:      Supabase pg_cron + Edge Functions para tareas programadas
Search:          PostgreSQL Full-Text Search + pg_trgm
Cache:           Supabase CDN + Next.js ISR + Redis (Upstash) para sesiones
Queue:           Inngest o Trigger.dev para jobs asincrono (emails, sync, IA)
```

### 2.3 Integraciones
```
Email:           Gmail API (OAuth2 por usuario)
WhatsApp:        WhatsApp Business Cloud API (Meta)
Marketplaces:    MercadoLibre API, Amazon SP-API, eBay API
E-commerce:      WooCommerce REST API, WordPress REST API
IA:              OpenAI API, Anthropic Claude API, Google Gemini API
Pagos:           Stripe, MercadoPago
Facturacion-e:   Verifactu/TicketBAI (ES), AFIP (AR)
OCR:             Google Vision API / Tesseract
Notificaciones:  Firebase Cloud Messaging (push)
```

### 2.4 Infraestructura
```
Hosting:         Vercel (frontend + API routes)
Database:        Supabase Cloud (region eu-west para TorqueTools SL)
Storage:         Supabase Storage + Cloudflare R2 (archivos grandes)
CDN:             Vercel Edge Network
Monitoring:      Sentry (errores) + Vercel Analytics
CI/CD:           GitHub Actions → Vercel
Ambientes:       dev → staging → production
```

---

## 3. ARQUITECTURA DEL SISTEMA

### 3.1 Estructura de Carpetas
```
mocciaro-soft-v2/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Rutas publicas (login, registro)
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx     # Registro de clientes/distribuidores
│   │   │   └── forgot-password/page.tsx
│   │   ├── (dashboard)/              # Rutas protegidas (app principal)
│   │   │   ├── layout.tsx            # Shell: sidebar + topbar + main
│   │   │   ├── page.tsx              # Dashboard
│   │   │   ├── crm/
│   │   │   │   ├── page.tsx          # Pipeline kanban
│   │   │   │   ├── [id]/page.tsx     # Detalle oportunidad
│   │   │   │   └── forms/page.tsx    # Constructor de formularios
│   │   │   ├── ventas/
│   │   │   │   ├── page.tsx          # Tabs: cotiz, pedidos, albaranes, facturas, cobros
│   │   │   │   ├── [type]/[id]/page.tsx  # Detalle documento
│   │   │   │   └── nuevo/page.tsx    # Crear documento
│   │   │   ├── compras/
│   │   │   │   ├── page.tsx          # Tabs: proveedores, OC, recepciones, facturas, pagos
│   │   │   │   ├── [type]/[id]/page.tsx
│   │   │   │   └── calendario/page.tsx
│   │   │   ├── stock/
│   │   │   │   ├── page.tsx          # Inventario, movimientos, traspasos
│   │   │   │   └── almacenes/page.tsx
│   │   │   ├── catalogo/
│   │   │   │   ├── page.tsx          # Productos con filtros facetados
│   │   │   │   ├── [id]/page.tsx     # Ficha producto
│   │   │   │   ├── categorias/page.tsx
│   │   │   │   ├── marcas/page.tsx
│   │   │   │   └── import/page.tsx   # Import/export masivo
│   │   │   ├── sat/
│   │   │   │   ├── page.tsx          # Incidencias, OT, activos
│   │   │   │   ├── ficha/[ref]/page.tsx  # Workflow 5 pasos (Buscatools)
│   │   │   │   ├── activos/page.tsx
│   │   │   │   └── repuestos/page.tsx
│   │   │   ├── clientes/
│   │   │   │   ├── page.tsx          # Lista + favoritos + ranking
│   │   │   │   └── [id]/page.tsx     # Ficha cliente
│   │   │   ├── informes/
│   │   │   │   ├── page.tsx          # Resumen, resultados, facturacion, etc.
│   │   │   │   └── [report]/page.tsx
│   │   │   ├── comunicaciones/
│   │   │   │   ├── page.tsx          # Inbox unificado
│   │   │   │   ├── chat/page.tsx     # Chat interno
│   │   │   │   └── [thread]/page.tsx
│   │   │   ├── shop/
│   │   │   │   ├── page.tsx          # Admin del e-commerce
│   │   │   │   └── config/page.tsx
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx          # Usuarios, roles, empresas, params
│   │   │   │   ├── procesos/page.tsx # Motor de procesos
│   │   │   │   └── automatizaciones/page.tsx
│   │   │   └── ajustes/
│   │   │       └── page.tsx          # Configuracion personal
│   │   ├── portal/                   # Portal externo (clientes/distribuidores)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Dashboard portal
│   │   │   ├── pedidos/page.tsx
│   │   │   ├── seguimiento/page.tsx
│   │   │   ├── incidencias/page.tsx
│   │   │   └── facturas/page.tsx
│   │   ├── api/                      # API Routes
│   │   │   ├── auth/[...supabase]/route.ts
│   │   │   ├── admin/
│   │   │   ├── crm/
│   │   │   ├── ventas/
│   │   │   ├── compras/
│   │   │   ├── stock/
│   │   │   ├── sat/
│   │   │   ├── comunicaciones/
│   │   │   ├── integraciones/
│   │   │   │   ├── gmail/route.ts
│   │   │   │   ├── whatsapp/route.ts
│   │   │   │   ├── mercadolibre/route.ts
│   │   │   │   ├── woocommerce/route.ts
│   │   │   │   └── ai/route.ts
│   │   │   ├── webhooks/
│   │   │   │   ├── whatsapp/route.ts
│   │   │   │   ├── mercadolibre/route.ts
│   │   │   │   └── stripe/route.ts
│   │   │   └── public/               # API publica para portal/shop
│   │   │       ├── productos/route.ts
│   │   │       └── pedidos/route.ts
│   │   └── shop/                     # Tienda publica (SSR)
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       ├── [categoria]/page.tsx
│   │       └── producto/[slug]/page.tsx
│   ├── components/
│   │   ├── ui/                       # Componentes base reutilizables
│   │   ├── layout/                   # Shell, Sidebar, Topbar
│   │   ├── crm/                      # Kanban, oportunidad card
│   │   ├── ventas/                   # Documento viewer, lineas
│   │   ├── sat/                      # Workflow steps, grid partes
│   │   ├── catalogo/                 # Filtros facetados, product card
│   │   ├── comunicaciones/           # Chat, inbox, thread
│   │   ├── dashboard/                # Widgets, grid layout
│   │   └── shared/                   # Componentes compartidos
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server client (RSC)
│   │   │   ├── middleware.ts         # Auth middleware
│   │   │   └── admin.ts             # Service role client
│   │   ├── stores/                   # Zustand stores
│   │   │   ├── auth-store.ts
│   │   │   ├── company-store.ts      # Empresa activa
│   │   │   ├── ui-store.ts           # Modo visual, sidebar, theme
│   │   │   └── notification-store.ts
│   │   ├── hooks/                    # Custom hooks
│   │   ├── utils/                    # Utilidades generales
│   │   ├── constants/                # Constantes, enums
│   │   ├── types/                    # TypeScript types globales
│   │   └── integrations/            # Clientes de APIs externas
│   │       ├── gmail.ts
│   │       ├── whatsapp.ts
│   │       ├── mercadolibre.ts
│   │       ├── woocommerce.ts
│   │       └── ai.ts
│   └── middleware.ts                 # Auth + RBAC middleware
├── supabase/
│   ├── migrations/                   # SQL migrations
│   ├── seed.sql                      # Datos iniciales
│   └── functions/                    # Edge Functions
│       ├── whatsapp-webhook/
│       ├── gmail-sync/
│       ├── ai-agent/
│       └── cron-jobs/
├── scripts/
│   ├── migrate-stelorder.ts          # Migracion desde StelOrder
│   ├── migrate-buscatools.ts         # Migracion desde Buscatools
│   └── seed-demo.ts                  # Datos demo
└── public/
    ├── templates/                    # Plantillas PDF
    └── assets/
```

### 3.2 Diagrama de Arquitectura

```
                    ┌─────────────────────────────────────┐
                    │           CLIENTES / USUARIOS        │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │         VERCEL EDGE NETWORK          │
                    │    (CDN + SSR + API Routes)           │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
    │   NEXT.JS APP    │ │   API ROUTES    │ │  EDGE FUNCTIONS │
    │  (RSC + Client)  │ │  (REST + RPC)   │ │  (Webhooks, AI) │
    └─────────┬────────┘ └────────┬────────┘ └────────┬────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │         SUPABASE PLATFORM            │
                    │                                      │
                    │  ┌─────────┐  ┌──────────┐          │
                    │  │ Auth    │  │ Realtime │          │
                    │  └─────────┘  └──────────┘          │
                    │  ┌─────────┐  ┌──────────┐          │
                    │  │ Storage │  │ pg_cron  │          │
                    │  └─────────┘  └──────────┘          │
                    │  ┌──────────────────────────┐       │
                    │  │    PostgreSQL 16+         │       │
                    │  │  (RLS + Functions + FTS)  │       │
                    │  └──────────────────────────┘       │
                    └─────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
    │   GMAIL API      │ │  WHATSAPP API   │ │  MARKETPLACE    │
    │  (por usuario)   │ │  (Cloud API)    │ │  APIs           │
    └──────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 4. MODELO DE DATOS

### 4.1 Tablas Principales

#### CORE (Multi-tenant)

```sql
-- ═══ EMPRESAS ═══
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,                    -- CIF/CUIT/EIN
  country TEXT DEFAULT 'ES',
  currency TEXT DEFAULT 'EUR',
  default_vat NUMERIC(5,2) DEFAULT 21,
  default_margin NUMERIC(5,2) DEFAULT 30,
  logo_url TEXT,
  address JSONB,                  -- {street, city, state, zip, country}
  contact JSONB,                  -- {phone, email, web}
  fiscal_config JSONB,            -- {vat_regime, irpf, recargo_equiv, serie_facturas}
  settings JSONB,                 -- Config general empresa
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ USUARIOS ═══
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  whatsapp TEXT,
  gmail TEXT,                     -- Gmail personal para integracion
  company_ids UUID[] DEFAULT '{}', -- Empresas asignadas
  default_company_id UUID REFERENCES companies(id),
  specialties TEXT[] DEFAULT '{}', -- torque, ingenieria, sat, etc.
  preferences JSONB DEFAULT '{}', -- {theme, mode, dashboard_layout, language}
  active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ RBAC ═══
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('internal','external_client','external_supplier','external_distributor')),
  description TEXT,
  is_system BOOLEAN DEFAULT false,  -- Roles del sistema no editables
  active BOOLEAN DEFAULT true
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,        -- ej: ventas.create, stock.view, admin.users
  label TEXT NOT NULL,
  module TEXT NOT NULL,              -- ventas, compras, stock, crm, sat, admin, etc.
  description TEXT
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),  -- Rol por empresa
  PRIMARY KEY (user_id, role_id, company_id)
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  company_id UUID REFERENCES companies(id),
  active BOOLEAN DEFAULT true
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',      -- leader, member
  PRIMARY KEY (team_id, user_id)
);
```

#### CLIENTES Y CONTACTOS

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),  -- Empresa propietaria
  reference TEXT,                   -- CLI-2026-0001
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,                      -- CIF/CUIT del cliente
  type TEXT DEFAULT 'client' CHECK (type IN ('client','distributor','both')),
  category TEXT,                    -- A, B, C o custom
  payment_terms TEXT,               -- 30 dias, contado, etc.
  payment_method TEXT,              -- transferencia, tarjeta, etc.
  credit_limit NUMERIC(12,2),
  discount_default NUMERIC(5,2) DEFAULT 0,
  price_list_id UUID,              -- Tarifa especial
  tax_regime TEXT,                  -- Normal, Recargo equiv, Exento
  country TEXT,
  address JSONB,                   -- {street, city, state, zip}
  is_favorite BOOLEAN DEFAULT false,
  notes TEXT,
  -- Portal access
  portal_enabled BOOLEAN DEFAULT false,
  portal_user_id UUID REFERENCES auth.users(id),
  -- Metrics (calculados, cacheados)
  total_invoiced NUMERIC(14,2) DEFAULT 0,
  total_pending NUMERIC(14,2) DEFAULT 0,
  total_collected NUMERIC(14,2) DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### CATALOGO / PRODUCTOS

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  seo JSONB,                       -- {title, description, keywords}
  active BOOLEAN DEFAULT true
);

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  website TEXT,
  is_protected BOOLEAN DEFAULT false,  -- FEIN no se puede borrar
  active BOOLEAN DEFAULT true
);

CREATE TABLE product_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificacion
  sku TEXT UNIQUE,
  barcode TEXT,
  reference TEXT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,                 -- Visible al cliente (HTML/rich text)
  internal_notes TEXT,              -- Solo uso interno
  -- Clasificacion
  category_id UUID REFERENCES categories(id),
  subcategory_id UUID REFERENCES categories(id),
  brand_id UUID REFERENCES brands(id),
  series_id UUID REFERENCES product_series(id),
  type TEXT DEFAULT 'product' CHECK (type IN ('product','service','expense','asset')),
  -- Precios
  cost_price NUMERIC(12,4),         -- Precio de costo
  base_price NUMERIC(12,4),         -- Precio base (sin IVA)
  sale_price NUMERIC(12,4),         -- PVP
  min_price NUMERIC(12,4),          -- Precio minimo (bloqueo)
  currency TEXT DEFAULT 'EUR',
  vat_rate NUMERIC(5,2) DEFAULT 21,
  -- Precios por rol
  distributor_price NUMERIC(12,4),
  distributor_discount NUMERIC(5,2),
  -- Stock
  track_stock BOOLEAN DEFAULT true,
  stock_min INT DEFAULT 0,
  stock_max INT,
  weight_kg NUMERIC(8,3),
  -- Atributos (modelo WooCommerce)
  attributes JSONB DEFAULT '[]',    -- [{name, values[], visible, variation}]
  -- Imagenes
  images JSONB DEFAULT '[]',        -- [{url, alt, sort_order}]
  thumbnail_url TEXT,
  -- Especificaciones tecnicas (tipo FEIN)
  specs JSONB,                      -- {torque_min, torque_max, rpm_min, rpm_max, weight, interface, precision, use, order_number}
  -- SEO
  seo JSONB,                        -- {title, description, keywords, canonical}
  -- Flags
  is_published BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Variaciones (modelo WooCommerce)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  attributes JSONB NOT NULL,        -- {color: "rojo", talla: "M"}
  cost_price NUMERIC(12,4),
  sale_price NUMERIC(12,4),
  stock_qty INT DEFAULT 0,
  image_url TEXT,
  active BOOLEAN DEFAULT true
);

-- Precios especiales por cliente/distribuidor
CREATE TABLE price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('sale','purchase','distributor')),
  currency TEXT,
  company_id UUID REFERENCES companies(id),
  active BOOLEAN DEFAULT true
);

CREATE TABLE price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(12,4),
  discount NUMERIC(5,2),
  min_qty INT DEFAULT 1
);

-- Repuestos (herencia Buscatools)
CREATE TABLE spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),  -- Vinculo al producto padre
  pos TEXT,                         -- Posicion en despiece
  code TEXT,                        -- Codigo FEIN/fabricante
  description TEXT,
  compatible_models TEXT[],
  price_eur NUMERIC(10,2),
  price_usd NUMERIC(10,2),
  image_url TEXT,
  etk_url TEXT                      -- Link al despiece
);

-- Accesorios por modelo
CREATE TABLE product_accessories (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  accessory_id UUID REFERENCES products(id) ON DELETE CASCADE,
  code TEXT,
  pos TEXT,
  price NUMERIC(10,2),
  PRIMARY KEY (product_id, accessory_id)
);
```

#### DOCUMENTOS COMERCIALES (Ventas y Compras)

```sql
-- Tabla unificada de documentos
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  -- Tipo y serie
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'quotation','order','delivery_note','invoice','credit_note',
    'purchase_order','purchase_receipt','purchase_invoice','purchase_credit'
  )),
  reference TEXT NOT NULL,            -- COT-2026-0001, PED-2026-0001, etc.
  series TEXT,                        -- Serie de facturacion
  -- Partes
  client_id UUID REFERENCES clients(id),
  supplier_id UUID REFERENCES suppliers(id),
  contact_id UUID REFERENCES contacts(id),
  -- Datos comerciales
  currency TEXT NOT NULL,
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  payment_terms TEXT,
  payment_method TEXT,
  incoterm TEXT,
  validity_days INT,
  client_po TEXT,                     -- OC del cliente
  client_po_file TEXT,                -- URL del PDF de OC
  -- Totales
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount_total NUMERIC(14,2) DEFAULT 0,
  tax_total NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  -- Estado
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft','sent','accepted','rejected','processing',
    'delivered','invoiced','paid','cancelled','closed'
  )),
  rejection_reason TEXT,
  -- Notas
  public_notes TEXT,                  -- Visibles en PDF
  internal_notes TEXT,                -- Solo internas
  -- Fechas
  doc_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  delivery_date DATE,
  accepted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  -- Vinculacion
  parent_doc_id UUID REFERENCES documents(id),  -- Documento padre
  process_id UUID,                    -- Vinculo al motor de procesos
  -- Firma
  signature_data JSONB,               -- {image_base64, signer_name, signed_at}
  -- Audit
  created_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,             -- Soft delete
  deleted_reason TEXT
);

CREATE TABLE document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,4) NOT NULL,
  cost_price NUMERIC(14,4),           -- Para rentabilidad
  discount_pct NUMERIC(5,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 21,
  subtotal NUMERIC(14,2),
  tax_amount NUMERIC(14,2),
  total NUMERIC(14,2),
  notes TEXT,
  sort_order INT DEFAULT 0
);

-- Vinculacion entre documentos (trazabilidad completa)
CREATE TABLE document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES documents(id),
  child_id UUID NOT NULL REFERENCES documents(id),
  link_type TEXT NOT NULL,            -- generated_from, invoice_for, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Adjuntos
CREATE TABLE document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

#### PROVEEDORES

```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  reference TEXT,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  country TEXT,
  address JSONB,
  contact JSONB,                     -- {name, email, phone, whatsapp}
  payment_terms TEXT,
  currency TEXT DEFAULT 'EUR',
  bank_info JSONB,                   -- {iban, swift, bank_name}
  lead_time_days INT,                -- Tiempo de entrega habitual
  notes TEXT,
  -- Metrics
  total_purchased NUMERIC(14,2) DEFAULT 0,
  total_pending NUMERIC(14,2) DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  -- Portal
  portal_enabled BOOLEAN DEFAULT false,
  portal_user_id UUID,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### STOCK

```sql
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  location TEXT,
  address JSONB,
  is_default BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true
);

CREATE TABLE stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  quantity INT NOT NULL DEFAULT 0,
  reserved INT DEFAULT 0,           -- Reservado por pedidos
  available INT GENERATED ALWAYS AS (quantity - reserved) STORED,
  last_counted_at TIMESTAMPTZ,
  UNIQUE (product_id, variant_id, warehouse_id)
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  type TEXT NOT NULL CHECK (type IN ('in','out','adjustment','transfer_in','transfer_out')),
  quantity INT NOT NULL,
  reference TEXT,                    -- Documento origen
  document_id UUID REFERENCES documents(id),
  reason TEXT,
  cost_price NUMERIC(12,4),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### CRM

```sql
CREATE TABLE crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  -- Pipeline
  stage TEXT DEFAULT 'lead' CHECK (stage IN ('lead','proposal','negotiation','won','lost')),
  probability INT DEFAULT 0,
  -- Valor
  estimated_value NUMERIC(14,2),
  currency TEXT,
  -- Origen
  source TEXT,                       -- phone, email, whatsapp, web, referral, fair, linkedin, visit
  -- Asignacion
  assigned_to UUID REFERENCES users(id),
  product_interest TEXT,             -- Categoria o producto de interes
  urgency TEXT CHECK (urgency IN ('low','medium','high','urgent')),
  -- Fechas
  expected_close DATE,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  -- Notas
  notes TEXT,
  -- Vinculacion
  quotation_id UUID REFERENCES documents(id),
  process_id UUID,
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','task','note','whatsapp')),
  title TEXT,
  description TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Formularios creados en el CRM (tipo HubSpot)
CREATE TABLE crm_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  fields JSONB NOT NULL,             -- [{name, type, label, required, options}]
  settings JSONB,                    -- {redirect_url, notification_emails, auto_assign}
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crm_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES crm_forms(id),
  data JSONB NOT NULL,
  source_url TEXT,
  ip_address TEXT,
  opportunity_id UUID REFERENCES crm_opportunities(id),  -- Auto-creado
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### SAT / MANTENIMIENTO

```sql
-- Activos en clientes (herencia Buscatools)
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL,            -- REF-FEIN-00001
  internal_id TEXT,
  serial_number TEXT,
  product_id UUID REFERENCES products(id),
  model TEXT,
  brand TEXT DEFAULT 'FEIN',
  client_id UUID REFERENCES clients(id),
  location TEXT,                      -- Ciudad, planta, etc.
  -- Garantia
  warranty_start DATE,
  warranty_end DATE,
  -- Contadores
  total_services INT DEFAULT 0,
  last_service_at TIMESTAMPTZ,
  last_service_ref TEXT,
  -- Mantenimiento preventivo
  preventive_interval INT,            -- Cada N aprietes
  current_count INT DEFAULT 0,        -- Aprietes acumulados
  next_preventive_at DATE,
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active','in_service','retired','lost')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Incidencias / Tickets
CREATE TABLE sat_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  reference TEXT NOT NULL,            -- SAT-2026-0001
  -- Partes
  client_id UUID REFERENCES clients(id),
  asset_id UUID REFERENCES assets(id),
  -- Detalles
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'corrective' CHECK (type IN ('preventive','corrective','calibration','inspection')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  -- Asignacion
  assigned_to UUID REFERENCES users(id),
  team_id UUID REFERENCES teams(id),
  -- Estado
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','paused','resolved','closed')),
  pause_reason TEXT,
  pause_snapshot JSONB,               -- Snapshot completo al pausar (herencia Buscatools)
  -- Fechas
  opened_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  -- SLA
  sla_response_hours INT,
  sla_resolution_hours INT,
  -- Vinculacion
  quotation_id UUID REFERENCES documents(id),
  work_order_id UUID,
  process_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ordenes de Trabajo (Workflow 5 pasos - Buscatools)
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES sat_tickets(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  reference TEXT NOT NULL,
  -- Step tracking
  current_step INT DEFAULT 1 CHECK (current_step BETWEEN 1 AND 5),
  steps_completed BOOLEAN[] DEFAULT '{false,false,false,false,false}',
  -- PASO 1: DIAGNOSTICO
  diag_date DATE,
  diag_technician UUID REFERENCES users(id),
  diag_type TEXT CHECK (diag_type IN ('PREVENTIVO','CORRECTIVO')),
  diag_condition TEXT,
  diag_reason TEXT,
  diag_count INT,                     -- N° aprietes
  diag_observations TEXT,
  diag_parts JSONB,                   -- {carcasa: 'OK', tornillos: 'NOK', ...}
  ts_reception TIMESTAMPTZ,
  ts_start_maintenance TIMESTAMPTZ,
  -- PASO 2: COTIZACION
  quot_items JSONB DEFAULT '[]',      -- [{description, type, qty, unit_price, total}]
  quot_currency TEXT DEFAULT 'EUR',
  quot_status TEXT DEFAULT 'PENDIENTE',
  quot_sent_at TIMESTAMPTZ,
  quot_approved_at TIMESTAMPTZ,
  quot_total NUMERIC(12,2),
  -- PASO 3: REPARACION
  rep_date DATE,
  rep_technician UUID REFERENCES users(id),
  rep_estimated_hours NUMERIC(6,2),
  rep_actual_hours NUMERIC(6,2),
  rep_work_done TEXT,
  rep_pending TEXT,
  rep_parts JSONB,                    -- Post-reparacion {carcasa: 'OK', ...}
  -- PASO 4: TORQUE
  torque_lci NUMERIC(10,4),
  torque_nominal NUMERIC(10,4),
  torque_lcs NUMERIC(10,4),
  torque_measurements JSONB,          -- [{min, max, target} x 10]
  torque_stats JSONB,                 -- {avg, stddev, cp, cpk, cv, efficiency, result}
  -- PASO 5: CIERRE
  close_efficiency TEXT,
  close_next_preventive INT,          -- Aprietes para proximo preventivo
  close_status TEXT CHECK (close_status IN ('APROBADA','REPROBADA','EN REVISION')),
  close_observations TEXT,
  close_date DATE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Repuestos usados en OT
CREATE TABLE work_order_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  spare_part_id UUID REFERENCES spare_parts(id),
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity INT DEFAULT 1,
  unit_price NUMERIC(10,2),
  total NUMERIC(10,2)
);

-- Fotos de mantenimiento
CREATE TABLE work_order_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  step INT,                           -- En que paso se tomo
  url TEXT NOT NULL,
  caption TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

#### TESORERIA

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('collection','payment')),  -- Cobro o pago
  document_id UUID REFERENCES documents(id),
  client_id UUID REFERENCES clients(id),
  supplier_id UUID REFERENCES suppliers(id),
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT,
  payment_method TEXT,                -- transferencia, tarjeta, cheque, efectivo
  bank_reference TEXT,
  payment_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','partial','completed','overdue')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bank_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  date DATE,
  description TEXT,
  amount NUMERIC(14,2),
  balance NUMERIC(14,2),
  bank_account TEXT,
  reconciled BOOLEAN DEFAULT false,
  payment_id UUID REFERENCES payments(id),
  imported_at TIMESTAMPTZ DEFAULT now()
);
```

#### COMUNICACIONES

```sql
-- Chat interno
CREATE TABLE chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('direct','group','project','process')),
  process_id UUID,                    -- Chat de proceso
  document_id UUID,                   -- Chat de documento
  members UUID[] DEFAULT '{}',
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',   -- text, system, file
  attachments JSONB DEFAULT '[]',
  mentions UUID[] DEFAULT '{}',
  read_by UUID[] DEFAULT '{}',
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inbox unificado
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','form','marketplace','internal','sms')),
  direction TEXT CHECK (direction IN ('inbound','outbound')),
  -- Partes
  from_address TEXT,
  to_address TEXT,
  from_name TEXT,
  -- Contenido
  subject TEXT,
  body TEXT,
  body_html TEXT,
  attachments JSONB DEFAULT '[]',
  -- Vinculacion
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  opportunity_id UUID REFERENCES crm_opportunities(id),
  document_id UUID REFERENCES documents(id),
  ticket_id UUID REFERENCES sat_tickets(id),
  -- Estado
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread','read','replied','archived')),
  assigned_to UUID REFERENCES users(id),
  -- Externo
  external_id TEXT,                   -- ID del mensaje en Gmail/WhatsApp/etc.
  thread_id TEXT,                     -- Thread de email
  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT now(),
  replied_at TIMESTAMPTZ
);
```

#### MOTOR DE PROCESOS

```sql
CREATE TABLE process_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  stages JSONB NOT NULL,              -- [{name, label, color, order, auto_actions}]
  type TEXT,                          -- lead_to_cash, purchase_to_pay, import, maintenance, etc.
  active BOOLEAN DEFAULT true
);

CREATE TABLE processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES process_definitions(id),
  company_id UUID REFERENCES companies(id),
  reference TEXT,
  title TEXT,
  current_stage TEXT,
  current_stage_color TEXT,           -- green, yellow, red, blue
  -- Vinculacion
  document_id UUID REFERENCES documents(id),
  client_id UUID REFERENCES clients(id),
  opportunity_id UUID REFERENCES crm_opportunities(id),
  ticket_id UUID REFERENCES sat_tickets(id),
  -- Responsable
  owner_id UUID REFERENCES users(id),
  -- Estado
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Data extra
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE process_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID REFERENCES processes(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  changed_by UUID REFERENCES users(id),
  notes TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);
```

#### AUTOMATIZACIONES

```sql
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  -- Trigger
  trigger_type TEXT NOT NULL,         -- event, schedule, webhook, manual
  trigger_config JSONB NOT NULL,      -- {event: 'document.created', conditions: [...]}
  -- Actions
  actions JSONB NOT NULL,             -- [{type: 'send_email', config: {...}}, ...]
  -- Estado
  active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  run_count INT DEFAULT 0,
  -- AI
  uses_ai BOOLEAN DEFAULT false,
  ai_config JSONB,                    -- {model, prompt_template, ...}
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id),
  status TEXT,
  trigger_data JSONB,
  result JSONB,
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### AUDITORIA

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  entity_type TEXT NOT NULL,          -- document, client, product, etc.
  entity_id UUID,
  action TEXT NOT NULL,               -- create, update, delete, view, export
  details JSONB,                      -- {field: 'status', old: 'draft', new: 'sent'}
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configuracion del sistema
CREATE TABLE system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),  -- NULL = global
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, key)
);

-- Notificaciones
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                 -- info, warning, success, error
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,                          -- URL para navegar
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Archivos / Storage index
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INT,
  entity_type TEXT,                   -- document, product, ticket, etc.
  entity_id UUID,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 Row Level Security (RLS)

Todas las tablas tienen RLS activado. Patron general:

```sql
-- Ejemplo: clients solo visibles para usuarios de la misma empresa
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_company_isolation" ON clients
  FOR ALL USING (
    company_id IN (
      SELECT unnest(company_ids) FROM users WHERE id = auth.uid()
    )
  );

-- Ejemplo: portal clients solo ven sus propios datos
CREATE POLICY "clients_portal_self" ON clients
  FOR SELECT USING (
    portal_user_id = auth.uid()
  );
```

### 4.3 Funciones PostgreSQL Clave

```sql
-- Generar referencia secuencial por empresa y tipo
CREATE FUNCTION generate_reference(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  year TEXT;
  seq INT;
BEGIN
  prefix := CASE p_type
    WHEN 'quotation' THEN 'COT'
    WHEN 'order' THEN 'PED'
    WHEN 'delivery_note' THEN 'ALB'
    WHEN 'invoice' THEN 'FAC'
    WHEN 'purchase_order' THEN 'OC'
    WHEN 'ticket' THEN 'SAT'
    ELSE UPPER(LEFT(p_type, 3))
  END;
  year := EXTRACT(YEAR FROM now())::TEXT;
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(reference, '[^0-9]', '', 'g'), '')::INT
  ), 0) + 1 INTO seq
  FROM documents
  WHERE company_id = p_company_id
    AND doc_type = p_type
    AND reference LIKE prefix || '-' || year || '-%';
  RETURN prefix || '-' || year || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Recalcular totales de documento
CREATE FUNCTION recalc_document_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents SET
    subtotal = (SELECT COALESCE(SUM(subtotal), 0) FROM document_lines WHERE document_id = NEW.document_id),
    tax_total = (SELECT COALESCE(SUM(tax_amount), 0) FROM document_lines WHERE document_id = NEW.document_id),
    total = (SELECT COALESCE(SUM(total), 0) FROM document_lines WHERE document_id = NEW.document_id),
    updated_at = now()
  WHERE id = NEW.document_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_totals
  AFTER INSERT OR UPDATE OR DELETE ON document_lines
  FOR EACH ROW EXECUTE FUNCTION recalc_document_totals();
```

---

## 5. MULTI-TENANT

### 5.1 Modelo de Aislamiento
- **Nivel de aislamiento:** Por empresa (company_id) en las mismas tablas
- **RLS:** Todas las tablas con datos de negocio tienen RLS por company_id
- **Datos compartidos:** Productos, marcas, categorias son globales (cross-company)
- **Datos aislados:** Clientes, documentos, oportunidades, tickets, pagos son por empresa

### 5.2 Selector de Empresa
- Topbar muestra selector de empresa activa
- Al cambiar, se actualiza `default_company_id` del usuario
- Zustand store `company-store` propaga el cambio a todos los componentes
- Todas las queries filtran por `company_id` via RLS

### 5.3 Vista Multi-Empresa (Admin)
- Admin puede activar "Vista todas las empresas"
- Agrega columna "Empresa" en todas las tablas
- Informes consolidados cross-empresa

---

## 6. RBAC (Permisos)

### 6.1 Permisos Granulares (41+)

| Modulo | Permisos |
|--------|----------|
| ventas | ventas.view, ventas.create, ventas.edit, ventas.delete, ventas.approve, ventas.invoice |
| compras | compras.view, compras.create, compras.edit, compras.delete, compras.approve |
| stock | stock.view, stock.adjust, stock.transfer, stock.import |
| catalogo | catalogo.view, catalogo.create, catalogo.edit, catalogo.delete, catalogo.import, catalogo.pricing |
| crm | crm.view, crm.create, crm.edit, crm.assign, crm.forms |
| sat | sat.view, sat.create, sat.edit, sat.assign, sat.close |
| finanzas | finanzas.view, finanzas.cobros, finanzas.pagos, finanzas.conciliar |
| informes | informes.view, informes.export, informes.advanced |
| admin | admin.users, admin.roles, admin.companies, admin.config, admin.audit |
| comunicaciones | comm.chat, comm.inbox, comm.email, comm.whatsapp |
| portal | portal.manage, portal.config |

### 6.2 Roles Predefinidos (25)

| Rol | Categoria | Permisos clave |
|-----|-----------|----------------|
| super_admin | internal | Todos |
| admin | internal | Todo excepto system config |
| director_comercial | internal | ventas.*, crm.*, informes.* |
| vendedor | internal | ventas.view/create, crm.*, catalogo.view |
| jefe_compras | internal | compras.*, stock.view |
| comprador | internal | compras.view/create |
| tecnico_sat | internal | sat.*, stock.view |
| jefe_sat | internal | sat.*, stock.adjust |
| almacenero | internal | stock.* |
| contable | internal | finanzas.*, informes.* |
| viewer | internal | *.view |
| cliente_portal | external_client | portal basico |
| distribuidor_portal | external_distributor | portal + precios mayoristas |
| proveedor_portal | external_supplier | portal proveedor |

---

## 7. INTERFACES VISUALES (3 Modos)

### 7.1 Modo "StelOrder" (Clasico)
- Replica visual del panel de StelOrder
- Sidebar con iconos + texto, colores neutros
- Tablas densas, formato tradicional ERP
- Ideal para usuarios que vienen de StelOrder

### 7.2 Modo "Hoja Tecnica" (Buscatools)
- Estilo visual identico al de Buscatools Mantenimiento
- Tema oscuro (#0A0C0F base)
- Palette naranja/verde/amber/rojo/azul/purpura
- Fuente DM Sans
- Sidebar 244px
- Workflow de pasos con colores semanticos
- Optimizado para tecnico de campo

### 7.3 Modo "Avanzado" (Moderno)
- Diseno moderno, widgets modulares
- Dashboard tipo Grafana (drag & drop)
- Cards con sombras, gradientes sutiles
- Animaciones fluidas
- Dark mode / Light mode toggle
- Optimizado para productividad

### 7.4 Implementacion Tecnica
```typescript
// Zustand store para modo visual
interface UIStore {
  mode: 'stelorder' | 'buscatools' | 'advanced'
  theme: 'dark' | 'light'
  sidebarOpen: boolean
  setMode: (mode: UIStore['mode']) => void
  toggleTheme: () => void
}

// CSS Variables se intercambian segun modo
// Cada modo tiene su propio archivo de variables
// El componente Shell carga el layout correspondiente
```

---

## 8. DASHBOARD CONFIGURABLE

### 8.1 Widgets Disponibles

| Widget | Datos | Tamano |
|--------|-------|--------|
| KPI Card | Numero + variacion % | 1x1 |
| Pipeline CRM | Barras por etapa | 2x1 |
| Ventas del Periodo | Grafico linea/barra | 2x2 |
| Acciones Rapidas | Botones directos | 1x1 |
| Actividad Reciente | Timeline | 1x2 |
| Alertas | Stock bajo, vencidas, etc. | 1x1 |
| Entregas en Curso | Progreso pedidos | 2x1 |
| Calendario Pagos | Mini calendario | 2x2 |
| Top Clientes | Ranking | 1x2 |
| Tickets Abiertos | Conteo por prioridad | 1x1 |
| Inbox | Ultimos mensajes | 2x1 |
| Procesos Activos | Estado procesos | 2x1 |
| Chat Reciente | Ultimos mensajes | 1x2 |
| Mapa Stock | Stock por almacen | 2x1 |
| Rentabilidad | Margen por producto | 2x2 |

### 8.2 Implementacion
```typescript
// react-grid-layout para drag & drop
// Cada widget es un componente React independiente
// Layout se guarda en users.preferences.dashboard_layout por usuario
// Admin tiene dashboard global ("ojo de aguila") con metricas cross-empresa
```

### 8.3 Dashboards por Rol
- Cada rol tiene un dashboard por defecto
- El usuario puede personalizar su dashboard
- Admin puede crear y asignar dashboards predefinidos

---

## 9. MODULO CRM

### 9.1 Funcionalidades
1. **Pipeline Kanban** — 5 columnas arrastrables (Lead → Propuesta → Negociacion → Ganado → Perdido)
2. **Auto-asignacion** — Por especialidad del vendedor segun producto de interes
3. **Formularios embebibles** — Constructor visual tipo HubSpot, genera URL publica
4. **Fuentes de leads** — Formularios, WhatsApp, Gmail, landing pages, publicidad, importacion
5. **Actividades** — Llamadas, emails, reuniones, tareas, notas, WhatsApp
6. **Recordatorios automaticos** — Notificacion push + email cuando caduca seguimiento
7. **Scoring de leads** — Puntuacion automatica basada en actividad, valor, urgencia
8. **Conversion** — Lead → Cotizacion con un click
9. **Historial completo** — Timeline de todas las interacciones por oportunidad/cliente
10. **Notas internas** — Rich text editor con mencion de usuarios

### 9.2 Automatizaciones CRM
- Lead inactivo > 7 dias → notificacion al vendedor
- Cotizacion enviada > 3 dias sin respuesta → recordatorio
- Lead ganado → crear pedido automaticamente
- Lead perdido → encuesta de motivo + mover a nurturing

---

## 10. MODULO CATALOGO / PRODUCTOS

### 10.1 Modelo Tipo WooCommerce
- **Atributos ilimitados** — Color, talla, material, voltaje, etc. Cada uno con valores multiples
- **Variaciones** — Combinaciones de atributos con precio/stock propio
- **Categorias jerarquicas** — Arbol ilimitado (herramientas → torquimetros → electricos → FEIN ASM)
- **SEO completo** — Title, description, keywords, slug, canonical por producto
- **Imagenes multiples** — Galeria con drag & drop, thumbnail auto
- **Stock por deposito** — Cantidad por almacen (Madrid, Buenos Aires, Miami)
- **Precios por rol** — PVP, distribuidor, costo, minimo. Listas de precios por cliente

### 10.2 Import/Export Masivo (Identico a WooCommerce)
```
Formatos soportados:
- CSV (separado por comas o punto y coma)
- XLSX (Excel)
- JSON

Operaciones:
- Importar productos nuevos
- Actualizar productos existentes (match por SKU)
- Importar/actualizar variaciones
- Importar categorias
- Importar imagenes (por URL)
- Exportar catalogo completo
- Exportar por filtro (categoria, marca, etc.)
- Formato StelOrder (autodeteccion + mapeo)
- Formato WooCommerce (compatible directo)

Proceso de importacion:
1. Subir archivo
2. Mapeo de columnas (drag & drop)
3. Preview con validacion
4. Confirmacion
5. Ejecucion en background con log de errores
```

### 10.3 Filtros Facetados (Busqueda)
- Categoria / Subcategoria (con conteo)
- Marca (con conteo)
- Serie
- Rango de precio
- Rango de torque (Nm)
- Rango de RPM
- Rango de peso (kg)
- Encastre
- En stock / Sin stock
- Busqueda full-text

---

## 11. MODULO VENTAS

### 11.1 Flujo Completo (10 Pasos)

```
1. Lead (CRM)
   ↓
2. Cotizacion / Presupuesto
   ↓ [enviar → aceptar/rechazar]
3. OC del cliente (registro + PDF adjunto)
   ↓
4. Pedido de venta
   ↓ [aprobacion interna si > monto X]
5. Pedido a proveedor (si no hay stock)
   ↓
6. Recepcion (parcial o total)
   ↓
7. Albaran / Remito (uno o varios)
   ↓
8. Factura (antes o despues del albaran)
   ↓
9. Cobro (parcial o total)
   ↓
10. Cierre
```

### 11.2 Cada Paso Tiene
- Estado visual con color (draft=gris, sent=azul, accepted=verde, rejected=rojo)
- Responsable asignado
- Notificaciones automaticas
- Adjuntos (PDF OC, remitos firmados, etc.)
- Timestamps de cada transicion
- Notas internas y publicas
- Boton de pausa con motivo
- Historial de cambios

### 11.3 Tabs del Documento
1. **Lineas** — Productos, cantidades, precios, descuentos, subtotales
2. **Rentabilidad** — Margen por linea (venta vs costo)
3. **Mas info** — Notas, incoterm, forma de pago, validez, condiciones
4. **Adjuntos** — Archivos subidos
5. **Firma** — Area de firma digital
6. **Relacionados** — Documentos padre/hijo
7. **Chat** — Hilo de chat interno del proceso

### 11.4 Generacion de PDF
- Nombre automatico: `FECHA-REF-EMPRESA-CLIENTE-MONEDA_MONTO[-OC]`
- Header con datos de empresa y cliente
- Tabla profesional con totales
- IVA automatico por pais (ES→ES=21%, ES→otro=0%)
- Plantillas configurables por empresa

---

## 12. MODULO COMPRAS

### 12.1 Flujo Completo

```
1. Solicitud de compra (interna)
   ↓ [aprobacion]
2. Seleccion de proveedor
   ↓
3. Orden de compra
   ↓ [enviar al proveedor]
4. Confirmacion del proveedor
   ↓
5. Seguimiento de importacion (si aplica)
   ↓
6. Recepcion (parcial o total + ajuste stock)
   ↓
7. Factura del proveedor (match con OC)
   ↓
8. Programacion de pago
   ↓
9. Pago
   ↓
10. Cierre
```

### 12.2 Funcionalidades
- **Proveedores** — Vista tarjeta/tabla con 23 columnas configurables
- **Calendario de pagos** — Vista 30 dias con facturas pendientes
- **Conciliacion automatica** — Match factura proveedor con OC
- **Alertas de vencimiento** — Notificacion cuando se acerca fecha de pago
- **Intercompany** — Compras entre empresas del grupo
- **Recepcion parcial** — Registrar recepcion de N de M unidades
- **Abonos** — Facturas de abono de proveedor

---

## 13. MODULO STOCK

### 13.1 Funcionalidades
- **Multi-almacen** — Madrid, Buenos Aires, Miami (o mas)
- **Stock real vs virtual** — Real (fisico) vs Virtual (disponible tras reservas)
- **Movimientos** — Entrada, salida, ajuste, traspaso (con badges de color)
- **Traspasos** — Formulario entre almacenes (genera 2 movimientos)
- **Alertas de stock bajo** — Notificacion cuando qty < stock_min
- **Ajuste masivo** — Import CSV para actualizar stock
- **Valoracion de inventario** — Por costo promedio, FIFO, ultimo costo
- **Reservas automaticas** — Al confirmar pedido, reserva stock

---

## 14. MODULO SAT / MANTENIMIENTO

### 14.1 Incidencias (Tickets)
- Crear con prioridad (baja/media/alta/urgente)
- Asignar tecnico (con notificacion push)
- Pipeline visual (Abierto → En progreso → Esperando → Resuelto → Cerrado)
- SLA configurable (horas de respuesta, horas de resolucion)
- Notificaciones al cliente (configurables, desactivadas por defecto)

### 14.2 Workflow de 5 Pasos (Herencia Buscatools)
Identico al de Buscatools Mantenimiento pero integrado en Supabase:

1. **DIAGNOSTICO** (naranja) — Seleccion activo, specs tecnicas, historial, grid 8 partes OK/NOK/N/A
2. **COTIZACION** (amber) — Tabla editable, picker de repuestos, multi-moneda, envio email
3. **REPARACION** (teal) — Trabajos realizados, grid post-reparacion, tiempo
4. **TORQUE** (verde) — 10 mediciones, calculos Cp/Cpk/CV/eficiencia, resultado CAPAZ/REVISAR
5. **CIERRE** (purpura) — Resumen, estado final, firma digital, guardar en historico

### 14.3 Pausar/Reanudar
- 5 motivos predefinidos + texto libre
- Snapshot completo del formulario
- Banner visual al reabrir
- Lista de fichas pausadas con badges

### 14.4 Activos en Clientes
- Referencia, ID, serie, modelo, marca, cliente, ubicacion
- Historial completo de servicios
- Contadores (aprietes)
- Programacion de preventivos
- Garantia

### 14.5 Mantenimientos Preventivos (Tareas Automaticas)
- Programacion por intervalo (tiempo o conteo)
- Generacion automatica de tickets
- Notificacion al tecnico y al cliente
- Agenda tipo calendario con drag & drop

---

## 15. MODULO FACTURACION Y TESORERIA

### 15.1 Tipos de Factura
- **Factura de venta** — Desde albaran o pedido
- **Factura proforma** — Valor comercial, sin efecto fiscal
- **Factura de abono** — Rectificativa
- **Factura recurrente** — Suscripciones con periodo configurable
- **Factura de compra** — Registrada manualmente o via OCR

### 15.2 Facturacion Electronica
- **Espana:** Verifactu, TicketBAI, Factura-E v3.2.2
- **Argentina:** AFIP WebService (en futuro)
- **USA:** Invoice PDF estandar

### 15.3 Tesoreria
- **Cobros** — Registrar cobros contra facturas, parciales o totales
- **Pagos** — Programar y ejecutar pagos a proveedores
- **Conciliacion bancaria** — Importar extracto + match automatico
- **Pagos online** — Stripe / MercadoPago integrado en documentos
- **Remesas SEPA** — Para cobros domiciliados (Espana)

---

## 16. MODULO CLIENTES

### 16.1 Vistas
- **Tabla** con 28 columnas configurables
- **Tarjetas** con datos clave
- **Favoritos** — Clientes marcados
- **Ranking** — Por facturacion, actividad, potencial
- **Potenciales** — Leads no convertidos

### 16.2 Ficha de Cliente (Tabs)
1. **Datos** — Info fiscal, contacto, condiciones comerciales
2. **Contactos** — Personas de contacto con roles
3. **OC Recibidas** — Glosario de ordenes de compra del cliente
4. **Historial** — Timeline de todas las interacciones
5. **Documentos** — Cotizaciones, pedidos, facturas, albaranes
6. **Comunicaciones** — Emails, WhatsApp, chats
7. **Activos** — Equipos en mantenimiento
8. **Metricas** — KPIs del cliente (facturado, pendiente, margen, actividad)

---

## 17. MODULO INFORMES

### 17.1 Reportes Disponibles

| Reporte | Contenido |
|---------|-----------|
| Resumen | KPIs principales: ventas, compras, resultado, pendientes |
| Resultados | Por cliente o tipo documento: ventas, compras, resultado |
| Facturacion | Por cliente: facturado, cobrado, pendiente |
| Tesoreria | Flujo de caja: cobrado vs pendiente, pagado vs pendiente |
| Ventas | Desglose: presupuestos, pedidos, albaranes, facturas |
| Rentabilidad | Por producto o cliente: venta, costo, beneficio, margen % |
| Stock | Valoracion inventario: cantidad, valor venta, valor costo |
| CRM | Pipeline, conversion, tiempo promedio de cierre |
| SAT | Tickets por prioridad, tiempos de resolucion, tecnico |
| Compras | Por proveedor, producto, periodo |
| Impuestos | IVA repercutido vs soportado |

### 17.2 Funcionalidades
- Filtro por periodo (mes, trimestre, semestre, ano, custom)
- Filtro por empresa
- Export PDF, CSV, Excel
- Programar envio automatico (semanal, mensual)
- Dashboards de informe guardables

---

## 18. MODULO COMUNICACIONES

### 18.1 Chat Interno
- Mensajes directos entre usuarios
- Grupos por proyecto/equipo
- Chat por proceso (cada venta, compra, ticket tiene su hilo)
- Menciones con @usuario
- Adjuntos (drag & drop)
- Indicador de leido
- Real-time via Supabase Realtime
- Busqueda en historial

### 18.2 Inbox Unificado
- **Gmail** — Sincronizacion bidireccional (por usuario, OAuth2)
- **WhatsApp** — Enviar/recibir via WhatsApp Business Cloud API
- **Formularios** — Submissions de formularios CRM
- **Marketplaces** — Mensajes de MercadoLibre, Amazon
- **Tickets** — Notificaciones de SAT
- Vista unificada con filtros por canal
- Asignacion a usuario
- Vinculacion automatica a cliente/oportunidad
- Templates de respuesta rapida

### 18.3 Reglas
- Cada usuario ve solo sus conversaciones
- Admin ve todo
- Auto-assign segun reglas configurables

---

## 19. MODULO E-COMMERCE (Shop)

### 19.1 Tienda Online
- Catalogo publico con filtros facetados
- Paginas de producto con galeria, specs, variaciones
- Carrito de compras
- Checkout con pago online (Stripe/MercadoPago)
- Pedidos automaticos al sistema
- SEO optimizado (Next.js SSR)
- Responsive (mobile-first)

### 19.2 Portal de Cliente (STEL Shop equivalente)
- Login del cliente
- Ver y descargar facturas historicas
- Realizar pedidos desde catalogo
- Reportar incidencias tecnicas
- Ver seguimiento de pedidos
- Ver activos en mantenimiento

---

## 20. PORTALES EXTERNOS

### 20.1 Portal Cliente
- Acceso: email + password (Supabase Auth)
- Ve: pedidos, facturas, seguimiento, incidencias, activos
- Puede: hacer pedidos, descargar PDFs, abrir tickets

### 20.2 Portal Distribuidor
- Todo lo del cliente +
- Precios mayoristas (tarifa distribuidor)
- Stock disponible en tiempo real
- OC directas al sistema
- Descuentos configurables
- Historial de compras

### 20.3 Portal Proveedor
- Ve: OC recibidas, entregas pendientes
- Puede: confirmar OC, informar despacho, subir factura

---

## 21. INTEGRACIONES EXTERNAS

### 21.1 Gmail (por usuario)
```
- OAuth2 individual: cada usuario conecta su Gmail
- Sincronizacion bidireccional de emails
- Envio de documentos directamente desde el sistema
- Vinculacion automatica de emails a clientes/oportunidades
- Templates de email por tipo de documento
```

### 21.2 WhatsApp Business
```
- WhatsApp Business Cloud API (Meta)
- Enviar mensajes desde el sistema
- Recibir mensajes via webhook
- Templates aprobados por Meta
- Vinculacion a cliente/ticket
- Archivos adjuntos
```

### 21.3 Marketplaces
```
MercadoLibre:
- Publicar productos
- Sincronizar stock
- Recibir pedidos → crear pedido en sistema
- Responder preguntas
- Gestionar envios

Amazon (SP-API):
- Sincronizar catalogo
- Recibir ordenes
- Actualizar stock

eBay:
- Similar a Amazon

Alibaba:
- Busqueda de proveedores
- Cotizaciones
```

### 21.4 WooCommerce / WordPress
```
- Sincronizacion bidireccional de productos
- Sincronizacion de stock
- Recibir pedidos → crear pedido en sistema
- Actualizar precios
- Import/export formato WooCommerce
```

### 21.5 APIs de IA
```
OpenAI (GPT-4o):
- Clasificacion de leads
- Generacion de descripciones de producto
- Analisis de emails
- Sugerencias comerciales

Anthropic (Claude):
- Analisis de documentos
- Generacion de reportes

Google Gemini:
- OCR de facturas de compra
- Procesamiento de imagenes
```

---

## 22. MOTOR DE PROCESOS (BPM)

### 22.1 Tipos de Proceso

| Proceso | Etapas |
|---------|--------|
| Lead to Cash | Captura → Calificacion → Cotizacion → Envio → Negociacion → Pedido → Entrega → Factura → Cobro → Cierre |
| Purchase to Pay | Solicitud → Seleccion → OC → Confirmacion → Transito → Recepcion → Factura → Pago programado → Pago → Cierre |
| Import Operation | Proforma → Booking → Aduana export → Transito → Puerto → Aduana import → Almacen → Costos → Cierre |
| Maintenance (SAT) | Diagnostico → Cotizacion → Reparacion → Torque → Cierre |
| Collection | Factura → Recordatorio 1 → Recordatorio 2 → Negociacion → Pago parcial → Pago completo → Cierre |
| Production | Planificacion → Materiales → Produccion → Calidad → Listo entrega → Cierre |
| Internal Request | Solicitud → Revision → Aprobacion → Ejecucion → Cierre |

### 22.2 Funcionalidades
- Cada proceso tiene chat interno
- Colores de semaforo (verde/amarillo/rojo/azul)
- Transiciones automaticas al completar condiciones
- Notificaciones al cambiar de etapa
- Timeline visual con timestamps
- Dashboard de procesos activos

---

## 23. SISTEMA DE AUTOMATIZACION E IA

### 23.1 Motor de Automatizaciones (tipo Zapier interno)

```
Triggers disponibles:
- document.created / updated / status_changed
- opportunity.stage_changed
- ticket.created / assigned / closed
- payment.received
- stock.below_minimum
- schedule (cron)
- webhook (externo)
- email.received
- whatsapp.received
- form.submitted

Acciones disponibles:
- send_email (template)
- send_whatsapp (template)
- create_document (cotizacion, pedido, etc.)
- create_ticket
- assign_user
- update_field
- create_notification
- run_ai_agent
- call_webhook
- create_task
- move_process_stage
```

### 23.2 Agentes de IA

| Agente | Funcion |
|--------|---------|
| Lead Classifier | Clasifica leads por probabilidad de cierre |
| Email Analyzer | Extrae datos clave de emails (OC, consultas, reclamos) |
| Price Optimizer | Sugiere precios basados en historial y competencia |
| Follow-up Agent | Detecta oportunidades sin seguimiento y sugiere acciones |
| Error Detector | Detecta inconsistencias en datos (stock negativo, precios incorrectos) |
| Report Generator | Genera resumen ejecutivo semanal |
| OCR Invoice | Procesa facturas de compra en PDF/imagen |
| Chat Assistant | Bot de respuesta rapida para portal de clientes |
| Inventory Predictor | Predice necesidades de stock basado en historico |
| Process Advisor | Sugiere siguiente paso en cada proceso |

### 23.3 Implementacion
```typescript
// Edge Function que procesa agentes
// Cada agente tiene: prompt_template, model, input_schema, output_schema
// Se ejecuta via Inngest/Trigger.dev para no bloquear
// Resultados se guardan en automation_logs
// El usuario ve sugerencias en el dashboard o como notificaciones
```

---

## 24. MODULO ADMINISTRACION

### 24.1 Secciones

| Seccion | Contenido |
|---------|-----------|
| Usuarios | ABM + roles RBAC + empresas + especialidades |
| Roles | 25 roles + 41 permisos + matriz editable |
| Empresas | Config fiscal, IVA, margen, series, logo |
| Parametros | Config clave-valor del sistema |
| Almacenes | ABM de almacenes |
| Auditoria | Log de todas las acciones |
| Automatizaciones | Configurar reglas y agentes IA |
| Integraciones | Conectar Gmail, WhatsApp, marketplaces |
| Plantillas | Plantillas de email y documentos |
| Backups | Export/import JSON completo |

---

## 25. API REST

### 25.1 Endpoints Principales

```
AUTH
  POST   /api/auth/login
  POST   /api/auth/register
  POST   /api/auth/logout
  POST   /api/auth/refresh

CLIENTES
  GET    /api/clients
  POST   /api/clients
  GET    /api/clients/:id
  PUT    /api/clients/:id
  DELETE /api/clients/:id

PRODUCTOS
  GET    /api/products
  POST   /api/products
  GET    /api/products/:id
  PUT    /api/products/:id
  DELETE /api/products/:id
  POST   /api/products/import
  GET    /api/products/export

DOCUMENTOS
  GET    /api/documents?type=quotation
  POST   /api/documents
  GET    /api/documents/:id
  PUT    /api/documents/:id
  POST   /api/documents/:id/generate-child  (ej: cotizacion → pedido)
  POST   /api/documents/:id/send
  GET    /api/documents/:id/pdf

CRM
  GET    /api/crm/opportunities
  POST   /api/crm/opportunities
  PUT    /api/crm/opportunities/:id
  GET    /api/crm/activities
  POST   /api/crm/activities

SAT
  GET    /api/sat/tickets
  POST   /api/sat/tickets
  GET    /api/sat/work-orders/:id
  PUT    /api/sat/work-orders/:id/step

STOCK
  GET    /api/stock/levels
  POST   /api/stock/movements
  POST   /api/stock/transfers

INTEGRACIONES
  POST   /api/integrations/gmail/connect
  POST   /api/integrations/whatsapp/send
  POST   /api/integrations/mercadolibre/sync

WEBHOOKS (entrada)
  POST   /api/webhooks/whatsapp
  POST   /api/webhooks/mercadolibre
  POST   /api/webhooks/stripe
  POST   /api/webhooks/woocommerce

PORTAL PUBLICO
  GET    /api/public/products
  POST   /api/public/orders
  GET    /api/public/tracking/:ref
```

---

## 26. SEGURIDAD

### 26.1 Medidas
- **Autenticacion:** Supabase Auth (JWT, refresh tokens)
- **Autorizacion:** RBAC + RLS a nivel de base de datos
- **Encriptacion:** HTTPS obligatorio, datos sensibles encriptados en DB
- **CSRF:** Proteccion via Supabase + Next.js
- **Rate limiting:** En API routes y Edge Functions
- **Audit log:** Toda accion queda registrada
- **2FA:** Opcional para admins (TOTP)
- **Sesiones:** Timeout configurable, revocacion remota
- **Backups:** Automaticos diarios via Supabase
- **CORS:** Configurado solo para dominios propios

---

## 27. INFRAESTRUCTURA Y DEPLOY

### 27.1 Ambientes
```
DEV:     localhost:3000 + Supabase local (Docker)
STAGING: staging.mocciaro-soft.com + Supabase proyecto staging
PROD:    app.mocciaro-soft.com + Supabase proyecto produccion
```

### 27.2 CI/CD (GitHub Actions)
```yaml
# Push a main → deploy a staging
# Tag v*.*.* → deploy a production
# PR → preview deploy en Vercel
# Tests → Jest + Playwright antes de deploy
```

### 27.3 Monitoring
- **Sentry** — Errores frontend y backend
- **Vercel Analytics** — Performance, Core Web Vitals
- **Supabase Dashboard** — Queries, storage, auth metrics
- **Custom** — Dashboard de health checks

---

## 28. PLAN DE MIGRACION

### 28.1 Desde StelOrder
```
1. Exportar CSV de StelOrder:
   - Clientes
   - Proveedores
   - Productos (con precios y stock)
   - Documentos (presupuestos, pedidos, facturas)
   - Incidencias SAT
   - Cobros y pagos

2. Script de migracion (scripts/migrate-stelorder.ts):
   - Mapeo de campos StelOrder → Mocciaro Soft
   - Preservar IDs de referencia para trazabilidad
   - Importar en orden de dependencias
   - Validar integridad post-migracion

3. Periodo de convivencia:
   - 2-4 semanas usando ambos sistemas en paralelo
   - Verificar que todos los datos son correctos
   - Capacitacion de usuarios
```

### 28.2 Desde Buscatools Mantenimiento
```
1. Exportar backup JSON de localStorage
2. Mapear activos, clientes, historico a tablas Supabase
3. Migrar 330 activos base
4. Migrar registros de servicio al historico
5. Verificar integridad de datos de torque
```

---

## 29. ROADMAP DE IMPLEMENTACION

### Fase 1 — Fundamentos (Semanas 1-4)
- [x] Setup Next.js + Supabase + Tailwind
- [ ] Auth (login, registro, RBAC)
- [ ] Multi-empresa
- [ ] Shell (sidebar, topbar, 3 modos visuales)
- [ ] Dashboard configurable
- [ ] Catalogo de productos
- [ ] Clientes

### Fase 2 — Core Business (Semanas 5-10)
- [ ] CRM Pipeline
- [ ] Ventas (cotizacion → pedido → albaran → factura → cobro)
- [ ] Compras (proveedor → OC → recepcion → factura → pago)
- [ ] Stock (multi-almacen, movimientos, traspasos)
- [ ] Motor de procesos

### Fase 3 — SAT + Comunicaciones (Semanas 11-14)
- [ ] Tickets / Incidencias
- [ ] Workflow de 5 pasos (Buscatools)
- [ ] Activos y mantenimiento preventivo
- [ ] Chat interno
- [ ] Inbox unificado

### Fase 4 — Integraciones (Semanas 15-18)
- [ ] Gmail API (por usuario)
- [ ] WhatsApp Business API
- [ ] WooCommerce sync
- [ ] MercadoLibre sync
- [ ] Facturacion electronica (Verifactu)

### Fase 5 — Portales + E-commerce (Semanas 19-22)
- [ ] Portal de clientes
- [ ] Portal de distribuidores
- [ ] Tienda online (Shop)
- [ ] Pagos online (Stripe/MercadoPago)

### Fase 6 — IA + Automatizacion (Semanas 23-26)
- [ ] Motor de automatizaciones
- [ ] Agentes de IA
- [ ] OCR facturas
- [ ] Reportes automaticos
- [ ] Scoring de leads

### Fase 7 — Polish + Migracion (Semanas 27-30)
- [ ] Informes avanzados
- [ ] Import/export masivo
- [ ] Migracion StelOrder
- [ ] Migracion Buscatools
- [ ] Testing completo
- [ ] Go-live

---

## RESUMEN DE TABLAS

| Tabla | Descripcion | Registros estimados |
|-------|-------------|--------------------:|
| companies | Empresas del grupo | 4 |
| users | Usuarios internos | 20+ |
| roles | Roles RBAC | 25 |
| permissions | Permisos granulares | 41+ |
| clients | Clientes | 3,000+ |
| contacts | Contactos de clientes | 5,000+ |
| suppliers | Proveedores | 100+ |
| products | Catalogo | 30,000+ |
| product_variants | Variaciones | 50,000+ |
| categories | Categorias | 200+ |
| brands | Marcas | 50+ |
| documents | Documentos comerciales | 10,000+ |
| document_lines | Lineas de documentos | 50,000+ |
| stock_levels | Niveles de stock | 90,000+ (prod x almacen) |
| stock_movements | Movimientos | 100,000+ |
| crm_opportunities | Oportunidades | 5,000+ |
| sat_tickets | Tickets SAT | 2,000+ |
| work_orders | Ordenes de trabajo | 1,000+ |
| assets | Activos en clientes | 500+ |
| payments | Cobros y pagos | 5,000+ |
| chat_messages | Mensajes chat | 100,000+ |
| inbox_messages | Mensajes inbox | 50,000+ |
| processes | Instancias de procesos | 10,000+ |
| automations | Reglas de automatizacion | 50+ |
| audit_log | Log de auditoria | 1,000,000+ |
| notifications | Notificaciones | 100,000+ |

---

> **Este blueprint cubre la totalidad de los requerimientos solicitados.**
> **Listo para que un equipo de desarrollo comience la implementacion.**
