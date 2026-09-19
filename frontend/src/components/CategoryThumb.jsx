import { useEffect, useState } from 'react'
import { fetchCategoryImage } from '../services/inventoryApi'
import {
  getCachedCategoryImage,
  rememberCategoryImage,
} from '../utils/categoryImage'
import { Icon } from './Icon'

export function CategoryThumb({ category, size = 40, className = '' }) {
  const categoryId = category?.categoryId || category?.category_id || ''
  const directUrl = category?.imageUrl || category?.image_url || ''
  const hasImage = Boolean(
    directUrl
    || category?.hasImage
    || category?.has_image
    || getCachedCategoryImage(categoryId),
  )
  const label = category?.categoryName || category?.category_name || 'Category'
  const [src, setSrc] = useState(() => directUrl || getCachedCategoryImage(categoryId) || '')

  useEffect(() => {
    if (directUrl) {
      rememberCategoryImage(categoryId, directUrl)
      setSrc(directUrl)
      return undefined
    }
    const cached = getCachedCategoryImage(categoryId)
    if (cached) {
      setSrc(cached)
      return undefined
    }
    if (!categoryId || !hasImage) {
      setSrc('')
      return undefined
    }

    let cancelled = false
    fetchCategoryImage(categoryId)
      .then((data) => {
        if (cancelled) return
        const url = data?.imageUrl || ''
        if (url) {
          rememberCategoryImage(categoryId, url)
          setSrc(url)
        }
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })

    return () => {
      cancelled = true
    }
  }, [categoryId, directUrl, hasImage])

  if (src) {
    return (
      <img
        className={`category-thumb${className ? ` ${className}` : ''}`}
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        title={label}
      />
    )
  }

  return (
    <div
      className={`product-thumb category-thumb-fallback${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name="box" size={Math.round(size * 0.5)} />
    </div>
  )
}
