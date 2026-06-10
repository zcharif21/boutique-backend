const jwt = require('jsonwebtoken');

// ── Middleware : vérifie que le token JWT est valide ──────
const protect = (req, res, next) => {
  // Le token arrive dans le header : Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Non autorisé — token manquant' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify décode et vérifie la signature avec notre secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role } disponible dans les routes
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// ── Middleware : réservé aux admins uniquement ────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Accès refusé — admin requis' });
  }
  next();
};

module.exports = { protect, adminOnly };
