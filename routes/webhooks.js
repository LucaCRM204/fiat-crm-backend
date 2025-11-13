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

    // Importar función Round Robin desde leads.js
    // Como no podemos importar directamente, haremos una versión simplificada aquí
    // O mejor aún, lo haremos inline

    // Obtener siguiente vendedor (Round Robin)
    let vendedorAsignado = null;
    let nombreVendedor = 'Sin asignar';

    try {
      // Obtener todos los vendedores activos
      const [vendedores] = await req.db.query(`
        SELECT id, name 
        FROM users 
        WHERE role IN ('vendedor', 'owner') 
        AND active = 1
        ORDER BY id ASC
      `);

      if (vendedores.length > 0) {
        // Obtener el último vendedor asignado
        const [ultimoLead] = await req.db.query(`
          SELECT assigned_to 
          FROM leads 
          WHERE assigned_to IS NOT NULL 
          AND equipo = ?
          ORDER BY created_at DESC 
          LIMIT 1
        `, [equipo || 'principal']);

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

        vendedorAsignado = siguienteVendedor.id;
        nombreVendedor = siguienteVendedor.name;
        console.log(`🎯 Webhook: Lead asignado a ${nombreVendedor} (ID: ${vendedorAsignado})`);
      }
    } catch (error) {
      console.error('⚠️ Error en Round Robin:', error);
      // Continuar sin vendedor asignado
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
    endpoints: {
      'POST /webhooks/whatsapp-lead': 'Crear leads desde bot de WhatsApp',
      'POST /webhooks/meta': 'Recibir leads de Meta/Facebook',
      'POST /webhooks/whatsapp': 'Notificaciones de WhatsApp',
      'GET /webhooks/health': 'Health check'
    }
  });
});

module.exports = router;