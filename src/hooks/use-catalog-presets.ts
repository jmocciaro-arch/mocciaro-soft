'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface CatalogCategory {
  id: string
  slug: string
  name: string
  emoji: string | null
  sort_order: number
}

export interface CatalogBrand {
  id: string
  slug: string
  name: string
  country_origin: string | null
  logo_url: string | null
  sort_order?: number
}

export interface CatalogAttribute {
  id: string
  code: string
  name: string
  unit: string | null
  type: 'select' | 'text' | 'number' | 'range' | 'boolean'
  sort_order: number
}

export interface CatalogAttributeValue {
  id: string
  attribute_id: string
  value: string
  label: string | null
  sort_order: number
}

export interface CategoryAttribute {
  category_id: string
  attribute_id: string
  is_featured: boolean
  is_filter: boolean
  is_required: boolean
  sort_order: number
}

/**
 * Carga todos los presets del catálogo (categorías, marcas, atributos, valores, relaciones).
 * Expone helpers para usar desde formularios.
 */
export function useCatalogPresets() {
  const [categories, setCategories]     = useState<CatalogCategory[]>([])
  const [brands, setBrands]             = useState<CatalogBrand[]>([])
  const [attributes, setAttributes]     = useState<CatalogAttribute[]>([])
  const [values, setValues]             = useState<CatalogAttributeValue[]>([])
  const [categoryAttrs, setCategoryAttrs] = useState<CategoryAttribute[]>([])
  const [loading, setLoading]           = useState(true)

  const load = useCallback(async () => {
    const sb = createClient()
    const [cats, brds, attrs, vals, catAttrs] = await Promise.all([
      sb.from('tt_catalog_categories').select('id, slug, name, emoji, sort_order').eq('active', true).order('sort_order'),
      sb.from('tt_catalog_brands').select('id, slug, name, country_origin, logo_url, sort_order').eq('active', true).order('sort_order'),
      sb.from('tt_catalog_attributes').select('id, code, name, unit, type, sort_order').order('sort_order'),
      sb.from('tt_catalog_attribute_values').select('id, attribute_id, value, label, sort_order').eq('active', true).order('sort_order'),
      sb.from('tt_catalog_category_attributes').select('category_id, attribute_id, is_featured, is_filter, is_required, sort_order').order('sort_order'),
    ])
    setCategories((cats.data || []) as CatalogCategory[])
    setBrands((brds.data || []) as CatalogBrand[])
    setAttributes((attrs.data || []) as CatalogAttribute[])
    setValues((vals.data || []) as CatalogAttributeValue[])
    setCategoryAttrs((catAttrs.data || []) as CategoryAttribute[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Devuelve los atributos destacados para una categoría (por slug) ordenados */
  const getAttributesForCategory = useCallback((categorySlug: string | null | undefined): Array<CatalogAttribute & { is_required: boolean; is_filter: boolean }> => {
    if (!categorySlug) return []
    const cat = categories.find(c => c.slug === categorySlug)
    if (!cat) return []
    const rels = categoryAttrs
      .filter(ca => ca.category_id === cat.id && ca.is_featured)
      .sort((a, b) => a.sort_order - b.sort_order)
    return rels.map(rel => {
      const attr = attributes.find(a => a.id === rel.attribute_id)
      if (!attr) return null
      return { ...attr, is_required: rel.is_required, is_filter: rel.is_filter }
    }).filter(Boolean) as Array<CatalogAttribute & { is_required: boolean; is_filter: boolean }>
  }, [categories, categoryAttrs, attributes])

  /** Devuelve los valores predefinidos de un atributo (por code) */
  const getValuesForAttribute = useCallback((attributeCode: string): CatalogAttributeValue[] => {
    const attr = attributes.find(a => a.code === attributeCode)
    if (!attr) return []
    return values
      .filter(v => v.attribute_id === attr.id)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [attributes, values])

  /** Agrega un nuevo valor a un atributo (admin only — valida RLS en server) */
  const addAttributeValue = useCallback(async (attributeCode: string, newValue: string): Promise<boolean> => {
    const attr = attributes.find(a => a.code === attributeCode)
    if (!attr) return false
    const sb = createClient()
    const nextOrder = Math.max(0, ...values.filter(v => v.attribute_id === attr.id).map(v => v.sort_order)) + 10
    const { data, error } = await sb
      .from('tt_catalog_attribute_values')
      .insert({ attribute_id: attr.id, value: newValue.trim(), sort_order: nextOrder, active: true })
      .select('id, attribute_id, value, label, sort_order')
      .single()
    if (error || !data) return false
    setValues(prev => [...prev, data as CatalogAttributeValue])
    return true
  }, [attributes, values])

  /** Agrega una nueva categoría */
  const addCategory = useCallback(async (name: string, emoji?: string): Promise<CatalogCategory | null> => {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const sb = createClient()
    const nextOrder = Math.max(0, ...categories.map(c => c.sort_order)) + 10
    const { data, error } = await sb
      .from('tt_catalog_categories')
      .insert({ slug, name: name.trim(), emoji: emoji || '📦', sort_order: nextOrder, active: true })
      .select('id, slug, name, emoji, sort_order')
      .single()
    if (error || !data) return null
    const newCat = data as CatalogCategory
    setCategories(prev => [...prev, newCat].sort((a, b) => a.sort_order - b.sort_order))
    return newCat
  }, [categories])

  /** Agrega una nueva marca */
  const addBrand = useCallback(async (name: string, country?: string): Promise<CatalogBrand | null> => {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const sb = createClient()
    const nextOrder = Math.max(0, ...brands.map(b => b.sort_order || 0)) + 10
    const { data, error } = await sb
      .from('tt_catalog_brands')
      .insert({ slug, name: name.trim().toUpperCase(), country_origin: country || null, sort_order: nextOrder, active: true })
      .select('id, slug, name, country_origin, logo_url, sort_order')
      .single()
    if (error || !data) return null
    const newBrand = data as CatalogBrand
    setBrands(prev => [...prev, newBrand])
    return newBrand
  }, [brands])

  return {
    loading,
    categories,
    brands,
    attributes,
    values,
    categoryAttrs,
    getAttributesForCategory,
    getValuesForAttribute,
    addAttributeValue,
    addCategory,
    addBrand,
    reload: load,
  }
}
