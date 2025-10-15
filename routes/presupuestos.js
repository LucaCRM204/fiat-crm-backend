const express = require('express');
const router = express.Router();
const { authMiddleware, checkRole } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Listar presupuestos
router.get('/', async (req, res) => {
  try {
    const [presupuestos] = await req.db.query(`
      SELECT * FROM presupuestos 
      WHERE activo = 1 
      ORDER BY created_at DESC
    `);
    
    const presupuestosWithParsedPlanes = presupuestos.map(p => ({
      ...p,
      planes_cuotas: typeof p.planes_cuotas === 'string' 
        ? JSON.parse(p.planes_cuotas) 
        : p.planes_cuotas,
      activo: Boolean(p.activo)
    }));
    
    console.log(`📋 Listado de ${presupuestos.length} presupuestos activos`);
    res.json(presupuestosWithParsedPlanes);
  } catch (error) {
    console.error('Error al listar presupuestos:', error);
    res.status(500).json({ error: 'Error al obtener presupuestos' });
  }
});

// Obtener un presupuesto específico
router.get('/:id', async (req, res) => {
  try {
    const [presupuestos] = await req.db.query(
      'SELECT * FROM presupuestos WHERE id = ?',
      [req.params.id]
    );

    if (presupuestos.length === 0) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    const presupuesto = presupuestos[0];
    presupuesto.planes_cuotas = typeof presupuesto.planes_cuotas === 'string'
      ? JSON.parse(presupuesto.planes_cuotas)
      : presupuesto.planes_cuotas;
    presupuesto.activo = Boolean(presupuesto.activo);

    res.json(presupuesto);
  } catch (error) {
    console.error('Error al obtener presupuesto:', error);
    res.status(500).json({ error: 'Error al obtener presupuesto' });
  }
});

// Crear presupuesto (solo owner)
router.post('/', checkRole('owner'), async (req, res) => {
  try {
    const {
      modelo,
      marca,
      imagen_url,
      precio_contado,
      especificaciones_tecnicas,
      planes_cuotas,
      bonificaciones,
      anticipo,
      activo
    } = req.body;

    if (!modelo || !marca) {
      return res.status(400).json({ error: 'Modelo y marca son requeridos' });
    }

    const planesJson = planes_cuotas ? JSON.stringify(planes_cuotas) : null;

    const [result] = await req.db.query(
      `INSERT INTO presupuestos 
      (modelo, marca, imagen_url, precio_contado, especificaciones_tecnicas, planes_cuotas, bonificaciones, anticipo, activo, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        modelo,
        marca,
        imagen_url || null,
        precio_contado || null,
        especificaciones_tecnicas || null,
        planesJson,
        bonificaciones || null,
        anticipo || null,
        activo !== undefined ? (activo ? 1 : 0) : 1,
        req.user.id
      ]
    );

    const [newPresupuesto] = await req.db.query(
      'SELECT * FROM presupuestos WHERE id = ?',
      [result.insertId]
    );
    
    const presupuesto = newPresupuesto[0];
    presupuesto.planes_cuotas = typeof presupuesto.planes_cuotas === 'string'
      ? JSON.parse(presupuesto.planes_cuotas)
      : presupuesto.planes_cuotas;
    presupuesto.activo = Boolean(presupuesto.activo);

    console.log(`✅ Presupuesto creado: ${marca} ${modelo}`);
    res.status(201).json(presupuesto);
  } catch (error) {
    console.error('Error al crear presupuesto:', error);
    res.status(500).json({ error: 'Error al crear presupuesto' });
  }
});

// Actualizar presupuesto (solo owner)
router.put('/:id', checkRole('owner'), async (req, res) => {
  try {
    const presupuestoId = req.params.id;
    const {
      modelo,
      marca,
      imagen_url,
      precio_contado,
      especificaciones_tecnicas,
      planes_cuotas,
      bonificaciones,
      anticipo,
      activo
    } = req.body;

    const [presupuestos] = await req.db.query(
      'SELECT id FROM presupuestos WHERE id = ?',
      [presupuestoId]
    );

    if (presupuestos.length === 0) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    const planesJson = planes_cuotas ? JSON.stringify(planes_cuotas) : null;

    await req.db.query(
      `UPDATE presupuestos SET 
      modelo = ?, marca = ?, imagen_url = ?, precio_contado = ?, 
      especificaciones_tecnicas = ?, planes_cuotas = ?, bonificaciones = ?, 
      anticipo = ?, activo = ? 
      WHERE id = ?`,
      [
        modelo,
        marca,
        imagen_url || null,
        precio_contado || null,
        especificaciones_tecnicas || null,
        planesJson,
        bonificaciones || null,
        anticipo || null,
        activo !== undefined ? (activo ? 1 : 0) : 1,
        presupuestoId
      ]
    );

    const [updatedPresupuesto] = await req.db.query(
      'SELECT * FROM presupuestos WHERE id = ?',
      [presupuestoId]
    );
    
    const presupuesto = updatedPresupuesto[0];
    presupuesto.planes_cuotas = typeof presupuesto.planes_cuotas === 'string'
      ? JSON.parse(presupuesto.planes_cuotas)
      : presupuesto.planes_cuotas;
    presupuesto.activo = Boolean(presupuesto.activo);

    console.log(`✅ Presupuesto actualizado: ${marca} ${modelo}`);
    res.json(presupuesto);
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    res.status(500).json({ error: 'Error al actualizar presupuesto' });
  }
});

// Eliminar presupuesto (solo owner)
router.delete('/:id', checkRole('owner'), async (req, res) => {
  try {
    const presupuestoId = req.params.id;

    const [presupuestos] = await req.db.query(
      'SELECT modelo, marca FROM presupuestos WHERE id = ?',
      [presupuestoId]
    );

    if (presupuestos.length === 0) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    await req.db.query('DELETE FROM presupuestos WHERE id = ?', [presupuestoId]);

    console.log(`🗑️ Presupuesto eliminado: ${presupuestos[0].marca} ${presupuestos[0].modelo}`);
    res.json({ ok: true, message: 'Presupuesto eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar presupuesto:', error);
    res.status(500).json({ error: 'Error al eliminar presupuesto' });
  }
});

module.exports = router;