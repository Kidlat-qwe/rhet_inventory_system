export const UNIFORM_GENDERS = ['Male', 'Female', 'Unisex']

export const SCHOOL_UNIFORM_TYPES = ['Polo', 'Short']

export const SCHOOL_UNIFORM_FEMALE_TYPES = ['Blouse', 'Skirt']

export const PE_UNIFORM_TYPES = ['Shirt', 'Pants']

export const LCA_SHIRT_TYPES = ['Shirt']

// Category-type presets shown when creating a category. The chosen preset's
// canonical name encodes the "kind" (no schema change): uniform-like presets
// drive the gender/type/size inputs on the inventory modal, while OTHER uses a
// free-text variation and a custom name.
export const CATEGORY_TYPE_OPTIONS = [
  { value: 'SCHOOL_UNIFORM', label: 'School Uniform', categoryName: 'School Uniform' },
  { value: 'PE_UNIFORM', label: 'PE Uniform', categoryName: 'PE Uniform' },
  { value: 'LCA_SHIRT', label: 'LCA T-Shirt', categoryName: 'LCA T-Shirt' },
  { value: 'LEARNING_KIT', label: 'Learning Kit', categoryName: 'Learning Kit' },
  { value: 'OTHER', label: 'Others', categoryName: '' },
]

// Type dropdown options keyed by the normalized (lowercased) category name.
const UNIFORM_TYPE_LISTS = {
  'school uniform': SCHOOL_UNIFORM_TYPES,
  'pe uniform': PE_UNIFORM_TYPES,
  'lca shirt': LCA_SHIRT_TYPES,
  'lca t-shirt': LCA_SHIRT_TYPES,
  'lca tshirt': LCA_SHIRT_TYPES,
  uniform: PE_UNIFORM_TYPES, // backward-compatible generic uniform
}

export const UNIFORM_SIZES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
]

const GENDER_CODES = {
  Male: 'M',
  Female: 'F',
  Unisex: 'U',
}

const TYPE_CODES = {
  Polo: 'POLO',
  Short: 'SHORT',
  Blouse: 'BLOUSE',
  Skirt: 'SKIRT',
  Shirt: 'SHIRT',
  Pants: 'PANTS',
}

const DEFAULT_FIELD_PLACEHOLDERS = {
  itemName: 'e.g. Item name',
  variation: 'Size, color, grade...',
}

// Contextual placeholders keyed by normalized category name. Uniform-family
// categories replace the free-text variation input with dropdowns, so their
// variation hint is only used as a fallback.
const CATEGORY_FIELD_PLACEHOLDERS = {
  uniform: { itemName: 'e.g. Classic White Polo', variation: 'Gender, type, size...' },
  'school uniform': { itemName: 'e.g. Classic White Polo', variation: 'Gender, type, size...' },
  'pe uniform': { itemName: 'e.g. PE Training Shirt', variation: 'Gender, type, size...' },
  'lca shirt': { itemName: 'e.g. LCA T-Shirt', variation: 'Gender, type, size...' },
  'lca t-shirt': { itemName: 'e.g. LCA T-Shirt', variation: 'Gender, type, size...' },
  'lca tshirt': { itemName: 'e.g. LCA T-Shirt', variation: 'Gender, type, size...' },
  bag: { itemName: 'e.g. School Backpack', variation: 'Color, capacity...' },
  book: { itemName: 'e.g. Grade 5 Mathematics Textbook', variation: 'Grade level, edition...' },
  accessory: { itemName: 'e.g. School Necktie', variation: 'Color, size...' },
  other: { itemName: 'e.g. Item name', variation: 'Size, color, grade...' },
  'learning kit': { itemName: 'e.g. grade-1-learning-kit', variation: 'e.g. grade-1, sy-2026' },
}

export function isLcaShirtCategoryName(categoryName = '') {
  const normalized = categoryName.toLowerCase().trim()
  if (!normalized) return false
  if (UNIFORM_TYPE_LISTS[normalized] === LCA_SHIRT_TYPES) return true
  return normalized.includes('lca') && normalized.includes('shirt')
}

export function isLearningKitCategoryName(categoryName = '') {
  return categoryName.trim().toLowerCase() === 'learning kit'
}

export function isLearningKitCategory(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  return isLearningKitCategoryName(category?.categoryName)
}

export function isUniformCategoryName(categoryName = '') {
  const normalized = categoryName.toLowerCase().trim()
  if (!normalized) return false
  return Boolean(UNIFORM_TYPE_LISTS[normalized])
    || normalized.endsWith(' uniform')
    || isLcaShirtCategoryName(normalized)
}

export function isSchoolUniformCategory(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  return category?.categoryName?.toLowerCase().trim() === 'school uniform'
}

// Gender options available for a category. School Uniform is Male/Female only
// (no Unisex); other uniform categories keep the full list.
export function getUniformGendersForCategory(categoryId, categories = []) {
  if (isSchoolUniformCategory(categoryId, categories)) {
    return UNIFORM_GENDERS.filter((gender) => gender !== 'Unisex')
  }
  return UNIFORM_GENDERS
}

export function isUniformCategory(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  return isUniformCategoryName(category?.categoryName)
}

export function getFieldPlaceholders(categoryId, categories = []) {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  const normalized = category?.categoryName?.toLowerCase().trim() || ''
  if (!normalized) return DEFAULT_FIELD_PLACEHOLDERS
  if (CATEGORY_FIELD_PLACEHOLDERS[normalized]) return CATEGORY_FIELD_PLACEHOLDERS[normalized]
  if (normalized.endsWith(' uniform')) return CATEGORY_FIELD_PLACEHOLDERS.uniform
  if (isLcaShirtCategoryName(normalized)) return CATEGORY_FIELD_PLACEHOLDERS['lca t-shirt']
  if (isLearningKitCategoryName(normalized)) return CATEGORY_FIELD_PLACEHOLDERS['learning kit']
  if (normalized.includes('bag')) return CATEGORY_FIELD_PLACEHOLDERS.bag
  if (normalized.includes('book')) return CATEGORY_FIELD_PLACEHOLDERS.book
  if (normalized.includes('accessor')) return CATEGORY_FIELD_PLACEHOLDERS.accessory
  return DEFAULT_FIELD_PLACEHOLDERS
}

export function getUniformTypesForCategory(categoryId, categories = [], gender = '') {
  const category = categories.find((entry) => entry.categoryId === categoryId)
  if (!isUniformCategoryName(category?.categoryName)) return []
  const normalized = category.categoryName.toLowerCase().trim()

  // School Uniform types depend on gender: Female → Blouse + Skirt,
  // Male / Unisex → Polo + Short.
  if (normalized === 'school uniform') {
    return gender === 'Female' ? SCHOOL_UNIFORM_FEMALE_TYPES : SCHOOL_UNIFORM_TYPES
  }

  if (isLcaShirtCategoryName(normalized)) return LCA_SHIRT_TYPES

  return UNIFORM_TYPE_LISTS[normalized] || PE_UNIFORM_TYPES
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
    const allowedTypes = getUniformTypesForCategory(form.categoryId, categories, form.uniformGender)
    if (!allowedTypes.includes(form.uniformType)) {
      throw new Error('Please select a valid type for the chosen uniform category.')
    }
    return buildUniformVariation(form)
  }
  const variation = String(form.variation || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
  return variation || null
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

// Produces a globally unique SKU by appending a numeric suffix (-2, -3, ...)
// when the derived base already belongs to a different inventory item. The
// first item keeps the clean base (e.g. BAG-BACKPACK); duplicates become
// BAG-BACKPACK-2. The backend unique constraint remains the final guard.
export function generateUniqueSku(form, categories = [], existingItems = []) {
  const base = generateSku(form, categories)
  if (!base) return ''

  const taken = new Set(
    existingItems
      .filter((entry) => entry.inventoryId !== form.inventoryId)
      .map((entry) => String(entry.sku || '').toUpperCase()),
  )

  if (!taken.has(base.toUpperCase())) return base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tail = `-${suffix}`
    const candidate = `${base.slice(0, 64 - tail.length)}${tail}`
    if (!taken.has(candidate.toUpperCase())) return candidate
  }

  return base
}

export function canGenerateSku(form, categories = []) {
  if (!form.categoryId) return false

  if (isUniformCategory(form.categoryId, categories)) {
    return Boolean(form.uniformGender && form.uniformType && form.uniformSize)
  }

  return Boolean(form.itemName?.trim())
}
