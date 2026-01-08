// routes/webhooks.js
const express = require('express');
const router = express.Router();

// ============================================
// WEBHOOK PARA BOT DE WHATSAPP - CREAR LEADS
// ============================================
router.post('/whatsapp-lead', async (req, res) => {
  try {
    // Verificar clave secreta
    const webhookKey = req.headers['x-webhook-key'] || req.body.webhookKey;
    const expectedKey = process.env.WEBHOOK_SECRET || 'auto-del-sol-fiat-2024';
    
    if (!webhookKey || webhookKey !== expectedKey) {
      console.log('❌ Webhook WhatsApp Lead: Intento de acceso no autorizado');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('✅ Webhook WhatsApp Lead: Clave validada correctamente');
    console.log('📩 Datos recibidos:', JSON.stringify(req.body, null, 2));

    const { nombre, telefono, modelo, formaPago, fuente, estado, equipo, notas } = req.body;

    // Validaciones básicas
    if (!nombre || !telefono || !modelo) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: nombre, teléfono y modelo son obligatorios' 
      });
    }

    // Obtener siguiente vendedor (Round Robin)
    // 🟢 VENDEDORES PARA LEADS DE BOT WHATSAPP
    const VENDEDORES_BOT = [
      { id: 69, name: 'Agostina Carrizo' },
      { id: 71, name: 'Maximiliano Cristaldo' },
      { id: 58, name: 'Morena Cabrera' },
      { id: 53, name: 'Ignacio Muñoz' },
      { id: 68, name: 'Matias Herlein' },
      { id: 29, name: 'Florencia Sosa' },
      { id: 72, name: 'Elias Benjamin Garcia' },
      { id: 49, name: 'Marcos Gomez' },
      { id: 73, name: 'Sheila Moreyra' }
    ];

    let vendedorAsignado = null;
    let nombreVendedor = 'Sin asignar';

    try {
      if (VENDEDORES_BOT.length > 0) {
        // Obtener el último vendedor asignado de este grupo
        const idsVendedores = VENDEDORES_BOT.map(v => v.id).join(',');
        const [ultimoLead] = await req.db.query(`
          SELECT assigned_to 
          FROM leads 
          WHERE assigned_to IN (${idsVendedores})
          ORDER BY created_at DESC 
          LIMIT 1
        `);

        let siguienteVendedor;

        if (ultimoLead.length === 0 || !ultimoLead[0].assigned_to) {
          // Si no hay leads previos, asignar al primer vendedor
          siguienteVendedor = VENDEDORES_BOT[0];
        } else {
          // Encontrar el índice del último vendedor
          const ultimoVendedorId = ultimoLead[0].assigned_to;
          const indiceActual = VENDEDORES_BOT.findIndex(v => v.id === ultimoVendedorId);
          
          // Obtener el siguiente vendedor (circular)
          const siguienteIndice = (indiceActual === -1) ? 0 : (indiceActual + 1) % VENDEDORES_BOT.length;
          siguienteVendedor = VENDEDORES_BOT[siguienteIndice];
        }

        vendedorAsignado = siguienteVendedor.id;
        nombreVendedor = siguienteVendedor.name;
        console.log(`🎯 Webhook: Lead asignado a ${nombreVendedor} (ID: ${vendedorAsignado})`);
      }
    } catch (error) {
      console.error('⚠️ Error en Round Robin:', error);
      // Fallback al primero
      vendedorAsignado = VENDEDORES_BOT[0].id;
      nombreVendedor = VENDEDORES_BOT[0].name;
    }

    // Crear historial inicial
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

    // Insertar lead en la base de datos
    const [result] = await req.db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        telefono,
        modelo,
        formaPago || 'Plan de ahorro',
        null, // infoUsado
        0, // entrega
        notas || '',
        estado || 'nuevo',
        fuente || 'whatsapp',
        new Date().toISOString().split('T')[0],
        vendedorAsignado || null,
        equipo || 'principal',
        historialInicial,
        vendedorAsignado || null // created_by
      ]
    );

    // Obtener el lead creado
    const [newLead] = await req.db.query('SELECT * FROM leads WHERE id = ?', [result.insertId]);
    const lead = newLead[0];
    
    // Parsear historial
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);
    lead.vendedor = lead.assigned_to;

    console.log(`✅ Webhook: Lead creado exitosamente`);
    console.log(`   ID: ${lead.id}`);
    console.log(`   Nombre: ${nombre}`);
    console.log(`   Teléfono: ${telefono}`);
    console.log(`   Modelo: ${modelo}`);
    console.log(`   Vendedor: ${nombreVendedor} (ID: ${vendedorAsignado})`);
    console.log(`   Fuente: ${fuente}`);
    
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
    console.error('❌ Error en webhook WhatsApp Lead:', error);
    res.status(500).json({ 
      error: 'Error al crear lead desde webhook',
      details: error.message 
    });
  }
});

// ============================================
// WEBHOOK PARA ZAPIER/GOOGLE SHEETS - LEAD
// ============================================
router.post('/sheets-lead', async (req, res) => {
  try {
    // Verificar clave secreta
    const webhookKey = req.headers['x-webhook-key'] || req.body.webhookKey;
    const expectedKey = process.env.WEBHOOK_SECRET || 'auto-del-sol-fiat-2024';
    
    if (!webhookKey || webhookKey !== expectedKey) {
      console.log('❌ Webhook Sheets Lead: Intento de acceso no autorizado');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('✅ Webhook Sheets Lead: Clave validada correctamente');
    console.log('📩 Datos recibidos:', JSON.stringify(req.body, null, 2));

    const { nombre, telefono, modelo, formaPago, notas, vendedorId } = req.body;

    // Validaciones básicas
    if (!nombre || !telefono || !modelo) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: nombre, teléfono y modelo son obligatorios',
        received: { nombre, telefono, modelo }
      });
    }

    // ========================================
    // ROUND ROBIN ENTRE VENDEDORES DE SHEETS
    // ========================================
    
    // 🔵 VENDEDORES PARA LEADS DE SHEETS
    const VENDEDORES_SHEETS = [
      { id: 42, name: 'Carlos Severich' },
      { id: 55, name: 'Franco Molina' },
      { id: 45, name: 'Sebastian Orrijola' },
      { id: 57, name: 'Maia Heredia' },
      { id: 64, name: 'Juan Froy' },
      { id: 65, name: 'Carlos Benavidez' },
      { id: 66, name: 'Agustin Diaz' }
    ];
    
    let vendedorAsignado = null;
    let nombreVendedor = 'Sin asignar';

    try {
      // Si viene vendedorId específico, usarlo directamente
      if (vendedorId) {
        const vendorFound = VENDEDORES_SHEETS.find(v => v.id === parseInt(vendedorId));
        if (vendorFound) {
          vendedorAsignado = vendorFound.id;
          nombreVendedor = vendorFound.name;
          console.log(`📌 Vendedor específico asignado: ${nombreVendedor}`);
        }
      }
      
      // Si no hay vendedor específico, usar Round Robin
      if (!vendedorAsignado) {
        // Obtener el último lead de sheets para round robin
        const [ultimoLead] = await req.db.query(`
          SELECT assigned_to 
          FROM leads 
          WHERE fuente = 'sheets' 
          AND assigned_to IN (${VENDEDORES_SHEETS.map(v => v.id).join(',')})
          ORDER BY created_at DESC 
          LIMIT 1
        `);

        let siguienteVendedor;

        if (ultimoLead.length === 0 || !ultimoLead[0].assigned_to) {
          // Primer lead, asignar al primero
          siguienteVendedor = VENDEDORES_SHEETS[0];
        } else {
          // Encontrar el índice del último y rotar
          const ultimoId = ultimoLead[0].assigned_to;
          const indiceActual = VENDEDORES_SHEETS.findIndex(v => v.id === ultimoId);
          const siguienteIndice = (indiceActual + 1) % VENDEDORES_SHEETS.length;
          siguienteVendedor = VENDEDORES_SHEETS[siguienteIndice];
        }

        vendedorAsignado = siguienteVendedor.id;
        nombreVendedor = siguienteVendedor.name;
        console.log(`🎯 Round Robin Sheets: Asignado a ${nombreVendedor} (ID: ${vendedorAsignado})`);
      }

    } catch (error) {
      console.error('⚠️ Error en Round Robin Sheets:', error);
      // Fallback: asignar al primero
      vendedorAsignado = VENDEDORES_SHEETS[0].id;
      nombreVendedor = VENDEDORES_SHEETS[0].name;
    }

    // Crear historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: 'Zapier/Google Sheets'
      },
      {
        estado: `Asignado a ${nombreVendedor} (Round Robin Sheets)`,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
      }
    ]);

    // Insertar lead
    const [result] = await req.db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        telefono,
        modelo,
        formaPago || 'Consultar',
        null,
        0,
        notas || '',
        'nuevo',
        'sheets',  // Fuente específica para identificar estos leads
        new Date().toISOString().split('T')[0],
        vendedorAsignado,
        historialInicial,
        vendedorAsignado
      ]
    );

    console.log(`✅ Lead Sheets creado: ID ${result.insertId}, Vendedor: ${nombreVendedor}`);

    res.status(201).json({ 
      success: true,
      leadId: result.insertId,
      nombre: nombre,
      vendedor: nombreVendedor,
      vendedorId: vendedorAsignado,
      message: 'Lead creado desde Google Sheets'
    });

  } catch (error) {
    console.error('❌ Error webhook Sheets:', error);
    res.status(500).json({ 
      error: 'Error al crear lead',
      details: error.message 
    });
  }
});

// ============================================
// WEBHOOK ZAPIER - EQUIPO BOT/ZAPIER
// ============================================

router.post('/zapier-cristaldo', async (req, res) => {
  try {
    // Verificar clave secreta
    const webhookKey = req.headers['x-webhook-key'];
    if (webhookKey !== 'fiat-zapier-cristaldo-2024') {
      console.log('❌ Webhook Zapier: No autorizado');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('📩 Webhook Zapier recibido:', JSON.stringify(req.body, null, 2));

    const { nombre, telefono, modelo, formaPago, notas } = req.body;

    // Validaciones básicas
    if (!nombre || !telefono) {
      return res.status(400).json({ 
        error: 'Nombre y teléfono son requeridos',
        received: { nombre, telefono }
      });
    }

    // 🟢 VENDEDORES PARA LEADS DE ZAPIER (mismo grupo que Bot WhatsApp)
    const VENDEDORES_ZAPIER = [
      { id: 69, name: 'Agostina Carrizo' },
      { id: 71, name: 'Maximiliano Cristaldo' },
      { id: 58, name: 'Morena Cabrera' },
      { id: 53, name: 'Ignacio Muñoz' },
      { id: 68, name: 'Matias Herlein' },
      { id: 29, name: 'Florencia Sosa' },
      { id: 72, name: 'Elias Benjamin Garcia' },
      { id: 49, name: 'Marcos Gomez' },
      { id: 73, name: 'Sheila Moreyra' }
    ];

    // Round Robin
    const idsVendedores = VENDEDORES_ZAPIER.map(v => v.id).join(',');
    const [ultimoLead] = await req.db.query(`
      SELECT assigned_to 
      FROM leads 
      WHERE assigned_to IN (${idsVendedores})
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    let siguienteVendedor;
    if (ultimoLead.length === 0 || !ultimoLead[0].assigned_to) {
      siguienteVendedor = VENDEDORES_ZAPIER[0];
    } else {
      const ultimoId = ultimoLead[0].assigned_to;
      const indiceActual = VENDEDORES_ZAPIER.findIndex(v => v.id === ultimoId);
      const siguienteIndice = (indiceActual === -1) ? 0 : (indiceActual + 1) % VENDEDORES_ZAPIER.length;
      siguienteVendedor = VENDEDORES_ZAPIER[siguienteIndice];
    }

    const vendedorAsignado = siguienteVendedor.id;
    const nombreVendedor = siguienteVendedor.name;

    console.log(`🎯 Zapier: Asignado a ${nombreVendedor} (ID: ${vendedorAsignado})`);

    // Crear historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: 'Zapier'
      },
      {
        estado: `Asignado a ${nombreVendedor} (Round Robin)`,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
      }
    ]);

    // Insertar lead
    const [result] = await req.db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        telefono,
        modelo || 'Consultar',
        formaPago || 'Consultar',
        null,
        0,
        notas || '',
        'nuevo',
        'zapier',
        new Date().toISOString().split('T')[0],
        vendedorAsignado,
        'principal',
        historialInicial,
        vendedorAsignado
      ]
    );

    console.log(`✅ Lead Zapier creado: ID ${result.insertId}, Vendedor: ${nombreVendedor}`);

    res.status(201).json({ 
      ok: true,
      leadId: result.insertId,
      message: `Lead asignado a ${nombreVendedor}`,
      assignedTo: vendedorAsignado,
      vendedor: nombreVendedor
    });

  } catch (error) {
    console.error('❌ Error webhook Zapier Cristaldo:', error);
    res.status(500).json({ 
      error: 'Error al crear lead',
      details: error.message 
    });
  }
});

// ============================================
// WEBHOOK PARA META/FACEBOOK
// ============================================
router.post('/meta', async (req, res) => {
  try {
    console.log('📩 Webhook Meta recibido:', JSON.stringify(req.body, null, 2));
    
    // Aquí procesarías los leads de Facebook/Instagram
    // const entry = req.body.entry?.[0];
    // const leadData = entry?.changes?.[0]?.value?.leadgen_id;
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error en webhook Meta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verificación de webhook de Meta (requerido por Facebook)
router.get('/meta', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'alluma_meta_webhook_token_2024';
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook Meta verificado');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verificación de webhook fallida');
    res.sendStatus(403);
  }
});

// ============================================
// WEBHOOK PARA WHATSAPP (NOTIFICACIONES)
// ============================================
router.post('/whatsapp', async (req, res) => {
  try {
    console.log('📩 Webhook WhatsApp recibido:', JSON.stringify(req.body, null, 2));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    vendedores: {
      sheets: ['Carlos Severich (42)', 'Franco Molina (55)', 'Sebastian Orrijola (45)', 'Maia Heredia (57)', 'Juan Froy (64)', 'Carlos Benavidez (65)', 'Agustin Diaz (66)'],
      bot_zapier: ['Agostina Carrizo (69)', 'Maximiliano Cristaldo (71)', 'Morena Cabrera (58)', 'Ignacio Muñoz (53)', 'Matias Herlein (68)', 'Florencia Sosa (29)', 'Elias Garcia (72)', 'Marcos Gomez (49)', 'Sheila Moreyra (73)']
    },
    endpoints: {
      'POST /webhooks/whatsapp-lead': 'Crear leads desde bot de WhatsApp → Vendedores Bot/Zapier',
      'POST /webhooks/sheets-lead': 'Crear leads desde Google Sheets → Vendedores Sheets',
      'POST /webhooks/zapier-cristaldo': 'Crear leads desde Zapier → Vendedores Bot/Zapier',
      'POST /webhooks/meta': 'Recibir leads de Meta/Facebook',
      'POST /webhooks/whatsapp': 'Notificaciones de WhatsApp',
      'GET /webhooks/health': 'Health check'
    }
  });
});

module.exports = router;