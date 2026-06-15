const express = require('express');
const pool    = require('../db');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { upload, cloudinary }  = require('../config/cloudinary');

const router = express.Router();

// ── GET /api/products ─────────────────────────────────────
// Liste publique — avec filtres optionnels
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = ['p.is_active = TRUE'];

    if (category) {
      params.push(category);
      conditions.push(`c.slug = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Jointure avec categories pour récupérer le nom de la catégorie
    const query = `
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ products: result.rows, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/products/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0])
      return res.status(404).json({ message: 'Produit non trouvé' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/products ────────────────────────────────────
// Ajouter un produit (admin seulement) — avec upload photo
router.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, stock_qty, category_id } = req.body;

    if (!name || !price)
      return res.status(400).json({ message: 'Nom et prix obligatoires' });

    // req.file.path = l'URL Cloudinary après upload automatique
    const image_url = req.file ? req.file.path : null;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, stock_qty, category_id, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || null, price, stock_qty || 0, category_id || null, image_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── PUT /api/products/:id ─────────────────────────────────
// Modifier un produit (admin)
router.put('/:id', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, stock_qty, category_id, is_active } = req.body;

    // Récupérer l'ancienne image pour la supprimer si elle est remplacée
    const current = await pool.query('SELECT image_url FROM products WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ message: 'Produit non trouvé' });

    let image_url = current.rows[0].image_url;

    if (req.file) {
      // Supprimer l'ancienne photo de Cloudinary
      if (image_url) {
        const publicId = image_url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      image_url = req.file.path;
    }

    const result = await pool.query(
      `UPDATE products
       SET name=$1, description=$2, price=$3, stock_qty=$4,
           category_id=$5, image_url=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, description, price, stock_qty, category_id, image_url, is_active ?? true, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── PATCH /api/products/:id/stock ─────────────────────────
// Mise à jour rapide du stock seulement (pour le collègue)
router.patch('/:id/stock', protect, adminOnly, async (req, res) => {
  try {
    const { stock_qty } = req.body;

    if (stock_qty === undefined || stock_qty < 0)
      return res.status(400).json({ message: 'Quantité invalide' });

    const result = await pool.query(
      `UPDATE products SET stock_qty=$1, updated_at=NOW()
       WHERE id=$2 RETURNING id, name, stock_qty`,
      [stock_qty, req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: 'Produit non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── DELETE /api/products/:id ──────────────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Produit non trouvé' });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/products/:id/variants ────────────────────────
router.get('/:id/variants', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_variants WHERE product_id=$1 ORDER BY color, size',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/products/:id/variants ───────────────────────
router.post('/:id/variants', protect, adminOnly, async (req, res) => {
  try {
    const { size, color, stock_qty } = req.body;
    const result = await pool.query(
      `INSERT INTO product_variants (product_id, size, color, stock_qty)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, size || null, color || null, stock_qty || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── PATCH /api/products/variants/:vid ─────────────────────
router.patch('/variants/:vid', protect, adminOnly, async (req, res) => {
  try {
    const { stock_qty } = req.body;
    const result = await pool.query(
      'UPDATE product_variants SET stock_qty=$1 WHERE id=$2 RETURNING *',
      [stock_qty, req.params.vid]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Variante non trouvée' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── DELETE /api/products/variants/:vid ────────────────────
router.delete('/variants/:vid', protect, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id=$1', [req.params.vid]);
    res.json({ message: 'Variante supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/products/:id/images ──────────────────────────
router.get('/:id/images', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_images WHERE product_id=$1 ORDER BY position',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/products/:id/images ─────────────────────────
router.post('/:id/images', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Image requise' });
    const { position = 0 } = req.body;
    const result = await pool.query(
      'INSERT INTO product_images (product_id, image_url, position) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.file.path, position]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── DELETE /api/products/images/:imgId ────────────────────
router.delete('/images/:imgId', protect, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM product_images WHERE id=$1 RETURNING *',
      [req.params.imgId]
    );
    if (result.rows[0]) {
      const publicId = result.rows[0].image_url.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
      await cloudinary.uploader.destroy(publicId);
    }
    res.json({ message: 'Image supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
