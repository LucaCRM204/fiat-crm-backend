// backend/services/leads.js
const db = require('../db');

async function createLead(data) {
  try {
    // Historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: data.estado || 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: 'WhatsApp Bot'
      }
    ]);

    const [result] = await db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.nombre,
        data.telefono,
        data.modelo,
        data.formaPago || 'Contado',
        data.infoUsado || null,
        data.entrega ? 1 : 0,
        data.notas || '',
        data.estado || 'nuevo',
        data.fuente || 'otro',
        data.fecha || new Date().toISOString().split('T')[0],
        data.assigned_to || null,
        data.equipo || 'roberto',
        historialInicial,
        data.created_by || null
      ]
    );

    const [newLead] = await db.query('SELECT * FROM leads WHERE id = ?', [result.insertId]);
    const lead = newLead[0];
    
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);

    console.log(`✅ Lead creado por Bot: ${data.nombre} - ID: ${lead.id}`);
    return lead;
  } catch (error) {
    console.error('Error en createLead service:', error);
    throw error;
  }
}

async function listLeads() {
  try {
    const [leads] = await db.query(`
      SELECT 
        l.*,
        u.name as vendedor_nombre,
        c.name as creador_nombre
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users c ON l.created_by = c.id
      ORDER BY l.created_at DESC
    `);
    
    return leads.map(lead => {
      let historial = [];
      try {
        historial = lead.historial ? JSON.parse(lead.historial) : [];
      } catch (e) {
        historial = [];
      }
      
      return {
        ...lead,
        historial,
        entrega: Boolean(lead.entrega)
      };
    });
  } catch (error) {
    console.error('Error en listLeads service:', error);
    throw error;
  }
}

async function updateLead(id, data) {
  try {
    const [currentLead] = await db.query('SELECT * FROM leads WHERE id = ?', [id]);
    
    if (currentLead.length === 0) {
      throw new Error('Lead no encontrado');
    }

    let historial = [];
    try {
      historial = currentLead[0].historial ? JSON.parse(currentLead[0].historial) : [];
    } catch (e) {
      historial = [];
    }

    if (data.estado && data.estado !== currentLead[0].estado) {
      historial.push({
        estado: data.estado,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
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
      assigned_to: 'assigned_to',
      equipo: 'equipo'
    };

    Object.entries(data).forEach(([key, value]) => {
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
    values.push(id);

    await db.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const [updatedLead] = await db.query('SELECT * FROM leads WHERE id = ?', [id]);
    const lead = updatedLead[0];
    
    try {
      lead.historial = JSON.parse(lead.historial);
    } catch (e) {
      lead.historial = [];
    }
    
    lead.entrega = Boolean(lead.entrega);

    return lead;
  } catch (error) {
    console.error('Error en updateLead service:', error);
    throw error;
  }
}

async function deleteLead(id) {
  try {
    await db.query('DELETE FROM leads WHERE id = ?', [id]);
    return { ok: true };
  } catch (error) {
    console.error('Error en deleteLead service:', error);
    throw error;
  }
}

module.exports = {
  createLead,
  listLeads,
  updateLead,
  deleteLead
};