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
    
    // Parse planes_cuotas JSON
    const presupuestosWithParsedPlanes = presupuestos.map(p => ({
      ...p,
      planes_cuotas: p.planes_cuotas ? JSON.parse(p.planes_cuotas) : null,
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
    presupuesto.planes_cuotas = presupuesto.planes_cuotas ? JSON.parse(presupuesto.planes_cuotas) : null;
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

    // Convertir planes_cuotas a JSON string si existe
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
    presupuesto.planes_cuotas = presupuesto.planes_cuotas ? JSON.parse(presupuesto.planes_cuotas) : null;
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
    presupuesto.planes_cuotas = presupuesto.planes_cuotas ? JSON.parse(presupuesto.planes_cuotas) : null;
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
router.post('/generar-pdf', authMiddleware, async (req, res) => {
  try {
    const {
      nombreVehiculo,
      valorMinimo,
      anticipo,
      bonificacionCuota,
      cuotas,
      adjudicacion,
      marcaModelo,
      anio,
      kilometros,
      valorEstimado,
      observaciones,
      vendedor,
      cliente,
      telefono
    } = req.body;

    const doc = new PDFDocument({ margin: 50 });
    const fileName = `presupuesto_${cliente.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../temp', fileName);
    
    // Crear carpeta temp si no existe
    if (!fs.existsSync(path.join(__dirname, '../temp'))) {
      fs.mkdirSync(path.join(__dirname, '../temp'));
    }

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Header
    doc.fontSize(24)
       .fillColor('#D32F2F')
       .text('PRESUPUESTO', { align: 'center' })
       .moveDown();

    // Info del cliente
    doc.fontSize(12)
       .fillColor('#000000')
       .text(`Cliente: ${cliente}`, 50, 120)
       .text(`Teléfono: ${telefono}`, 50, 140)
       .text(`Vendedor: ${vendedor}`, 50, 160)
       .text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 50, 180)
       .moveDown();

    doc.moveTo(50, 210).lineTo(550, 210).stroke();

    // Vehículo 0KM
    doc.fontSize(16)
       .fillColor('#D32F2F')
       .text('VEHÍCULO 0KM', 50, 230)
       .fontSize(12)
       .fillColor('#000000')
       .text(`Modelo: ${nombreVehiculo}`, 50, 260)
       .text(`Valor Móvil: ${valorMinimo}`, 50, 280)
       .moveDown();

    if (anticipo) {
      doc.text(`Anticipo: ${anticipo}`, 50, 300);
    }

    if (bonificacionCuota) {
      doc.text(`Suscripción y Cuota 1: ${bonificacionCuota}`, 50, 320);
    }

    // Cuotas
    if (cuotas && cuotas.length > 0) {
      let yPos = 340;
      doc.fontSize(14)
         .fillColor('#D32F2F')
         .text('PLAN DE CUOTAS', 50, yPos);
      
      yPos += 25;
      doc.fontSize(12).fillColor('#000000');
      
      cuotas.forEach(cuota => {
        doc.text(`Cuotas ${cuota.cantidad}: ${cuota.valor}`, 50, yPos);
        yPos += 20;
      });
    }

    // Adjudicación
    if (adjudicacion) {
      doc.fontSize(12)
         .fillColor('#000000')
         .text(`Adjudicación Asegurada: ${adjudicacion}`, 50, doc.y + 20);
    }

    // Vehículo usado
    if (marcaModelo) {
      doc.moveDown(2);
      doc.fontSize(16)
         .fillColor('#D32F2F')
         .text('COTIZACIÓN VEHÍCULO USADO', 50, doc.y)
         .fontSize(12)
         .fillColor('#000000')
         .moveDown();
      
      doc.text(`Marca y Modelo: ${marcaModelo}`, 50, doc.y);
      if (anio) doc.text(`Año: ${anio}`, 50, doc.y + 20);
      if (kilometros) doc.text(`Kilómetros: ${kilometros}`, 50, doc.y + 40);
      if (valorEstimado) doc.text(`Valor Estimado: ${valorEstimado}`, 50, doc.y + 60);
    }

    // Observaciones
    if (observaciones) {
      doc.moveDown(2);
      doc.fontSize(14)
         .fillColor('#D32F2F')
         .text('OBSERVACIONES', 50, doc.y)
         .fontSize(10)
         .fillColor('#000000')
         .moveDown()
         .text(observaciones, 50, doc.y, { width: 500 });
    }

    // Footer
    doc.moveDown(3);
    doc.fontSize(9)
       .fillColor('#666666')
       .text('PROMOCIÓN VÁLIDA POR 72HS', 50, doc.y, { align: 'center' })
       .moveDown(0.5)
       .text('Las bonificaciones especiales tienen vigencia de 72 horas.', { align: 'center' })
       .moveDown()
       .text('Consulte condiciones y requisitos con su vendedor.', { align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error al enviar PDF:', err);
        }
        fs.unlinkSync(filePath);
      });
    });

  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).json({ error: 'Error al generar presupuesto PDF' });
  }
});

module.exports = router;