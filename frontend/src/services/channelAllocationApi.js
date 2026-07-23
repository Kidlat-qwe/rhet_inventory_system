import { api } from './api'

function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const fetchChannelAllocations = (params = {}) =>
  api(`/channel-allocations${queryString(params)}`).then((response) => response.data)

export const allocateToChannel = (body) =>
  api('/channel-allocations/allocate', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)

export const deallocateFromChannel = (body) =>
  api('/channel-allocations/deallocate', { method: 'POST', body: JSON.stringify(body) }).then((response) => response.data)
