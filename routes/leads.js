const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Función para obtener el siguiente vendedor (Round Robin)
async function getNextVendedor(db, equipo = 'principal') {
  try {
    const [vendedores] = await db.query(`
      SELECT id, name 
      FROM users 
      WHERE role IN ('vendedor', 'owner') 
      AND active = 1
      ORDER BY id ASC
    `);

    if (vendedores.length === 0) {
      return null;
    }

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
      siguienteVendedor = vendedores[0];
    } else {
      const ultimoVendedorId = ultimoLead[0].assigned_to;
      const indiceActual = vendedores.findIndex(v => v.id === ultimoVendedorId);
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

// ============================================
// WEBHOOK PARA BOT DE WHATSAPP (SIN AUTENTICACIÓN)
// ============================================
router.post('/bot-webhook', async (req, res) => {
  try {
    console.log('🤖 [BOT WEBHOOK] Solicitud recibida');
    
    const webhookKey = req.headers['x-webhook-key'] || req.body.webhookKey;
    const expectedKey = process.env.WEBHOOK_SECRET || 'auto-del-sol-fiat-2024';
    
    if (!webhookKey || webhookKey !== expectedKey) {
      console.log('❌ [BOT WEBHOOK] Clave incorrecta');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('✅ [BOT WEBHOOK] Clave validada correctamente');

    const { nombre, telefono, modelo, formaPago, fuente, estado, equipo, notas } = req.body;

    if (!nombre || !telefono || !modelo) {
      console.log('❌ [BOT WEBHOOK] Faltan campos requeridos');
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    console.log('📋 [BOT WEBHOOK] Datos:', { nombre, telefono, modelo, equipo: equipo || 'principal' });

    let vendedorAsignado = null;
    let nombreVendedor = 'Sin asignar';

    try {
      const siguienteVendedor = await getNextVendedor(req.db, equipo || 'principal');
      if (siguienteVendedor) {
        vendedorAsignado = siguienteVendedor.id;
        nombreVendedor = siguienteVendedor.name;
        console.log(`🎯 [BOT WEBHOOK] Asignado a: ${nombreVendedor} (ID: ${vendedorAsignado})`);
      }
    } catch (rrError) {
      console.error('⚠️ [BOT WEBHOOK] Error en Round Robin:', rrError.message);
    }

    const historialInicial = JSON.stringify([
      {
        estado: estado || 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: 'Bot WhatsApp FIAT'
      },
      ...(vendedorAsignado ? [{
        estado: `Asignado automáticamente a ${nombreVendedor} (Round Robin)`,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
      }] : [])
    ]);

    console.log('💾 [BOT WEBHOOK] Insertando en BD...');
    
    const [result] = await req.db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        telefono,
        modelo,
        formaPago || 'Plan de ahorro',
        null,
        0,
        notas || '',
        estado || 'nuevo',
        fuente || 'whatsapp',
        new Date().toISOString().split('T')[0],
        vendedorAsignado || null,
        equipo || 'principal',
        historialInicial,
        vendedorAsignado || null
      ]
    );

    const leadId = result.insertId;
    console.log(`✅ [BOT WEBHOOK] Lead creado con ID: ${leadId}`);

    const [newLead] = await req.db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    const lead = newLead[0];
    
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);
    lead.vendedor = lead.assigned_to;

    console.log(`✅ [BOT WEBHOOK] Completado - ${nombre} | ${modelo} | ${nombreVendedor}`);
    
    res.status(201).json({ 
      success: true,
      lead: {
        id: lead.id,
        nombre: lead.nombre,
        telefono: lead.telefono,
        modelo: lead.modelo,
        vendedor: nombreVendedor,
        vendedorId: vendedorAsignado,
        estado: lead.estado,
        fuente: lead.fuente,
        equipo: lead.equipo
      },
      message: 'Lead creado exitosamente desde bot de WhatsApp',
      vendedor: nombreVendedor
    });

  } catch (error) {
    console.error('❌ [BOT WEBHOOK] Error:', error);
    res.status(500).json({ 
      error: 'Error al crear lead desde bot',
      details: error.message
    });
  }
});

// ============================================
// RESTO DE RUTAS (REQUIEREN AUTENTICACIÓN)
// ============================================
router.use(authMiddleware);

// Listar leads
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT 
        l.*,
        u.name as vendedor_nombre,
        c.name as creador_nombre
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users c ON l.created_by = c.id
    `;
    
    const params = [];
    
    if (req.user.role === 'vendedor') {
      query += ' WHERE l.assigned_to = ?';
      params.push(req.user.id);
      console.log(`🔒 Vendedor ${req.user.name} - Filtrando solo sus leads`);
    } else if (req.user.role === 'gerente') {
      if (req.user.equipo) {
        query += ' WHERE l.equipo = ?';
        params.push(req.user.equipo);
        console.log(`🔒 Gerente ${req.user.name} - Filtrando equipo ${req.user.equipo}`);
      }
    }
    
    query += ' ORDER BY l.created_at DESC';
    
    const [leads] = await req.db.query(query, params);
    
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
        entrega: Boolean(lead.entrega),
        vendedor: lead.assigned_to
      };
    });
    
    console.log(`📋 Usuario ${req.user.name} (${req.user.role}) - ${leads.length} leads`);
    
    res.json({ 
      leads: leadsWithParsedHistorial,
      total: leadsWithParsedHistorial.length 
    });
  } catch (error) {
    console.error('Error al listar leads:', error);
    res.status(500).json({ error: 'Error al obtener leads' });
  }
});

// Obtener un lead específico
router.get('/:id', async (req, res) => {
  try {
    let query = 'SELECT * FROM leads WHERE id = ?';
    const params = [req.params.id];
    
    if (req.user.role === 'vendedor') {
      query += ' AND assigned_to = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'gerente') {
      if (req.user.equipo) {
        query += ' AND equipo = ?';
        params.push(req.user.equipo);
      }
    }
    
    const [leads] = await req.db.query(query, params);

    if (leads.length === 0) {
      return res.status(404).json({ error: 'Lead no encontrado o sin permisos' });
    }

    const lead = leads[0];
    
    try {
      lead.historial = lead.historial ? JSON.parse(lead.historial) : [];
    } catch (e) {
      console.warn(`Warning: Invalid JSON in historial for lead ${lead.id}`);
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);
    lead.vendedor = lead.assigned_to;

    res.json({ lead });
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
      const [vendedorData] = await req.db.query('SELECT name FROM users WHERE id = ?', [vendedorAsignado]);
      nombreVendedor = vendedorData[0]?.name || 'Sin asignar';
    }

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
    lead.vendedor = lead.assigned_to;

    console.log(`✅ Lead creado: ${nombre} - Vendedor: ${nombreVendedor} (${fuente})`);
    
    res.status(201).json({ 
      lead,
      message: 'Lead creado exitosamente' 
    });
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

    let query = 'SELECT * FROM leads WHERE id = ?';
    const params = [leadId];
    
    if (req.user.role === 'vendedor') {
      query += ' AND assigned_to = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'gerente') {
      if (req.user.equipo) {
        query += ' AND equipo = ?';
        params.push(req.user.equipo);
      }
    }
    
    const [currentLead] = await req.db.query(query, params);
    
    if (currentLead.length === 0) {
      return res.status(404).json({ error: 'Lead no encontrado o sin permisos para modificar' });
    }

    let historial = [];
    try {
      historial = currentLead[0].historial ? JSON.parse(currentLead[0].historial) : [];
    } catch (e) {
      console.warn(`Warning: Invalid JSON in historial for lead ${leadId}, resetting historial`);
      historial = [];
    }

    if (updates.estado && updates.estado !== currentLead[0].estado) {
      historial.push({
        estado: updates.estado,
        timestamp: new Date().toISOString(),
        usuario: req.user.name
      });
      updates.last_status_change = new Date();
    }

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
    lead.vendedor = lead.assigned_to;

    console.log(`✅ Lead actualizado: ID ${leadId} por ${req.user.name}`);
    
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