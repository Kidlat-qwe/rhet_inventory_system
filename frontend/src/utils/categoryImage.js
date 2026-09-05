const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
