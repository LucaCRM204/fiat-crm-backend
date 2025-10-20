// routes/metas.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth'); // ← CORRECCIÓN AQUÍ

// ============================================
// GET - Obtener todas las metas
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM metas ORDER BY mes DESC');
    res.json(rows);
  } catch (error) {
    console.error('❌ Error obteniendo metas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET - Obtener meta específica por ID
// ============================================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM metas WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Error obteniendo meta:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST - Crear nueva meta
// ============================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { vendedor_id, mes, meta_ventas, meta_leads } = req.body;
    
    if (!vendedor_id || !mes || meta_ventas === undefined || meta_leads === undefined) {
      return res.status(400).json({ 
        error: 'Todos los campos son requeridos: vendedor_id, mes, meta_ventas, meta_leads' 
      });
    }

    // Verificar si ya existe
    const [existing] = await pool.query(
      'SELECT id FROM metas WHERE vendedor_id = ? AND mes = ?',
      [vendedor_id, mes]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        error: 'Ya existe una meta para este vendedor en este mes' 
      });
    }

    const [result] = await pool.query(
      'INSERT INTO metas (vendedor_id, mes, meta_ventas, meta_leads) VALUES (?, ?, ?, ?)',
      [vendedor_id, mes, meta_ventas, meta_leads]
    );
    
    const [newMeta] = await pool.query('SELECT * FROM metas WHERE id = ?', [result.insertId]);
    
    console.log(`✅ Meta creada: ID ${result.insertId}`);
    res.status(201).json(newMeta[0]);
  } catch (error) {
    console.error('❌ Error creando meta:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUT - Actualizar meta existente
// ============================================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { meta_ventas, meta_leads } = req.body;
    
    if (meta_ventas === undefined || meta_leads === undefined) {
      return res.status(400).json({ 
        error: 'Se requieren meta_ventas y meta_leads' 
      });
    }

    await pool.query(
      'UPDATE metas SET meta_ventas = ?, meta_leads = ? WHERE id = ?',
      [meta_ventas, meta_leads, id]
    );
    
    const [updated] = await pool.query('SELECT * FROM metas WHERE id = ?', [id]);
    
    console.log(`✅ Meta actualizada: ID ${id}`);
    res.json(updated[0]);
  } catch (error) {
    console.error('❌ Error actualizando meta:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE - Eliminar meta
// ============================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM metas WHERE id = ?', [id]);
    
    console.log(`✅ Meta eliminada: ID ${id}`);
    res.json({ success: true, message: 'Meta eliminada correctamente' });
  } catch (error) {
    console.error('❌ Error eliminando meta:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;