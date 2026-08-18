import { api } from './api'

function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const fetchMe = () => api('/me').then((response) => response.data)
export const fetchDashboard = () => api('/dashboard').then((response) => response.data)
export const fetchSettings = () => api('/settings').then((response) => response.data)
export const updateSettings = (body) =>
  api('/settings', { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)
export const fetchCategories = () => api('/categories').then((response) => response.data)
export const fetchUsers = () => api('/users').then((response) => response.data)

export const createUser = (body) =>
  api('/users', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const updateUserRole = (userId, role) =>
  api(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }).then((response) => response.data)

export const updateUserStatus = (userId, status) =>
  api(`/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then((response) => response.data)

export const updateUser = (userId, body) =>
  api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)
export const fetchIntegrationClients = () => api('/integration-clients').then((response) => response.data)

export const createIntegrationClient = (body) =>
  api('/integration-clients', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const updateIntegrationClient = (systemCode, body) =>
  api(`/integration-clients/${systemCode}`, { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)

export const regenerateIntegrationApiKey = (systemCode) =>
  api(`/integration-clients/${systemCode}/regenerate-key`, { method: 'POST' }).then((response) => response.data)

export const revokeIntegrationApiKey = (systemCode) =>
  api(`/integration-clients/${systemCode}/revoke-key`, { method: 'POST' }).then((response) => response.data)

export const fetchInventory = (params = {}) =>
  api(`/inventory${queryString(params)}`).then((response) => ({
    data: response.data,
    meta: response.meta || { total: response.data?.length || 0 },
  }))

export const fetchMovements = (params = {}) =>
  api(`/stock-movements${queryString(params)}`).then((response) => ({
    data: response.data,
    meta: response.meta || { total: response.data?.length || 0 },
  }))

export const fetchStockRequests = (params = {}) =>
  api(`/stock-requests${queryString(params)}`).then((response) => ({
    data: response.data,
    meta: response.meta || { total: response.data?.length || 0 },
  }))

export const approveStockRequest = (id) =>
  api(`/stock-requests/${id}/ship`, { method: 'POST' }).then((response) => response.data)

export const shipStockRequest = (id) =>
  api(`/stock-requests/${id}/ship`, { method: 'POST' }).then((response) => response.data)

export const deliverStockRequest = (id) =>
  api(`/stock-requests/${id}/deliver`, { method: 'POST' }).then((response) => response.data)

export const returnStockRequest = (id, notesOrOptions = '', reusable = true) => {
  const options = typeof notesOrOptions === 'object' && notesOrOptions !== null
    ? notesOrOptions
    : { notes: notesOrOptions, reusable }
  return api(`/stock-requests/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({
      reusable: options.reusable !== false,
      notes: options.notes || null,
    }),
  }).then((response) => response.data)
}

export const rejectStockRequest = (id, rejectionReason) =>
  api(`/stock-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejectionReason }) }).then((response) => response.data)

export const previewStockRequestInvoice = (requestIds) =>
  api('/stock-requests/invoices/preview', {
    method: 'POST',
    body: JSON.stringify({ requestIds }),
  }).then((response) => response.data)

export const issueStockRequestInvoiceAndShip = (requestIds) =>
  api('/stock-requests/invoices', {
    method: 'POST',
    body: JSON.stringify({ requestIds }),
  }).then((response) => response.data)

export const fetchStockRequestInvoices = (params = {}) =>
  api(`/stock-requests/invoices${queryString(params)}`).then((response) => response.data || [])

export const fetchStockRequestInvoice = (invoiceId) =>
  api(`/stock-requests/invoices/${invoiceId}`).then((response) => response.data)

export const createInventoryItem = (body) =>
  api('/inventory', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const createToolKitChildItem = (parentId, body) =>
  api(`/inventory/${parentId}/tool-kit-children`, { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const removeToolKitChildItem = (parentId, childId) =>
  api(`/inventory/${parentId}/tool-kit-children/${childId}`, { method: 'DELETE' }).then((response) => response.data)

export const batchCreateInventory = (items) =>
  api('/inventory/batch', { method: 'POST', body: JSON.stringify({ items }) }).then((response) => response.data)

export const updateInventoryItem = (id, body) =>
  api(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)

export const deleteInventoryItem = (id, confirmationName) =>
  api(`/inventory/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmationName }),
  }).then((response) => response.data)

export const createStockMovement = (id, body) =>
  api(`/inventory/${id}/movements`, { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const createCategory = ({
  categoryName,
  categoryType = 'MERCHANDISE',
  categoryKind = 'OTHER',
  hasChildSkus = false,
}) =>
  api('/categories', {
    method: 'POST',
    body: JSON.stringify({
      categoryName,
      categoryType,
      categoryKind,
      hasChildSkus: Boolean(hasChildSkus),
    }),
  }).then((response) => response.data)

export const updateCategory = (categoryId, { categoryName, categoryType, categoryKind, hasChildSkus }) =>
  api(`/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      categoryName,
      ...(categoryType ? { categoryType } : {}),
      ...(categoryKind ? { categoryKind } : {}),
      ...(hasChildSkus !== undefined ? { hasChildSkus: Boolean(hasChildSkus) } : {}),
    }),
  }).then((response) => response.data)

export const deleteCategory = (categoryId, confirmationName) =>
  api(`/categories/${categoryId}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmationName }),
  }).then((response) => response.data)
