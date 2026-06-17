const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Générer un token JWT ──────────────────────────────────
const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── POST /api/auth/register ───────────────────────────────
// Créer un nouveau compte client
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Tous les champs sont requis' });

    // Vérifier si l'email existe déjà
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0)
      return res.status(409).json({ message: 'Email déjà utilisé' });

    // Hasher le mot de passe (10 rounds = très sécurisé)
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'client') RETURNING id, name, email, role`,
      [name, email, hash]
    );

    const user = result.rows[0];
    res.status(201).json({ token: generateToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );
    const user = result.rows[0];

    // Même message si email inconnu ou mot de passe faux → sécurité
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    res.json({
      token: generateToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
// Récupérer le profil de l'utilisateur connecté
router.get('/me', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0])
      return res.status(404).json({ message: 'Utilisateur non trouvé' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Email introuvable' });

    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await pool.query(
      'UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE email=$3',
      [token, expires, email]
    );

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Réinitialisation de votre mot de passe — Original UK',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="color:#db2777">Original UK</h2>
          <p>Bonjour,</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#db2777;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
            Réinitialiser mon mot de passe
          </a>
          <p style="color:#666;font-size:14px">Ce lien expire dans 1 heure.</p>
          <p style="color:#666;font-size:14px">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        </div>
      `,
    });

    res.json({ message: 'Email envoyé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!result.rows[0]) return res.status(400).json({ message: 'Token invalide ou expiré' });

    const hashed = await require('bcryptjs').hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2',
      [hashed, result.rows[0].id]
    );

    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
