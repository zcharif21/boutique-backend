const express = require('express');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const router = express.Router();

// GET /api/users/me
router.get('/me', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/users/me
router.put('/me', protect, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let query, params;

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET name=$1, email=$2, password_hash=$3 WHERE id=$4 RETURNING id, name, email, role';
      params = [name, email, hashed, req.user.id];
    } else {
      query = 'UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email, role';
      params = [name, email, req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/users — liste + recherche (admin uniquement) ─
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { search } = req.query;
    let query  = 'SELECT id, name, email, role, created_at FROM users';
    let params = [];

    if (search) {
      query += ' WHERE name ILIKE $1 OR email ILIKE $1';
      params = [`%${search}%`];
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── PUT /api/users/:id/reset-password — admin uniquement ──
// Génère un nouveau mot de passe et le retourne en clair UNE FOIS,
// pour que l'admin le transmette au client (WhatsApp/Insta).
router.put('/:id/reset-password', protect, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const newPassword = Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4);
    const hashed = await bcrypt.hash(newPassword, 10);

    const result = await pool.query(
      'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id, name, email',
      [hashed, id]
    );

    if (!result.rows[0])
      return res.status(404).json({ message: 'Utilisateur non trouvé' });

    res.json({ user: result.rows[0], newPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;