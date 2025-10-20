const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth'); // ✅ CAMBIADO

// Obtener recordatorios de un lead
router.get('/lead/:leadId', authMiddleware, async (req, res) => { // ✅ CAMBIADO
  try {
    const { leadId } = req.params;
    const [recordatorios] = await db.query(
      'SELECT * FROM recordatorios WHERE lead_id = ? ORDER BY fecha DESC, hora DESC',
      [leadId]
    );
    res.json(recordatorios);
  } catch (error) {
    console.error('Error obteniendo recordatorios:', error);
    res.status(500).json({ error: 'Error al obtener recordatorios' });
  }
});

// Crear recordatorio
router.post('/', authMiddleware, async (req, res) => { // ✅ CAMBIADO
  try {
    const { lead_id, fecha, hora, descripcion } = req.body;
    
    if (!lead_id || !fecha || !hora || !descripcion) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const [result] = await db.query(
      'INSERT INTO recordatorios (lead_id, fecha, hora, descripcion) VALUES (?, ?, ?, ?)',
      [lead_id, fecha, hora, descripcion]
    );

    const [recordatorio] = await db.query(
      'SELECT * FROM recordatorios WHERE id = ?',
      [result.insertId]
    );

    res.json(recordatorio[0]);
  } catch (error) {
    console.error('Error creando recordatorio:', error);
    res.status(500).json({ error: 'Error al crear recordatorio' });
  }
});

// Actualizar recordatorio (marcar como completado)
router.patch('/:id', authMiddleware, async (req, res) => { // ✅ CAMBIADO
  try {
    const { id } = req.params;
    const { completado } = req.body;

    await db.query(
      'UPDATE recordatorios SET completado = ? WHERE id = ?',
      [completado, id]
    );

    const [recordatorio] = await db.query(
      'SELECT * FROM recordatorios WHERE id = ?',
      [id]
    );

    res.json(recordatorio[0]);
  } catch (error) {
    console.error('Error actualizando recordatorio:', error);
    res.status(500).json({ error: 'Error al actualizar recordatorio' });
  }
});

// Eliminar recordatorio
router.delete('/:id', authMiddleware, async (req, res) => { // ✅ CAMBIADO
  try {
    const { id } = req.params;
    await db.query('DELETE FROM recordatorios WHERE id = ?', [id]);
    res.json({ message: 'Recordatorio eliminado' });
  } catch (error) {
    console.error('Error eliminando recordatorio:', error);
    res.status(500).json({ error: 'Error al eliminar recordatorio' });
  }
});

// Obtener recordatorios pendientes del usuario actual
router.get('/pendientes', authMiddleware, async (req, res) => { // ✅ CAMBIADO
  try {
    const [recordatorios] = await db.query(
      `SELECT r.*, l.nombre, l.telefono, l.modelo 
       FROM recordatorios r
       JOIN leads l ON r.lead_id = l.id
       WHERE l.assigned_to = ? AND r.completado = FALSE
       AND CONCAT(r.fecha, ' ', r.hora) <= NOW() + INTERVAL 1 HOUR
       ORDER BY r.fecha, r.hora`,
      [req.user.id]
    );
    res.json(recordatorios);
  } catch (error) {
    console.error('Error obteniendo recordatorios pendientes:', error);
    res.status(500).json({ error: 'Error al obtener recordatorios' });
  }
});

module.exports = router;