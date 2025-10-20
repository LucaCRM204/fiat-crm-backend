const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

// Middleware para verificar permisos de gestión de metas
const canManageMetas = (req, res, next) => {
  const allowedRoles = ['owner', 'director', 'gerente', 'supervisor'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permisos para gestionar metas' });
  }
  next();
};

// GET /api/metas - Obtener todas las metas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { mes, vendedor_id } = req.query;
    
    let query = `
      SELECT m.*, 
             u.name as vendedor_name,
             creator.name as created_by_name
      FROM metas m
      LEFT JOIN users u ON m.vendedor_id = u.id
      LEFT JOIN users creator ON m.created_by = creator.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (mes) {
      query += ' AND m.mes = ?';
      params.push(mes);
    }
    
    if (vendedor_id) {
      query += ' AND m.vendedor_id = ?';
      params.push(vendedor_id);
    }
    
    query += ' ORDER BY m.mes DESC, u.name ASC';
    
    const [metas] = await db.query(query, params);
    res.json(metas);
  } catch (error) {
    console.error('Error obteniendo metas:', error);
    res.status(500).json({ error: 'Error al obtener metas' });
  }
});

// GET /api/metas/:id - Obtener una meta específica
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [metas] = await db.query(
      `SELECT m.*, 
              u.name as vendedor_name,
              creator.name as created_by_name
       FROM metas m
       LEFT JOIN users u ON m.vendedor_id = u.id
       LEFT JOIN users creator ON m.created_by = creator.id
       WHERE m.id = ?`,
      [req.params.id]
    );
    
    if (metas.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    res.json(metas[0]);
  } catch (error) {
    console.error('Error obteniendo meta:', error);
    res.status(500).json({ error: 'Error al obtener meta' });
  }
});

// POST /api/metas - Crear nueva meta
router.post('/', authenticateToken, canManageMetas, async (req, res) => {
  try {
    const { vendedor_id, mes, meta_ventas, meta_leads } = req.body;
    
    // Validaciones
    if (!vendedor_id || !mes || meta_ventas === undefined || meta_leads === undefined) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: vendedor_id, mes, meta_ventas, meta_leads' 
      });
    }
    
    // Validar formato del mes (YYYY-MM)
    const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!mesRegex.test(mes)) {
      return res.status(400).json({ 
        error: 'Formato de mes inválido. Use YYYY-MM (ej: 2024-10)' 
      });
    }
    
    // Validar que meta_ventas y meta_leads sean números positivos
    if (meta_ventas < 0 || meta_leads < 0) {
      return res.status(400).json({ 
        error: 'Las metas deben ser números positivos' 
      });
    }
    
    // Verificar que el vendedor existe y es vendedor
    const [vendedor] = await db.query(
      'SELECT id, role FROM users WHERE id = ?',
      [vendedor_id]
    );
    
    if (vendedor.length === 0) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }
    
    if (vendedor[0].role !== 'vendedor') {
      return res.status(400).json({ error: 'El usuario debe tener rol de vendedor' });
    }
    
    // Verificar que no exista ya una meta para este vendedor en este mes
    const [existente] = await db.query(
      'SELECT id FROM metas WHERE vendedor_id = ? AND mes = ?',
      [vendedor_id, mes]
    );
    
    if (existente.length > 0) {
      return res.status(409).json({ 
        error: 'Ya existe una meta para este vendedor en este mes' 
      });
    }
    
    // Crear la meta
    const [result] = await db.query(
      `INSERT INTO metas (vendedor_id, mes, meta_ventas, meta_leads, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [vendedor_id, mes, meta_ventas, meta_leads, req.user.id]
    );
    
    // Obtener la meta creada con información adicional
    const [nuevaMeta] = await db.query(
      `SELECT m.*, 
              u.name as vendedor_name,
              creator.name as created_by_name
       FROM metas m
       LEFT JOIN users u ON m.vendedor_id = u.id
       LEFT JOIN users creator ON m.created_by = creator.id
       WHERE m.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json(nuevaMeta[0]);
  } catch (error) {
    console.error('Error creando meta:', error);
    res.status(500).json({ error: 'Error al crear meta' });
  }
});

// PUT /api/metas/:id - Actualizar meta existente
router.put('/:id', authenticateToken, canManageMetas, async (req, res) => {
  try {
    const { meta_ventas, meta_leads } = req.body;
    
    // Validaciones
    if (meta_ventas === undefined || meta_leads === undefined) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: meta_ventas, meta_leads' 
      });
    }
    
    if (meta_ventas < 0 || meta_leads < 0) {
      return res.status(400).json({ 
        error: 'Las metas deben ser números positivos' 
      });
    }
    
    // Verificar que la meta existe
    const [metaExistente] = await db.query(
      'SELECT id FROM metas WHERE id = ?',
      [req.params.id]
    );
    
    if (metaExistente.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    // Actualizar la meta
    await db.query(
      `UPDATE metas 
       SET meta_ventas = ?, meta_leads = ?
       WHERE id = ?`,
      [meta_ventas, meta_leads, req.params.id]
    );
    
    // Obtener la meta actualizada
    const [metaActualizada] = await db.query(
      `SELECT m.*, 
              u.name as vendedor_name,
              creator.name as created_by_name
       FROM metas m
       LEFT JOIN users u ON m.vendedor_id = u.id
       LEFT JOIN users creator ON m.created_by = creator.id
       WHERE m.id = ?`,
      [req.params.id]
    );
    
    res.json(metaActualizada[0]);
  } catch (error) {
    console.error('Error actualizando meta:', error);
    res.status(500).json({ error: 'Error al actualizar meta' });
  }
});

// DELETE /api/metas/:id - Eliminar meta
router.delete('/:id', authenticateToken, canManageMetas, async (req, res) => {
  try {
    // Verificar que la meta existe
    const [metaExistente] = await db.query(
      'SELECT id FROM metas WHERE id = ?',
      [req.params.id]
    );
    
    if (metaExistente.length === 0) {
      return res.status(404).json({ error: 'Meta no encontrada' });
    }
    
    // Eliminar la meta
    await db.query('DELETE FROM metas WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Meta eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando meta:', error);
    res.status(500).json({ error: 'Error al eliminar meta' });
  }
});

// GET /api/metas/progreso/:vendedor_id/:mes - Obtener progreso del vendedor en un mes
router.get('/progreso/:vendedor_id/:mes', authenticateToken, async (req, res) => {
  try {
    const { vendedor_id, mes } = req.params;
    
    // Obtener la meta
    const [metas] = await db.query(
      'SELECT * FROM metas WHERE vendedor_id = ? AND mes = ?',
      [vendedor_id, mes]
    );
    
    if (metas.length === 0) {
      return res.json({
        tiene_meta: false,
        meta_ventas: 0,
        meta_leads: 0,
        ventas_reales: 0,
        leads_reales: 0,
        porcentaje_ventas: 0,
        porcentaje_leads: 0
      });
    }
    
    const meta = metas[0];
    
    // Calcular ventas y leads del mes
    const [year, month] = mes.split('-');
    const primerDia = `${mes}-01`;
    const ultimoDia = new Date(parseInt(year), parseInt(month), 0).getDate();
    const fechaFin = `${mes}-${ultimoDia}`;
    
    const [ventasData] = await db.query(
      `SELECT COUNT(*) as ventas
       FROM leads
       WHERE assigned_to = ?
       AND estado = 'vendido'
       AND DATE(last_status_change) BETWEEN ? AND ?`,
      [vendedor_id, primerDia, fechaFin]
    );
    
    const [leadsData] = await db.query(
      `SELECT COUNT(*) as leads
       FROM leads
       WHERE assigned_to = ?
       AND DATE(created_at) BETWEEN ? AND ?`,
      [vendedor_id, primerDia, fechaFin]
    );
    
    const ventas_reales = ventasData[0].ventas;
    const leads_reales = leadsData[0].leads;
    
    const porcentaje_ventas = meta.meta_ventas > 0 
      ? ((ventas_reales / meta.meta_ventas) * 100).toFixed(1)
      : 0;
    
    const porcentaje_leads = meta.meta_leads > 0
      ? ((leads_reales / meta.meta_leads) * 100).toFixed(1)
      : 0;
    
    res.json({
      tiene_meta: true,
      meta_ventas: meta.meta_ventas,
      meta_leads: meta.meta_leads,
      ventas_reales,
      leads_reales,
      porcentaje_ventas: parseFloat(porcentaje_ventas),
      porcentaje_leads: parseFloat(porcentaje_leads),
      cumple_meta_ventas: ventas_reales >= meta.meta_ventas,
      cumple_meta_leads: leads_reales >= meta.meta_leads
    });
  } catch (error) {
    console.error('Error obteniendo progreso:', error);
    res.status(500).json({ error: 'Error al obtener progreso' });
  }
});

module.exports = router;