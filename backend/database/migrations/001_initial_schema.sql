BEGIN;

CREATE TABLE categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_name_unique UNIQUE (category_name)
);

CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'ADMIN'
    CHECK (role IN ('ADMIN', 'USER')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE inventory (
  inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  stocks INTEGER NOT NULL DEFAULT 0 CHECK (stocks >= 0),
  category_id UUID NOT NULL REFERENCES categories(category_id),
  variation VARCHAR(180),
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status IN ('ACTIVE', 'INACTIVE')),
  status VARCHAR(20) GENERATED ALWAYS AS (
    CASE
      WHEN lifecycle_status = 'INACTIVE' THEN 'INACTIVE'
      WHEN stocks = 0 THEN 'OUT_OF_STOCK'
      WHEN stocks <= low_stock_threshold THEN 'LOW_STOCK'
      ELSE 'ACTIVE'
    END
  ) STORED,
  created_by UUID REFERENCES users(user_id),
  updated_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT inventory_sku_unique UNIQUE (sku),
  CONSTRAINT inventory_name_not_blank CHECK (BTRIM(item_name) <> ''),
  CONSTRAINT inventory_sku_not_blank CHECK (BTRIM(sku) <> ''),
  CONSTRAINT inventory_status_valid CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOW_STOCK', 'OUT_OF_STOCK'))
);

CREATE TABLE stock_movements (
  movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(inventory_id),
  movement_type VARCHAR(20) NOT NULL CHECK (
    movement_type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGED', 'RELEASED', 'CANCELLED')
  ),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  stock_delta INTEGER NOT NULL CHECK (stock_delta <> 0),
  previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
  new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
  reference_number VARCHAR(100),
  remarks VARCHAR(500),
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT movement_math_valid CHECK (new_stock = previous_stock + stock_delta),
  CONSTRAINT movement_quantity_valid CHECK (quantity = ABS(stock_delta))
);

CREATE INDEX idx_inventory_category ON inventory(category_id);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at DESC);
CREATE INDEX idx_inventory_item_name_lower ON inventory(LOWER(item_name));
CREATE INDEX idx_stock_movements_inventory_created ON stock_movements(inventory_id, created_at DESC);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_created_by ON stock_movements(created_by);
CREATE INDEX idx_categories_status ON categories(status);

INSERT INTO categories (category_name) VALUES
  ('Uniform'), ('PE Uniform'), ('Bag'), ('Book'), ('Accessory'), ('Other')
ON CONFLICT (category_name) DO NOTHING;

COMMIT;
