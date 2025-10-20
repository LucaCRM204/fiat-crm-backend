const express = require('express');
const router = express.Router();
const tareasService = require('../services/tareas');
const pushService = require('../services/pushNotifications');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/tareas
 * Listar tareas del usuario según su rol
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tareas = await tareasService.listTareas(
      req.user.id,
      req.user.role
    );
    res.json(tareas);
  } catch (error) {
    console.error('Error listando tareas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tareas
 * Crear nueva tarea
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      lead_id, 
      assigned_to, 
      tipo, 
      prioridad, 
      fecha_limite, 
      descripcion 
    } = req.body;

    // Validaciones
    if (!lead_id || !assigned_to || !tipo || !prioridad || !fecha_limite || !descripcion) {
      return res.status(400).json({ 
        error: 'Campos requeridos: lead_id, assigned_to, tipo, prioridad, fecha_limite, descripcion' 
      });
    }

    // Validar tipo
    const tiposValidos = ['llamar', 'whatsapp', 'email', 'cotizar', 'seguimiento'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ 
        error: `tipo debe ser uno de: ${tiposValidos.join(', ')}` 
      });
    }

    // Validar prioridad
    const prioridadesValidas = ['alta', 'media', 'baja'];
    if (!prioridadesValidas.includes(prioridad)) {
      return res.status(400).json({ 
        error: `prioridad debe ser uno de: ${prioridadesValidas.join(', ')}` 
      });
    }

    const tarea = await tareasService.createTarea(req.body);

    // Si es prioridad alta, enviar notificación push
    if (prioridad === 'alta') {
      try {
        await pushService.notifyTareaUrgente(tarea);
      } catch (pushError) {
        console.error('Error enviando notificación de tarea:', pushError);
        // No fallar la creación si falla el push
      }
    }

    res.status(201).json(tarea);
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tareas/:id/completar
 * Marcar tarea como completada
 */
router.put('/:id/completar', authMiddleware, async (req, res) => {
  try {
    const tarea = await tareasService.completeTarea(parseInt(req.params.id));

    if (!tarea) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    res.json(tarea);
  } catch (error) {
    console.error('Error completando tarea:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tareas/urgentes
 * Obtener tareas urgentes sin completar
 */
router.get('/urgentes', authMiddleware, async (req, res) => {
  try {
    const urgentes = await tareasService.getTareasUrgentes();
    res.json(urgentes);
  } catch (error) {
    console.error('Error obteniendo tareas urgentes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tareas/generar-automaticas
 * Forzar generación de tareas automáticas (solo admins)
 */
router.post('/generar-automaticas', authMiddleware, async (req, res) => {
  try {
    // Solo admins pueden forzar generación
    if (!['owner', 'director'].includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para generar tareas automáticas' 
      });
    }

    const tareas = await tareasService.generarTareasAutomaticas();
    
    res.json({ 
      ok: true, 
      message: `${tareas.length} tareas generadas`,
      tareas 
    });
  } catch (error) {
    console.error('Error generando tareas automáticas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tareas/lead/:leadId
 * Obtener tareas de un lead específico
 */
router.get('/lead/:leadId', authMiddleware, async (req, res) => {
  try {
    const todasLasTareas = await tareasService.listTareas(
      req.user.id,
      req.user.role
    );

    const leadTareas = todasLasTareas.filter(
      t => t.lead_id === parseInt(req.params.leadId)
    );

    res.json(leadTareas);
  } catch (error) {
    console.error('Error obteniendo tareas del lead:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tareas/stats
 * Obtener estadísticas de tareas del usuario
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const tareas = await tareasService.listTareas(
      req.user.id,
      req.user.role
    );

    const stats = {
      total: tareas.length,
      alta: tareas.filter(t => t.prioridad === 'alta').length,
      media: tareas.filter(t => t.prioridad === 'media').length,
      baja: tareas.filter(t => t.prioridad === 'baja').length,
      por_tipo: {
        llamar: tareas.filter(t => t.tipo === 'llamar').length,
        whatsapp: tareas.filter(t => t.tipo === 'whatsapp').length,
        email: tareas.filter(t => t.tipo === 'email').length,
        cotizar: tareas.filter(t => t.tipo === 'cotizar').length,
        seguimiento: tareas.filter(t => t.tipo === 'seguimiento').length,
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas de tareas:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;