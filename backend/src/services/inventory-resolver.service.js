export function buildUniformVariation(gender, type, size) {
  return `${gender} · ${type} · ${size}`;
}

export function isUniformLikeCategory(categoryName = '') {
  const normalized = categoryName.toLowerCase().trim();
  if (!normalized) return false;
  return normalized === 'uniform' || normalized.endsWith(' uniform');
}

export async function resolveInventoryItem(db, input) {
  const { categoryName, gender, type, size, itemName } = input;

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
    values.push(buildUniformVariation(gender, type, size));
    where.push(`i.variation = $${values.length}`);
  } else if (itemName?.trim()) {
    values.push(itemName.trim());
    where.push(`LOWER(i.item_name) = LOWER($${values.length})`);
  } else {
    return { error: 'Item name is required for non-uniform categories' };
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
      : itemName;
    return { error: `No inventory item matched ${category.category_name} (${hint})` };
  }

  return { item: result.rows[0] };
}
