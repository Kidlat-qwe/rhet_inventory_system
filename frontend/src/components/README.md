# Shared UI Components

Reusable presentational and modal components used across admin and user pages.

| File | Purpose |
|------|---------|
| `Icon.jsx` | SVG icon set (`grid`, `box`, `swap`, `report`, `tag`, `users`, `settings`, `link`, `list`, `cart`, `bell`, `help`, `back`, `search`) |
| `EmptyState.jsx` | Empty list / no-data placeholder |
| `PageLoading.jsx` | Full-page loading indicator |
| `ProcessingModal.jsx` | Global progress modal for mutating API calls (add / update / delete). Driven by `services/api.js`. |
| `StatusBadge.jsx` | Status pill with color class. Optional `label` overrides display text (used for Shopee-aligned online-order fulfillment labels). |
| `MovementTable.jsx` | Stock movement history table (optional order/notes column for online logs). `compact` hides Processed by for dashboard side-by-side layout. Always shows column headers; empty state renders inside the table body. |
| `Sidebar.jsx` | App navigation sidebar; organization name from Settings |
| `Header.jsx` | Top bar with breadcrumbs, stock-request notifications (count badge, toast alert, **Mark all as Read**), account menu (**Forgot password** / **Log out**) |
| `CategoryModal.jsx` | Create / edit category. **Category type**: Merchandise / Supplies. **Kind**: Uniform (subtype School / PE / Shirt), Learning Kit, Others. Others can enable **Parent items with child SKUs**. |
| `DeleteCategoryModal.jsx` | Admin-only delete confirm: must type the exact category name. Can delete categories that still have items (cascades item delete when safe). |
| `DeleteInventoryModal.jsx` | Admin-only delete confirm for an inventory item: must type the exact item name. Shows SKU; completed stock requests are unlinked; blocked for online orders / active requests / kit BOM. |
| `ItemModal.jsx` | Create / edit a single inventory item. Requires **Selling price** and **Internal selling price**. **Learning Kit**: category-slot BOM. **Tool Kit**: parent metadata only — raw children are added from the Tool Kit raw-items page modal. For **Shirt** (`LCA_SHIRT`), shows Gender / **Logo** (Beeli, LCA, **+ Add logo**) / Size. Non-uniform SKUs regenerate on rename; uniform SKUs stay locked. |
| `ToolKitRawItemModal.jsx` | Popup to add a Tool Kit raw child: **Create new** or **Use existing** (shared SKU/stock across parents). Typing a name that already exists prompts to link the shared item. |
| `UniformItemModal.jsx` | Add / edit School or PE uniform. Toggle **Per piece** (Polo+Short / Shirt+Pants, each own stock) or **Set** (one SKU with independent set stock, type `Set` / SKU code `SET`). LCA T-Shirt uses `ItemModal` instead. |
| `HelpAssistant.jsx` | Floating help button (bottom-right). Cleared from pagination via content/pager padding. Rule-based FAQ; visibility from org Settings (`helpAssistantEnabled`). |
| `ActionsMenu.jsx` | Floating ellipsis (•••) actions menu rendered in a portal |
| `TableHeadSelect.jsx` | Borderless table-header filter (Inventory Categories / Merchandise / Supplies). Custom menu in a portal so native `<select>` chrome is not used. |
| `Pagination.jsx` | Presentational pager (pairs with the `usePagination` hook) |
| `StockModal.jsx` | Add / deduct / adjust stock form |
| `AllocationModal.jsx` | Legacy Shopee allocate/deallocate form (UI hidden; reserved for future Open API) |

Import with named exports from each file, for example:

```js
import { Icon } from '../components/Icon'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
```
