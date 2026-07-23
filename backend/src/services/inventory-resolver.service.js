export function buildUniformVariation(gender, type, size) {
  return `${gender} · ${type} · ${size}`;
}

// Categories whose items are identified by gender/type/size. Kept in sync with
// the frontend category-type presets (see constants/uniformOptions.js).
const UNIFORM_LIKE_CATEGORY_NAMES = new Set([
  'uniform',
  'school uniform',
  'pe uniform',
  'lca shirt',
  'lca t-shirt',
  'lca tshirt',
]);

export function isUniformLikeCategory(categoryName = '') {
  const normalized = categoryName.toLowerCase().trim();
  if (!normalized) return false;
  return UNIFORM_LIKE_CATEGORY_NAMES.has(normalized)
    || normalized.endsWith(' uniform')
    || (normalized.includes('lca') && normalized.includes('shirt'));
}

export async function resolveInventoryItem(db, input) {
  const { categoryName, gender, type, size, itemName, sku } = input;

  const categoryResult = await db.query(
    'SELECT category_id, category_name FROM categories WHERE LOWER(category_name) = LOWER($1) AND status = $2',
    [categoryName, 'ACTIVE'],
  );
  if (!categoryResult.rowCount) {
    return { error: `Category "${categoryName}" was not found` };
  }

  const category = categoryResult.rows[0];
  const values = [category.category_id];
  const where = ['i.category_id = $1', "i.lifecycle_status = 'ACTIVE'"];

  if (isUniformLikeCategory(category.category_name)) {
    if (!gender || !type || !size) {
      return { error: 'Gender, type, and size are required for uniform items' };
    }
    // Match on the structured columns (case-insensitive) rather than parsing the
    // display `variation` string.
    values.push(gender);
    where.push(`LOWER(i.uniform_gender) = LOWER($${values.length})`);
    values.push(type);
    where.push(`LOWER(i.uniform_type) = LOWER($${values.length})`);
    values.push(size);
    where.push(`UPPER(i.uniform_size) = UPPER($${values.length})`);
  } else if (sku?.trim() || itemName?.trim()) {
    if (sku?.trim()) {
      values.push(sku.trim());
      where.push(`UPPER(i.sku) = UPPER($${values.length})`);
    }
    if (itemName?.trim()) {
      values.push(itemName.trim());
      where.push(`LOWER(i.item_name) = LOWER($${values.length})`);
    }
  } else {
    return { error: 'Item name or SKU is required for non-uniform categories' };
  }

  const result = await db.query(
    `SELECT i.inventory_id, i.sku, i.item_name, i.stocks, i.status, i.variation, c.category_name
     FROM inventory i
     JOIN categories c ON c.category_id = i.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    values,
  );

  if (!result.rowCount) {
    const hint = isUniformLikeCategory(category.category_name)
      ? `${gender} · ${type} · ${size}`
      : (sku || itemName);
    return { error: `No inventory item matched ${category.category_name} (${hint})` };
  }

  return { item: result.rows[0] };
}
