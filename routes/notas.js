const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Obtener notas de un lead
router.get('/lead/:leadId', authMiddleware, async (req, res) => {
  try {
    const { leadId } = req.params;
    const [notas] = await req.db.query(
      `SELECT ni.*, u.name as usuario 
       FROM notas_internas ni
       JOIN users u ON ni.user_id = u.id
       WHERE ni.lead_id = ?
       ORDER BY ni.created_at DESC`,
      [leadId]
    );
    res.json(notas);
  } catch (error) {
    console.error('Error obteniendo notas:', error);
    res.status(500).json({ error: 'Error al obtener notas' });
  }
});

// Crear nota interna
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { lead_id, texto } = req.body;
    
    if (!lead_id || !texto) {
      return res.status(400).json({ error: 'lead_id y texto son requeridos' });
    }

    const [result] = await req.db.query(
      'INSERT INTO notas_internas (lead_id, user_id, texto) VALUES (?, ?, ?)',
      [lead_id, req.user.id, texto]
    );

    const [nota] = await req.db.query(
      `SELECT ni.*, u.name as usuario 
       FROM notas_internas ni
       JOIN users u ON ni.user_id = u.id
       WHERE ni.id = ?`,
      [result.insertId]
    );

    res.json(nota[0]);
  } catch (error) {
    console.error('Error creando nota:', error);
    res.status(500).json({ error: 'Error al crear nota' });
  }
});

// Eliminar nota
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que la nota pertenece al usuario o que el usuario es manager
    const [nota] = await req.db.query('SELECT * FROM notas_internas WHERE id = ?', [id]);
    
    if (nota.length === 0) {
      return res.status(404).json({ error: 'Nota no encontrada' });
    }

    const canDelete = nota[0].user_id === req.user.id || 
                     ['owner', 'director', 'gerente'].includes(req.user.role);

    if (!canDelete) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta nota' });
    }

    await req.db.query('DELETE FROM notas_internas WHERE id = ?', [id]);
    res.json({ message: 'Nota eliminada' });
  } catch (error) {
    console.error('Error eliminando nota:', error);
    res.status(500).json({ error: 'Error al eliminar nota' });
  }
});

module.exports = router;