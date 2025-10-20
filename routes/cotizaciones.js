const express = require('express');
const router = express.Router();
const cotizacionesService = require('../services/cotizaciones');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/cotizaciones/lead/:leadId
 * Listar cotizaciones de un lead
 */
router.get('/lead/:leadId', authMiddleware, async (req, res) => {
  try {
    const cotizaciones = await cotizacionesService.listCotizaciones(
      parseInt(req.params.leadId)
    );
    res.json(cotizaciones);
  } catch (error) {
    console.error('Error listando cotizaciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cotizaciones/:id
 * Obtener cotización por ID
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const cotizacion = await cotizacionesService.getCotizacionById(
      parseInt(req.params.id)
    );

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    res.json(cotizacion);
  } catch (error) {
    console.error('Error obteniendo cotización:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cotizaciones
 * Crear nueva cotización
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      lead_id, 
      vehiculo, 
      precio_contado, 
      planes 
    } = req.body;

    // Validaciones
    if (!lead_id || !vehiculo || !precio_contado || !planes) {
      return res.status(400).json({ 
        error: 'Campos requeridos: lead_id, vehiculo, precio_contado, planes' 
      });
    }

    // Validar que precio_contado sea número positivo
    if (isNaN(precio_contado) || precio_contado <= 0) {
      return res.status(400).json({ 
        error: 'precio_contado debe ser un número positivo' 
      });
    }

    // Validar que planes sea un array
    if (!Array.isArray(planes) || planes.length === 0) {
      return res.status(400).json({ 
        error: 'planes debe ser un array con al menos un plan' 
      });
    }

    const cotizacion = await cotizacionesService.createCotizacion({
      ...req.body,
      created_by: req.user.id
    });

    res.status(201).json(cotizacion);
  } catch (error) {
    console.error('Error creando cotización:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cotizaciones/user/stats
 * Obtener estadísticas de cotizaciones del usuario
 */
router.get('/user/stats', authMiddleware, async (req, res) => {
  try {
    // TODO: Implementar estadísticas
    res.json({ 
      message: 'Estadísticas de cotizaciones',
      total: 0,
      este_mes: 0
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;