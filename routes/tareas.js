const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Obtener tareas del usuario
router.get('/mis-tareas', authMiddleware, async (req, res) => {
  try {
    const [tareas] = await req.db.query(
      `SELECT t.*, l.nombre, l.telefono, l.modelo, l.estado as lead_estado,
              u.name as created_by_name
       FROM tareas_seguimiento t
       JOIN leads l ON t.lead_id = l.id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.asignado_a = ?
       ORDER BY t.completada ASC, t.prioridad ASC, t.fecha_limite ASC`,
      [req.user.id]
    );
    res.json(tareas);
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// Obtener tareas creadas por el usuario (para supervisores/gerentes)
router.get('/asignadas', authMiddleware, async (req, res) => {
  try {
    const [tareas] = await req.db.query(
      `SELECT t.*, l.nombre, l.telefono, l.modelo, l.estado as lead_estado,
              u.name as asignado_nombre
       FROM tareas_seguimiento t
       JOIN leads l ON t.lead_id = l.id
       JOIN users u ON t.asignado_a = u.id
       WHERE t.created_by = ?
       ORDER BY t.completada ASC, t.prioridad ASC, t.fecha_limite ASC`,
      [req.user.id]
    );
    res.json(tareas);
  } catch (error) {
    console.error('Error obteniendo tareas asignadas:', error);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// Crear tarea
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { lead_id, asignado_a, tipo, prioridad, fecha_limite, descripcion, manual } = req.body;
    
    if (!lead_id || !asignado_a || !tipo || !fecha_limite || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const [result] = await req.db.query(
      `INSERT INTO tareas_seguimiento 
       (lead_id, asignado_a, tipo, prioridad, fecha_limite, descripcion, manual, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lead_id, asignado_a, tipo, prioridad || 'media', fecha_limite, descripcion, manual || false, req.user.id]
    );

    const [tarea] = await req.db.query(
      `SELECT t.*, l.nombre, l.telefono, l.modelo, u.name as created_by_name
       FROM tareas_seguimiento t
       JOIN leads l ON t.lead_id = l.id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    res.json(tarea[0]);
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// Completar tarea
router.patch('/:id/completar', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que la tarea pertenece al usuario
    const [tarea] = await req.db.query('SELECT * FROM tareas_seguimiento WHERE id = ?', [id]);
    
    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const canComplete = tarea[0].asignado_a === req.user.id || 
                       tarea[0].created_by === req.user.id;

    if (!canComplete) {
      return res.status(403).json({ error: 'No tienes permiso para completar esta tarea' });
    }

    await req.db.query(
      'UPDATE tareas_seguimiento SET completada = TRUE, completed_at = NOW() WHERE id = ?',
      [id]
    );

    const [tareaActualizada] = await req.db.query(
      `SELECT t.*, l.nombre, l.telefono, l.modelo
       FROM tareas_seguimiento t
       JOIN leads l ON t.lead_id = l.id
       WHERE t.id = ?`,
      [id]
    );

    res.json(tareaActualizada[0]);
  } catch (error) {
    console.error('Error completando tarea:', error);
    res.status(500).json({ error: 'Error al completar tarea' });
  }
});

// Eliminar tarea
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [tarea] = await req.db.query('SELECT * FROM tareas_seguimiento WHERE id = ?', [id]);
    
    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const canDelete = tarea[0].created_by === req.user.id || 
                     ['owner', 'director', 'gerente'].includes(req.user.role);

    if (!canDelete) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
    }

    await req.db.query('DELETE FROM tareas_seguimiento WHERE id = ?', [id]);
    res.json({ message: 'Tarea eliminada' });
  } catch (error) {
    console.error('Error eliminando tarea:', error);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

module.exports = router;