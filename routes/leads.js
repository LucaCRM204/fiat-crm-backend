const express = require('express');
const router = express.Router();
const { authMiddleware, checkRole } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Listar leads
router.get('/', async (req, res) => {
  try {
    const [leads] = await req.db.query(`
      SELECT 
        l.*,
        u.name as vendedor_nombre,
        c.name as creador_nombre
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users c ON l.created_by = c.id
      ORDER BY l.created_at DESC
    `);
    
    // Parse historial JSON con manejo de errores
    const leadsWithParsedHistorial = leads.map(lead => {
      let historial = [];
      try {
        historial = lead.historial ? JSON.parse(lead.historial) : [];
      } catch (e) {
        console.warn(`Warning: Invalid JSON in historial for lead ${lead.id}`);
        historial = [];
      }
      
      return {
        ...lead,
        historial,
        entrega: Boolean(lead.entrega)
      };
    });
    
    console.log(`📋 Listado de ${leads.length} leads`);
    res.json(leadsWithParsedHistorial);
  } catch (error) {
    console.error('Error al listar leads:', error);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// Obtener un lead específico
router.get('/:id', async (req, res) => {
  try {
    const [leads] = await req.db.query(
      'SELECT * FROM leads WHERE id = ?',
      [req.params.id]
    );

    if (leads.length === 0) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    const lead = leads[0];
    
    try {
      lead.historial = lead.historial ? JSON.parse(lead.historial) : [];
    } catch (e) {
      console.warn(`Warning: Invalid JSON in historial for lead ${lead.id}`);
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);

    res.json(lead);
  } catch (error) {
    console.error('Error al obtener lead:', error);
    res.status(500).json({ error: 'Error al obtener lead' });
  }
});

// Crear lead
router.post('/', async (req, res) => {
  try {
    const {
      nombre,
      telefono,
      modelo,
      formaPago,
      infoUsado,
      entrega,
      notas,
      estado,
      fuente,
      fecha,
      vendedor,
      equipo
    } = req.body;

    if (!nombre || !telefono || !modelo) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: nombre, teléfono y modelo son obligatorios' 
      });
    }

    // Historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: estado || 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      }
    ]);

    const [result] = await req.db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        telefono,
        modelo,
        formaPago || 'Contado',
        infoUsado || null,
        entrega ? 1 : 0,
        notas || '',
        estado || 'nuevo',
        fuente || 'otro',
        fecha || new Date().toISOString().split('T')[0],
        vendedor || null,
        equipo || 'principal',
        historialInicial,
        req.user.id
      ]
    );

    const [newLead] = await req.db.query('SELECT * FROM leads WHERE id = ?', [result.insertId]);
    const lead = newLead[0];
    
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);

    console.log(`✅ Lead creado: ${nombre} - Vendedor: ${vendedor || 'Sin asignar'}`);
    res.status(201).json(lead);
  } catch (error) {
    console.error('Error al crear lead:', error);
    res.status(500).json({ error: 'Error al crear lead: ' + error.message });
  }
});

// Actualizar lead
router.put('/:id', async (req, res) => {
  try {
    const leadId = req.params.id;
    const updates = req.body;

    // Obtener el lead actual
    const [currentLead] = await req.db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    
    if (currentLead.length === 0) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    let historial = [];
    try {
      historial = currentLead[0].historial ? JSON.parse(currentLead[0].historial) : [];
    } catch (e) {
      console.warn(`Warning: Invalid JSON in historial for lead ${leadId}, resetting historial`);
      historial = [];
    }

    // Si cambió el estado, agregar al historial
    if (updates.estado && updates.estado !== currentLead[0].estado) {
      historial.push({
        estado: updates.estado,
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      });
    }

    // Si cambió el vendedor, agregar al historial
    if (updates.vendedor !== undefined && updates.vendedor !== currentLead[0].assigned_to) {
      let nuevoVendedor = 'Sin asignar';
      if (updates.vendedor) {
        const [vendedorData] = await req.db.query('SELECT name FROM users WHERE id = ?', [updates.vendedor]);
        nuevoVendedor = vendedorData[0]?.name || 'Sin asignar';
      }
      
      historial.push({
        estado: `Reasignado a ${nuevoVendedor}`,
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      });
    }

    // Preparar campos para actualizar
    const fields = [];
    const values = [];

    const fieldsMap = {
      nombre: 'nombre',
      telefono: 'telefono',
      modelo: 'modelo',
      formaPago: 'formaPago',
      infoUsado: 'infoUsado',
      entrega: 'entrega',
      notas: 'notas',
      estado: 'estado',
      fuente: 'fuente',
      fecha: 'fecha',
      vendedor: 'assigned_to',
      equipo: 'equipo'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (fieldsMap[key]) {
        fields.push(`${fieldsMap[key]} = ?`);
        if (key === 'entrega') {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }
    });

    // Siempre actualizar el historial
    fields.push('historial = ?');
    values.push(JSON.stringify(historial));

    values.push(leadId);

    await req.db.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const [updatedLead] = await req.db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    const lead = updatedLead[0];
    
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);

    console.log(`✅ Lead actualizado: ID ${leadId}`);
    res.json(lead);
  } catch (error) {
    console.error('Error al actualizar lead:', error);
    res.status(500).json({ error: 'Error al actualizar lead' });
  }
});

// Eliminar lead (solo owner)
router.delete('/:id', checkRole('owner'), async (req, res) => {
  try {
    const leadId = req.params.id;

    const [leads] = await req.db.query('SELECT nombre FROM leads WHERE id = ?', [leadId]);
    if (leads.length === 0) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    await req.db.query('DELETE FROM leads WHERE id = ?', [leadId]);

    console.log(`🗑️ Lead eliminado: ${leads[0].nombre}`);
    res.json({ ok: true, message: 'Lead eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar lead:', error);
    res.status(500).json({ error: 'Error al eliminar lead' });
  }
});

module.exports = router;