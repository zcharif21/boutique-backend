require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes       = require('./routes/auth');
const productRoutes    = require('./routes/products');
const orderRoutes      = require('./routes/orders');
const categoryRoutes   = require('./routes/categories');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middlewares globaux ───────────────────────────────────

// CORS : autorise le frontend (Next.js) à appeler le backend
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://ta-boutique.vercel.app', // à changer avec ton URL Vercel
  ],
  credentials: true,
}));

app.use(express.json());          // parse les corps JSON
app.use(express.urlencoded({ extended: true })); // parse les formulaires

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/categories', categoryRoutes);

// ── Route de santé (health check) ────────────────────────
// Render et autres hébergeurs pingent cette route pour vérifier que le serveur tourne
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Gestion des routes non trouvées ──────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} introuvable` });
});

// ── Gestion globale des erreurs ───────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err.stack);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

// ── Démarrage ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`   Mode : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health : http://localhost:${PORT}/health`);
});
