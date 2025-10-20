const express = require('express');
const router = express.Router();
const recordatoriosService = require('../services/recordatorios');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/recordatorios
 * Listar recordatorios del usuario según su rol
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const recordatorios = await recordatoriosService.listRecordatorios(
      req.user.id,
      req.user.role
    );
    res.json(recordatorios);
  } catch (error) {
    console.error('Error listando recordatorios:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recordatorios
 * Crear nuevo recordatorio
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { lead_id, fecha, hora, descripcion } = req.body;

    // Validaciones
    if (!lead_id || !fecha || !hora || !descripcion) {
      return res.status(400).json({ 
        error: 'Campos requeridos: lead_id, fecha, hora, descripcion' 
      });
    }

    const recordatorio = await recordatoriosService.createRecordatorio({
      ...req.body,
      created_by: req.user.id
    });

    res.status(201).json(recordatorio);
  } catch (error) {
    console.error('Error creando recordatorio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/recordatorios/:id
 * Actualizar recordatorio (marcar completado)
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const recordatorio = await recordatoriosService.updateRecordatorio(
      parseInt(req.params.id),
      req.body
    );

    if (!recordatorio) {
      return res.status(404).json({ error: 'Recordatorio no encontrado' });
    }

    res.json(recordatorio);
  } catch (error) {
    console.error('Error actualizando recordatorio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/recordatorios/:id
 * Eliminar recordatorio
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await recordatoriosService.deleteRecordatorio(parseInt(req.params.id));
    res.json({ ok: true, message: 'Recordatorio eliminado' });
  } catch (error) {
    console.error('Error eliminando recordatorio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recordatorios/pendientes
 * Obtener recordatorios pendientes (para el sistema de notificaciones)
 */
router.get('/pendientes', authMiddleware, async (req, res) => {
  try {
    // Solo admins pueden ver todos los pendientes
    if (!['owner', 'director'].includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para ver todos los recordatorios pendientes' 
      });
    }

    const pendientes = await recordatoriosService.getRecordatoriosPendientes();
    res.json(pendientes);
  } catch (error) {
    console.error('Error obteniendo recordatorios pendientes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/recordatorios/lead/:leadId
 * Obtener recordatorios de un lead específico
 */
router.get('/lead/:leadId', authMiddleware, async (req, res) => {
  try {
    const recordatorios = await recordatoriosService.listRecordatorios(
      req.user.id,
      req.user.role
    );

    const leadRecordatorios = recordatorios.filter(
      r => r.lead_id === parseInt(req.params.leadId)
    );

    res.json(leadRecordatorios);
  } catch (error) {
    console.error('Error obteniendo recordatorios del lead:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;