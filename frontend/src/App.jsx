import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { PageLoading } from './components/PageLoading'
import { Sidebar } from './components/Sidebar'
import {
  AdminApiKeys,
  AdminCategories,
  AdminDashboard,
  AdminInventory,
  AdminReleaseLogs,
  AdminReports,
  AdminSettings,
  AdminStockMovements,
  AdminStockRequests,
  AdminUsers,
} from './pages/admin'
import Login from './pages/Login'
import {
  UserCategories,
  UserDashboard,
  UserInventory,
  UserReleaseLogs,
  UserReports,
  UserStockMovements,
  UserStockRequests,
} from './pages/user'
import { downloadCsv } from './services/api'
import { firebaseConfigured, observeAuth, signOutAdmin } from './services/firebase'
import {
  fetchUsers,
  fetchCategories,
  fetchDashboard,
  fetchInventory,
  fetchMe,
  fetchMovements,
  fetchStockRequests,
  fetchIntegrationClients,
} from './services/inventoryApi'

function App() {
  const [page, setPage] = useState('Dashboard')
  const [menu, setMenu] = useState(false)
  const [user, setUser] = useState(firebaseConfigured ? undefined : null)
  const [admin, setAdmin] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [inventory, setInventory] = useState([])
  const [movements, setMovements] = useState([])
  const [stockRequests, setStockRequests] = useState([])
  const [integrationClients, setIntegrationClients] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const me = await fetchMe()
      const isAdmin = String(me?.role || 'ADMIN').toUpperCase() === 'ADMIN'
      const [dash, cats, inv, mov, requests, adminList, clients] = await Promise.all([
        fetchDashboard(),
        fetchCategories(),
        fetchInventory({ limit: 100, sortBy: 'updatedAt', order: 'desc' }),
        fetchMovements({ limit: 50 }),
        fetchStockRequests({ limit: 100 }),
        isAdmin ? fetchUsers() : Promise.resolve([]),
        isAdmin ? fetchIntegrationClients() : Promise.resolve([]),
      ])
      setAdmin(me)
      setDashboard(dash)
      setCategories(cats)
      setInventory(inv.data)
      setMovements(mov.data)
      setStockRequests(requests.data)
      setIntegrationClients(clients)
      setAdmins(adminList)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => firebaseConfigured ? observeAuth(setUser) : undefined, [])
  useEffect(() => {
    if (firebaseConfigured && user === undefined) return
    if (firebaseConfigured && !user) return
    reload()
  }, [user, reload])

  // Both admin and user land on Dashboard after sign-in / session restore.
  useEffect(() => {
    if (!user) return
    setPage('Dashboard')
  }, [user?.uid])

  useEffect(() => {
    if (!admin) return
    const isAdmin = String(admin.role || 'ADMIN').toUpperCase() === 'ADMIN'
    const adminOnlyPages = new Set(['API Keys', 'Users', 'Settings', 'Admin Users'])
    if (!isAdmin && adminOnlyPages.has(page)) {
      setPage('Dashboard')
    }
  }, [admin, page])

  async function handleExport() {
    try {
      await downloadCsv('/reports/inventory.csv', 'inventory-report.csv')
    } catch (err) {
      setError(err.message)
    }
  }

  if (user === undefined) return <div className="auth-loading">Checking your session…</div>
  if (firebaseConfigured && !user) return <Login />

  const isAdmin = String(admin?.role || 'ADMIN').toUpperCase() === 'ADMIN'

  const content = (() => {
    if (loading) return <PageLoading />
    if (error) return <div className="page-error">{error}</div>

    if (isAdmin) {
      switch (page) {
        case 'Dashboard':
          return <AdminDashboard dashboard={dashboard} admin={admin} goInventory={() => setPage('Inventory')} goMovements={() => setPage('Stock Movements')} />
        case 'Inventory':
          return <AdminInventory items={inventory} categories={categories} onRefresh={reload} onExport={handleExport} />
        case 'Stock Requests':
          return <AdminStockRequests requests={stockRequests} onRefresh={reload} />
        case 'Release Logs':
          return <AdminReleaseLogs requests={stockRequests} />
        case 'Stock Movements':
          return <AdminStockMovements movements={movements} />
        case 'Categories':
          return <AdminCategories categories={categories} onRefresh={reload} />
        case 'Users':
          return <AdminUsers users={admins} currentAdmin={admin} onRefresh={reload} />
        case 'API Keys':
          return <AdminApiKeys clients={integrationClients} onRefresh={reload} />
        case 'Reports':
          return <AdminReports dashboard={dashboard} onExport={handleExport} />
        case 'Settings':
          return <AdminSettings admin={admin} />
        default:
          return <EmptyState title={page} message="This page is not available." />
      }
    }

    switch (page) {
      case 'Dashboard':
        return <UserDashboard dashboard={dashboard} admin={admin} goInventory={() => setPage('Inventory')} goMovements={() => setPage('Stock Movements')} />
      case 'Inventory':
        return <UserInventory items={inventory} categories={categories} onRefresh={reload} onExport={handleExport} />
      case 'Stock Requests':
        return <UserStockRequests requests={stockRequests} onRefresh={reload} />
      case 'Release Logs':
        return <UserReleaseLogs requests={stockRequests} />
      case 'Stock Movements':
        return <UserStockMovements movements={movements} />
      case 'Categories':
        return <UserCategories categories={categories} onRefresh={reload} />
      case 'Reports':
        return <UserReports dashboard={dashboard} onExport={handleExport} />
      case 'Users':
        return <EmptyState title="Access restricted" message="Only administrators can manage users." />
      case 'API Keys':
        return <EmptyState title="Access restricted" message="Only administrators can manage API keys." />
      case 'Settings':
        return <EmptyState title="Access restricted" message="Only administrators can open Settings." />
      default:
        return <EmptyState title={page} message="This page is not available." />
    }
  })()

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} open={menu} close={() => setMenu(false)} admin={admin} itemCount={inventory.length} pendingRequests={stockRequests.filter((request) => request.status === 'PENDING').length} />
      {menu && <div className="mobile-overlay" onClick={() => setMenu(false)} />}
      <main>
        <Header page={page} menu={() => setMenu(true)} logout={firebaseConfigured ? signOutAdmin : undefined} admin={admin} />
        <div className="content">{content}</div>
      </main>
    </div>
  )
}

export default App
