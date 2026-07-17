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
export const fetchCategories = () => api('/categories').then((response) => response.data)
export const fetchUsers = () => api('/users').then((response) => response.data)

export const createUser = (body) =>
  api('/users', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const updateUserRole = (userId, role) =>
  api(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }).then((response) => response.data)
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
  api(`/stock-requests/${id}/approve`, { method: 'POST' }).then((response) => response.data)

export const rejectStockRequest = (id, rejectionReason) =>
  api(`/stock-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejectionReason }) }).then((response) => response.data)

export const createInventoryItem = (body) =>
  api('/inventory', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const updateInventoryItem = (id, body) =>
  api(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)

export const createStockMovement = (id, body) =>
  api(`/inventory/${id}/movements`, { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const createCategory = (categoryName) =>
  api('/categories', { method: 'POST', body: JSON.stringify({ categoryName }) }).then((response) => response.data)
