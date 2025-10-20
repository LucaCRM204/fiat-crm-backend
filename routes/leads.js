const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Función para obtener el siguiente vendedor (Round Robin)
async function getNextVendedor(db, equipo = 'principal') {
  try {
    // Obtener todos los vendedores activos del equipo
    const [vendedores] = await db.query(`
      SELECT id, name 
      FROM users 
      WHERE role IN ('vendedor', 'owner') 
      AND active = 1
      ORDER BY id ASC
    `);

    if (vendedores.length === 0) {
      return null; // No hay vendedores disponibles
    }

    // Obtener el último vendedor asignado
    const [ultimoLead] = await db.query(`
      SELECT assigned_to 
      FROM leads 
      WHERE assigned_to IS NOT NULL 
      AND equipo = ?
      ORDER BY created_at DESC 
      LIMIT 1
    `, [equipo]);

    let siguienteVendedor;

    if (ultimoLead.length === 0 || !ultimoLead[0].assigned_to) {
      // Si no hay leads previos, asignar al primer vendedor
      siguienteVendedor = vendedores[0];
    } else {
      // Encontrar el índice del último vendedor
      const ultimoVendedorId = ultimoLead[0].assigned_to;
      const indiceActual = vendedores.findIndex(v => v.id === ultimoVendedorId);
      
      // Obtener el siguiente vendedor (circular)
      const siguienteIndice = (indiceActual + 1) % vendedores.length;
      siguienteVendedor = vendedores[siguienteIndice];
    }

    console.log(`🎯 Round Robin: Asignando a ${siguienteVendedor.name} (ID: ${siguienteVendedor.id})`);
    return siguienteVendedor;
  } catch (error) {
    console.error('Error en Round Robin:', error);
    return null;
  }
}

// Listar leads - ✅ CORREGIDO
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
    
    // ✅ CORRECCIÓN: Enviar como objeto con propiedad 'leads'
    res.json({ 
      leads: leadsWithParsedHistorial,
      total: leadsWithParsedHistorial.length 
    });
  } catch (error) {
    console.error('Error al listar leads:', error);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// Obtener un lead específico - ✅ CORREGIDO
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

    // ✅ CORRECCIÓN: Enviar como objeto con propiedad 'lead'
    res.json({ lead });
  } catch (error) {
    console.error('Error al obtener lead:', error);
    res.status(500).json({ error: 'Error al obtener lead' });
  }
});

// Crear lead - ✅ CORREGIDO
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

    // ROUND ROBIN: Si no viene vendedor asignado, asignar automáticamente
    let vendedorAsignado = vendedor;
    let nombreVendedor = 'Sin asignar';

    if (!vendedorAsignado) {
      const siguienteVendedor = await getNextVendedor(req.db, equipo || 'principal');
      if (siguienteVendedor) {
        vendedorAsignado = siguienteVendedor.id;
        nombreVendedor = siguienteVendedor.name;
        console.log(`🔄 Round Robin activado: Lead asignado a ${nombreVendedor}`);
      }
    } else {
      // Si viene vendedor, obtener su nombre
      const [vendedorData] = await req.db.query('SELECT name FROM users WHERE id = ?', [vendedorAsignado]);
      nombreVendedor = vendedorData[0]?.name || 'Sin asignar';
    }

    // Historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: estado || 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      },
      ...(vendedorAsignado ? [{
        estado: `Asignado automáticamente a ${nombreVendedor} (Round Robin)`,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
      }] : [])
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
        vendedorAsignado || null,
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

    console.log(`✅ Lead creado: ${nombre} - Vendedor: ${nombreVendedor} (${fuente})`);
    
    // ✅ CORRECCIÓN: Enviar como objeto con propiedad 'lead'
    res.status(201).json({ 
      lead,
      message: 'Lead creado exitosamente' 
    });
  } catch (error) {
    console.error('Error al crear lead:', error);
    res.status(500).json({ error: 'Error al crear lead: ' + error.message });
  }
});

// Actualizar lead - ✅ CORREGIDO
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

    // Si cambió el estado, agregar al historial y actualizar last_status_change
    if (updates.estado && updates.estado !== currentLead[0].estado) {
      historial.push({
        estado: updates.estado,
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      });
      
      // Actualizar last_status_change
      updates.last_status_change = new Date();
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
      equipo: 'equipo',
      last_status_change: 'last_status_change'
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
    
    // ✅ CORRECCIÓN: Enviar como objeto con propiedad 'lead'
    res.json({ 
      lead,
      message: 'Lead actualizado exitosamente' 
    });
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
    res.json({ 
      success: true,
      message: 'Lead eliminado correctamente' 
    });
  } catch (error) {
    console.error('Error al eliminar lead:', error);
    res.status(500).json({ error: 'Error al eliminar lead' });
  }
});

module.exports = router;