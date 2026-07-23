import InventoryPage from '../shared/InventoryPage'

export default function AdminInventory(props) {
  return <InventoryPage {...props} canManage />
}
