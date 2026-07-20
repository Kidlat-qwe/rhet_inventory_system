export const PAGE_BY_SLUG = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  'stock-requests': 'Stock Requests',
  'release-logs': 'Release Logs',
  'stock-movements': 'Stock Movements',
  reports: 'Reports',
  categories: 'Categories',
  'api-keys': 'API Keys',
  users: 'Users',
  'online-orders': 'Online Orders',
  settings: 'Settings',
}

export const SLUG_BY_PAGE = Object.fromEntries(
  Object.entries(PAGE_BY_SLUG).map(([slug, page]) => [page, slug]),
)

export const ADMIN_PAGES = [
  'Dashboard',
  'Inventory',
  'Stock Requests',
  'Online Orders',
  'Release Logs',
  'Stock Movements',
  'Reports',
  'Categories',
  'API Keys',
  'Users',
  'Settings',
]

export const USER_PAGES = [
  'Dashboard',
  'Inventory',
  'Stock Requests',
  'Online Orders',
  'Release Logs',
  'Stock Movements',
  'Reports',
  'Categories',
]

export function roleBasePath(isAdmin) {
  return isAdmin ? '/admin' : '/user'
}

export function pathForPage(isAdmin, page) {
  const slug = SLUG_BY_PAGE[page] || 'dashboard'
  return `${roleBasePath(isAdmin)}/${slug}`
}

export function pageFromPath(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean)
  if (parts.length < 2) return null
  const [role, slug] = parts
  if (role !== 'admin' && role !== 'user') return null
  const page = PAGE_BY_SLUG[slug]
  if (!page) return null
  return { role, slug, page, isAdminPath: role === 'admin' }
}
