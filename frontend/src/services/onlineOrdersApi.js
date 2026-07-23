import { api } from './api'

function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const fetchOnlineOrders = (params = {}) =>
  api(`/online-orders${queryString(params)}`).then((response) => ({
    data: response.data,
    meta: response.meta || { total: response.data?.length || 0 },
  }))

export const fetchOnlineOrder = (id) =>
  api(`/online-orders/${id}`).then((response) => response.data)

export const importOnlineOrdersCsv = (csvText, channel = 'SHOPEE') =>
  api('/online-orders/import', {
    method: 'POST',
    body: JSON.stringify({ csvText, channel }),
  }).then((response) => response.data)

export const createManualOnlineOrder = (body) =>
  api('/online-orders/manual', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((response) => response.data)

export const resolveOnlineOrderItem = (itemId, inventoryId) =>
  api(`/online-orders/items/${itemId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ inventoryId }),
  }).then((response) => response.data)

export const cancelOnlineOrderItem = (itemId) =>
  api(`/online-orders/items/${itemId}/cancel`, {
    method: 'POST',
  }).then((response) => response.data)

export const cancelOnlineOrder = (orderId) =>
  api(`/online-orders/${orderId}/cancel`, {
    method: 'POST',
  }).then((response) => response.data)

export const fetchChannelMappings = (params = {}) =>
  api(`/online-orders/mappings${queryString(params)}`).then((response) => response.data)

export const updateOnlineOrderFulfillmentStatus = (orderId, status) =>
  api(`/online-orders/${orderId}/fulfillment-status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }).then((response) => response.data)

export const confirmOnlineOrderReturn = (orderId, reusable, notes) =>
  api(`/online-orders/${orderId}/confirm-return`, {
    method: 'POST',
    body: JSON.stringify({ reusable, notes }),
  }).then((response) => response.data)
