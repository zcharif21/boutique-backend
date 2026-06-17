#!/usr/bin/env node
/**
 * Script de création du compte admin
 * Usage : node scripts/create-admin.js
 *
 * Remplis les variables ci-dessous puis exécute :
 *   cd backend && node scripts/create-admin.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

// ── CONFIGURE ICI ──────────────────────────────────────────
const ADMIN = {
  name:     'Admin',
  email:    'admin@originaluk.dz',
  password: 'OriginalUK2024',
};
// ───────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Vérifier si l'email existe déjà
    const exists = await pool.query(
      'SELECT id, role FROM users WHERE email = $1', [ADMIN.email]
    );

    if (exists.rows.length > 0) {
      const user = exists.rows[0];
      if (user.role === 'admin') {
        console.log(`✅ L'admin "${ADMIN.email}" existe déjà (id: ${user.id})`);
      } else {
        // Promouvoir en admin
        await pool.query("UPDATE users SET role='admin' WHERE id=$1", [user.id]);
        console.log(`✅ Utilisateur promu admin (id: ${user.id})`);
      }
      return;
    }

    // Créer le compte admin
    const hash = await bcrypt.hash(ADMIN.password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin') RETURNING id`,
      [ADMIN.name, ADMIN.email, hash]
    );

    console.log('');
    console.log('✅ Compte admin créé avec succès !');
    console.log('─────────────────────────────────');
    console.log(`   ID       : ${result.rows[0].id}`);
    console.log(`   Email    : ${ADMIN.email}`);
    console.log(`   Password : ${ADMIN.password}`);
    console.log('─────────────────────────────────');
    console.log('⚠️  Note le mot de passe dans un endroit sûr !');
    console.log('');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
