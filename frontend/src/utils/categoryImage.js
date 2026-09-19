const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** In-memory cache so list responses can omit large data: URLs without blanking thumbs. */
const categoryImageCache = new Map()

export function rememberCategoryImage(categoryId, imageUrl) {
  const id = String(categoryId || '').trim()
  if (!id) return
  const url = String(imageUrl || '').trim()
  if (!url) {
    categoryImageCache.delete(id)
    return
  }
  categoryImageCache.set(id, url)
}

export function forgetCategoryImage(categoryId) {
  categoryImageCache.delete(String(categoryId || '').trim())
}

export function getCachedCategoryImage(categoryId) {
  return categoryImageCache.get(String(categoryId || '').trim()) || ''
}

/** Merge list rows with cached / previous image URLs for thumbnails. */
export function hydrateCategoryImages(categories = [], previous = []) {
  const prevById = new Map(
    (previous || [])
      .filter((entry) => entry?.categoryId && entry?.imageUrl)
      .map((entry) => [entry.categoryId, entry.imageUrl]),
  )
  return (categories || []).map((entry) => {
    const id = entry?.categoryId
    if (!id) return entry
    if (entry.imageUrl) {
      rememberCategoryImage(id, entry.imageUrl)
      return entry
    }
    const cached = getCachedCategoryImage(id) || prevById.get(id) || ''
    if (cached) return { ...entry, imageUrl: cached }
    return entry
  })
}

export function validateCategoryImageFile(file) {
  if (!file) return { ok: true, dataUrl: null }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Use a PNG, JPG, WEBP, or GIF image.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be 10 MB or smaller.' }
  }
  return { ok: true }
}

export function readCategoryImageFile(file) {
  const check = validateCategoryImageFile(file)
  if (!check.ok) return Promise.reject(new Error(check.error))

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(file)
  })
}
