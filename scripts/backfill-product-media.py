#!/usr/bin/env python3
"""
Backfill tt_product_media desde los image_url ya existentes en tt_products.

Para cada producto con image_url no nulo que todavia no tenga un media
kind='photo' is_primary=true, inserta una fila en tt_product_media.

Idempotente: si corre dos veces, no duplica.

Requisitos:
  - Migracion v46 ya aplicada (tabla tt_product_media + columnas diagram_url,
    gallery_urls en tt_products).

Uso:
  python3 scripts/backfill-product-media.py
  python3 scripts/backfill-product-media.py --dry-run
"""
import argparse
import sys
import urllib.parse
import urllib.request
import json

SUPABASE_URL = "https://wsjfbchxspylslosdleb.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzamZiY2h4c3B5bHNsb3NkbGViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTg0OTE5MywiZXhwIjoyMDkxNDI1MTkzfQ."
    "TRoZLPI1Bb9xK36t-kdLpefi5Z4ERYc4LrTE144MM0g"
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def req(method, path, body=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = None
    h = dict(HEADERS)
    if extra_headers:
        h.update(extra_headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def fetch_products_with_image(page, page_size):
    """Trae productos con image_url no nulo. Usa Range header para paginar."""
    start = page * page_size
    end = start + page_size - 1
    path = (
        "tt_products?image_url=not.is.null&active=eq.true"
        "&select=id,sku,image_url"
    )
    status, body = req(
        "GET",
        path,
        extra_headers={
            "Range-Unit": "items",
            "Range": f"{start}-{end}",
            "Prefer": "count=exact",
        },
    )
    if status not in (200, 206):
        print(f"  ⚠ fetch error status={status}: {body[:200]}")
        return []
    return json.loads(body)


def fetch_existing_primary_photo_ids():
    """Devuelve set de product_id que ya tienen un photo primary en tt_product_media."""
    existing = set()
    page_size = 1000
    offset = 0
    while True:
        status, body = req(
            "GET",
            f"tt_product_media?kind=eq.photo&is_primary=eq.true&select=product_id",
            extra_headers={
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + page_size - 1}",
            },
        )
        if status not in (200, 206):
            # Si la tabla no existe todavia, devolver vacio
            if status == 404 or "relation" in body:
                print(
                    "  ❌ La tabla tt_product_media no existe. "
                    "Ejecuta primero la migracion v46."
                )
                sys.exit(1)
            break
        rows = json.loads(body)
        if not rows:
            break
        for r in rows:
            existing.add(r["product_id"])
        if len(rows) < page_size:
            break
        offset += page_size
    return existing


def insert_media_batch(rows):
    status, body = req("POST", "tt_product_media", body=rows)
    if status not in (200, 201):
        print(f"  ⚠ insert error status={status}: {body[:300]}")
        return 0
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="solo contar, no insertar")
    ap.add_argument("--batch-size", type=int, default=100)
    args = ap.parse_args()

    print("🔎 Relevando productos con image_url ya cargado...")
    already = fetch_existing_primary_photo_ids()
    print(f"   → {len(already)} productos ya tienen photo primary en tt_product_media")

    page = 0
    page_size = 500
    total_seen = 0
    total_to_insert = 0
    pending_batch = []
    inserted = 0

    while True:
        products = fetch_products_with_image(page, page_size)
        if not products:
            break
        total_seen += len(products)
        for p in products:
            if p["id"] in already:
                continue
            if not p.get("image_url"):
                continue
            total_to_insert += 1
            pending_batch.append(
                {
                    "product_id": p["id"],
                    "kind": "photo",
                    "url": p["image_url"],
                    "is_primary": True,
                    "sort_order": 0,
                    "alt": p.get("sku") or None,
                }
            )
            if not args.dry_run and len(pending_batch) >= args.batch_size:
                inserted += insert_media_batch(pending_batch)
                pending_batch = []
        if len(products) < page_size:
            break
        page += 1

    if pending_batch and not args.dry_run:
        inserted += insert_media_batch(pending_batch)

    print(f"📊 Productos con image_url escaneados: {total_seen}")
    print(f"   ya migrados (skip): {total_seen - total_to_insert}")
    print(f"   nuevos a insertar: {total_to_insert}")
    if args.dry_run:
        print("   (dry-run, no se insertó nada)")
    else:
        print(f"   ✅ insertados: {inserted}")


if __name__ == "__main__":
    main()
