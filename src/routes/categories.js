const express = require('express');
const pool    = require('../db');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/categories — liste publique
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id AND p.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/categories — admin seulement
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, slug, image_url } = req.body;
    if (!name || !slug)
      return res.status(400).json({ message: 'Nom et slug requis' });

    const result = await pool.query(
      'INSERT INTO categories (name, slug, image_url) VALUES ($1,$2,$3) RETURNING *',
      [name, slug, image_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') // unique violation
      return res.status(409).json({ message: 'Ce slug existe déjà' });
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
