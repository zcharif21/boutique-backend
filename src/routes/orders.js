const express = require('express');
const pool    = require('../db');
const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// ── POST /api/orders ──────────────────────────────────────
// Passer une commande (client connecté)
router.post('/', protect, async (req, res) => {
  const client = await pool.connect(); // transaction pour garantir la cohérence
  try {
    const { items, address, phone, notes } = req.body;
    // items = [{ product_id: 1, quantity: 2 }, ...]

    if (!items || items.length === 0)
      return res.status(400).json({ message: 'Panier vide' });

    await client.query('BEGIN');

    let total = 0;
    const enriched = [];

    // Vérifier stock et calculer le total pour chaque article
    for (const item of items) {
      const prod = await client.query(
        'SELECT id, name, price, stock_qty FROM products WHERE id=$1 AND is_active=TRUE',
        [item.product_id]
      );
      if (!prod.rows[0])
        throw new Error(`Produit ${item.product_id} introuvable`);
      if (prod.rows[0].stock_qty < item.quantity)
        throw new Error(`Stock insuffisant pour "${prod.rows[0].name}"`);

      total += prod.rows[0].price * item.quantity;
      enriched.push({ ...prod.rows[0], quantity: item.quantity });
    }

    // Créer la commande
    const order = await client.query(
      `INSERT INTO orders (user_id, total, address, phone, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, total, address, phone, notes]
    );

    // Insérer les lignes et décrémenter le stock
    for (const item of enriched) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [order.rows[0].id, item.id, item.quantity, item.price]
      );
      await client.query(
        'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
        [item.quantity, item.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ order: order.rows[0], items: enriched });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ message: err.message || 'Erreur lors de la commande' });
  } finally {
    client.release();
  }
});

// ── GET /api/orders ───────────────────────────────────────
// Mes commandes (client) ou toutes (admin)
router.get('/', protect, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT o.*, u.name AS client_name, u.email AS client_email
         FROM orders o LEFT JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC`
      );
    } else {
      result = await pool.query(
        'SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC',
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/orders/:id ───────────────────────────────────
// Détail d'une commande avec ses produits
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ message: 'Commande non trouvée' });

    // Seul l'admin ou le propriétaire peut voir la commande
    if (req.user.role !== 'admin' && order.rows[0].user_id !== req.user.id)
      return res.status(403).json({ message: 'Accès refusé' });

    const items = await pool.query(
      `SELECT oi.*, p.name, p.image_url
       FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );

    res.json({ ...order.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── PATCH /api/orders/:id/status ──────────────────────────
// Changer le statut d'une commande (admin)
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['en_attente', 'confirmee', 'expediee', 'livree', 'annulee'];
    if (!valid.includes(status))
      return res.status(400).json({ message: 'Statut invalide' });

    const client = await pool.connect();
    await client.query('BEGIN');

    const prev = await client.query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
    if (!prev.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ message: 'Commande non trouvée' }); }

    const result = await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);

    // Si annulée → restaurer le stock
    if (status === 'annulee' && prev.rows[0].status !== 'annulee') {
      const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id=$1', [req.params.id]);
      for (const item of items.rows) {
        await client.query('UPDATE products SET stock_qty = stock_qty + $1 WHERE id=$2', [item.quantity, item.product_id]);
      }
    }

    await client.query('COMMIT');
    client.release();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
