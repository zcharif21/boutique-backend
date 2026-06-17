const express = require('express');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { protect } = require('../middleware/authMiddleware');
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
      query = 'UPDATE users SET name=$1, email=$2, password=$3 WHERE id=$4 RETURNING id, name, email, role';
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

module.exports = router;