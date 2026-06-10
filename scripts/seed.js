#!/usr/bin/env node
/**
 * Script de données de test
 * Usage : node scripts/seed.js
 *
 * Insère des produits exemples pour tester le site
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SAMPLE_PRODUCTS = [
  { name: 'Robe Florale Été',        category: 'femme',      price: 3500, stock: 15, description: 'Robe légère à fleurs, idéale pour l\'été.' },
  { name: 'Blouse en Lin Blanc',     category: 'femme',      price: 2800, stock: 20, description: 'Blouse en lin naturel, coupe décontractée.' },
  { name: 'Jupe Midi Plissée',       category: 'femme',      price: 3200, stock: 12, description: 'Jupe midi élégante, taille haute.' },
  { name: 'Chemise Oxford Homme',    category: 'homme',      price: 3800, stock: 18, description: 'Chemise classique Oxford, coupe droite.' },
  { name: 'Jean Slim Homme',         category: 'homme',      price: 4500, stock: 25, description: 'Jean slim confortable, coupe moderne.' },
  { name: 'Polo Coton Homme',        category: 'homme',      price: 2500, stock: 30, description: 'Polo en coton 100%, disponible en 5 couleurs.' },
  { name: 'Pyjama Enfant Étoiles',   category: 'enfant',     price: 1800, stock: 22, description: 'Pyjama doux imprimé étoiles, 2-8 ans.' },
  { name: 'Ensemble Jogger Enfant',  category: 'enfant',     price: 2400, stock: 16, description: 'Ensemble veste + pantalon jogging, 4-12 ans.' },
  { name: 'Body Nouveau-né 3 pcs',   category: 'nouveau-ne', price: 1500, stock: 40, description: 'Lot de 3 bodies en coton doux, 0-6 mois.' },
  { name: 'Combinaison Bébé Nuage',  category: 'nouveau-ne', price: 1900, stock: 28, description: 'Combinaison imprimée nuages, coton bio.' },
];

async function main() {
  try {
    console.log('🌱 Insertion des produits de test...\n');

    for (const p of SAMPLE_PRODUCTS) {
      // Récupérer l'id de la catégorie
      const cat = await pool.query('SELECT id FROM categories WHERE slug = $1', [p.category]);
      if (!cat.rows[0]) {
        console.log(`⚠️  Catégorie "${p.category}" non trouvée, skipping...`);
        continue;
      }

      // Insérer le produit
      const result = await pool.query(
        `INSERT INTO products (name, description, price, stock_qty, category_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [p.name, p.description, p.price, p.stock, cat.rows[0].id]
      );

      if (result.rows[0]) {
        console.log(`  ✅ ${p.name} (${p.price} DA, stock: ${p.stock})`);
      } else {
        console.log(`  ⏭️  ${p.name} — déjà existant`);
      }
    }

    console.log('\n✅ Seed terminé !');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
