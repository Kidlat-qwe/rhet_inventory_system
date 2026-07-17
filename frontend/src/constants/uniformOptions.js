export const UNIFORM_GENDERS = ['Male', 'Female', 'Unisex']

export const SCHOOL_UNIFORM_TYPES = ['Polo', 'Short', 'Full Set']

export const PE_UNIFORM_TYPES = ['Shirt', 'Pants', 'Full Set']

export const UNIFORM_SIZES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
]

const GENDER_CODES = {
  Male: 'M',
  Female: 'F',
  Unisex: 'U',
}

const TYPE_CODES = {
  Polo: 'POLO',
  Short: 'SHORT',
  'Full Set': 'FULLSET',
  Shirt: 'SHIRT',
  Pants: 'PANTS',
}

const UNIFORM_CATEGORY_NAMES = new Set(['uniform', 'pe uniform', 'school uniform'])

export function isUniformCategoryName(categoryName = '') {
  const normalized = categoryName.toLowerCase().trim()
  if (!normalized) return false
  return UNIFORM_CATEGORY_NAMES.has(normalized) || normalized.endsWith(' uniform')
}

export function isSchoolUniformCategory(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  return category?.categoryName?.toLowerCase().trim() === 'school uniform'
}

export function isUniformCategory(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  return isUniformCategoryName(category?.categoryName)
}

export function getUniformTypesForCategory(categoryId, categories = []) {
  if (!isUniformCategory(categoryId, categories)) return []
  if (isSchoolUniformCategory(categoryId, categories)) return SCHOOL_UNIFORM_TYPES
  return PE_UNIFORM_TYPES
}

export function buildUniformVariation({ uniformGender, uniformType, uniformSize }) {
  return `${uniformGender} · ${uniformType} · ${uniformSize}`
}

export function parseUniformVariation(variation = '') {
  const parts = variation.split(' · ').map((part) => part.trim())
  if (parts.length === 3) {
    return {
      uniformGender: parts[0],
      uniformType: parts[1],
      uniformSize: parts[2],
    }
  }
  return {
    uniformGender: '',
    uniformType: '',
    uniformSize: '',
  }
}

export function resolveItemVariation(form, categories) {
  if (isUniformCategory(form.categoryId, categories)) {
    if (!form.uniformGender || !form.uniformType || !form.uniformSize) {
      throw new Error('Please select gender, type, and size for uniform items.')
    }
    const allowedTypes = getUniformTypesForCategory(form.categoryId, categories)
    if (!allowedTypes.includes(form.uniformType)) {
      throw new Error('Please select a valid type for the chosen uniform category.')
    }
    return buildUniformVariation(form)
  }
  return form.variation?.trim() || null
}

function categoryPrefix(categoryName = '') {
  const cleaned = categoryName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return (cleaned.slice(0, 3) || 'CAT').padEnd(3, 'X')
}

function slugifyName(name = '') {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateSku(form, categories = []) {
  const category = categories.find((entry) => entry.categoryId === form.categoryId)
  if (!category) return ''

  const prefix = categoryPrefix(category.categoryName)

  if (isUniformCategory(form.categoryId, categories)) {
    const { uniformGender, uniformType, uniformSize } = form
    if (!uniformGender || !uniformType || !uniformSize) return ''

    const gender = GENDER_CODES[uniformGender] || uniformGender.slice(0, 1).toUpperCase()
    const type = TYPE_CODES[uniformType] || slugifyName(uniformType).replace(/-/g, '').slice(0, 8)
    const size = String(uniformSize).toUpperCase()

    return `${prefix}-${gender}-${type}-${size}`.slice(0, 64)
  }

  const nameSlug = slugifyName(form.itemName)
  if (!nameSlug) return ''

  return `${prefix}-${nameSlug}`.slice(0, 64)
}

export function canGenerateSku(form, categories = []) {
  if (!form.categoryId) return false

  if (isUniformCategory(form.categoryId, categories)) {
    return Boolean(form.uniformGender && form.uniformType && form.uniformSize)
  }

  return Boolean(form.itemName?.trim())
}
