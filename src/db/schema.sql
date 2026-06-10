-- ============================================================
--  SCHÉMA COMPLET — Boutique e-commerce
--  À exécuter dans : Supabase > SQL Editor
-- ============================================================

-- 1. CATÉGORIES
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,  -- ex: "femme", "homme"
  image_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUITS
CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  category_id  INT REFERENCES categories(id) ON DELETE SET NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL,
  stock_qty    INT NOT NULL DEFAULT 0,
  image_url    TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. UTILISATEURS
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) DEFAULT 'client'  -- 'client' ou 'admin'
    CHECK (role IN ('client', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. COMMANDES
CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(id) ON DELETE SET NULL,
  total        NUMERIC(10,2) NOT NULL,
  status       VARCHAR(30) DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'confirmee', 'expediee', 'livree', 'annulee')),
  address      TEXT,
  phone        VARCHAR(30),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LIGNES DE COMMANDE (produits dans chaque commande)
CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id) ON DELETE SET NULL,
  quantity    INT NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL  -- prix au moment de la commande
);

-- ── DONNÉES INITIALES ───────────────────────────────────

INSERT INTO categories (name, slug) VALUES
  ('Femme',      'femme'),
  ('Homme',      'homme'),
  ('Enfant',     'enfant'),
  ('Nouveau-né', 'nouveau-ne')
ON CONFLICT (slug) DO NOTHING;

-- Compte admin initial (mot de passe changé via l'API)
-- Le vrai hash est généré par bcrypt dans le backend
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin', 'admin@boutique.com', 'CHANGE_VIA_API', 'admin')
ON CONFLICT (email) DO NOTHING;
