import { api } from './api'

const queryString = (params = {}) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (!entries.length) return ''
  return `?${new URLSearchParams(Object.fromEntries(entries)).toString()}`
}

export const fetchManualOrders = (params = {}) =>
  api(`/manual-orders${queryString(params)}`).then((response) => ({
    data: response.data,
    meta: response.meta,
  }))

export const fetchManualOrder = (id) =>
  api(`/manual-orders/${id}`).then((response) => response.data)

export const createManualOrder = (body) =>
  api('/manual-orders', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const updateManualOrder = (id, body) =>
  api(`/manual-orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((response) => response.data)

export const updateManualOrderFulfillmentStatus = (orderId, status) =>
  api(`/manual-orders/${orderId}/fulfillment-status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }).then((response) => response.data)

export const cancelManualOrder = (orderId) =>
  api(`/manual-orders/${orderId}/cancel`, { method: 'POST' }).then((response) => response.data)

export const confirmManualOrderReturn = (orderId, reusable, notes) =>
  api(`/manual-orders/${orderId}/confirm-return`, {
    method: 'POST',
    body: JSON.stringify({ reusable, notes }),
  }).then((response) => response.data)
