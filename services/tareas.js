const pool = require('../db');

/**
 * Listar tareas de un usuario según su rol
 */
exports.listTareas = async (userId, userRole) => {
  try {
    let query = `
      SELECT t.*, 
             l.nombre as lead_nombre, 
             l.telefono as lead_telefono,
             l.modelo as lead_modelo,
             l.estado as lead_estado,
             u.name as assigned_to_name
      FROM tareas t
      INNER JOIN leads l ON t.lead_id = l.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.completada = FALSE
    `;
    const params = [];

    if (userRole === 'vendedor') {
      query += ` AND t.assigned_to = ?`;
      params.push(userId);
    } else if (userRole === 'supervisor') {
      query += ` AND (t.assigned_to = ? OR t.assigned_to IN (
        SELECT id FROM users WHERE reportsTo = ?
      ))`;
      params.push(userId, userId);
    } else if (userRole === 'gerente') {
      query += ` AND (t.assigned_to = ? OR t.assigned_to IN (
        SELECT id FROM users WHERE reportsTo = ? OR reportsTo IN (
          SELECT id FROM users WHERE reportsTo = ?
        )
      ))`;
      params.push(userId, userId, userId);
    }
    // owner y director ven todas

    query += ` ORDER BY 
      CASE t.prioridad 
        WHEN 'alta' THEN 1 
        WHEN 'media' THEN 2 
        WHEN 'baja' THEN 3 
      END,
      t.fecha_limite ASC`;

    const [rows] = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('Error listando tareas:', error);
    throw error;
  }
};

/**
 * Crear nueva tarea
 */
exports.createTarea = async (data) => {
  try {
    const {
      lead_id,
      assigned_to,
      tipo,
      prioridad,
      fecha_limite,
      descripcion
    } = data;

    const [result] = await pool.query(
      `INSERT INTO tareas 
       (lead_id, assigned_to, tipo, prioridad, fecha_limite, descripcion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lead_id, assigned_to, tipo, prioridad, fecha_limite, descripcion]
    );

    const [tarea] = await pool.query(
      `SELECT t.*,
              l.nombre as lead_nombre,
              l.telefono as lead_telefono,
              l.modelo as lead_modelo,
              u.name as assigned_to_name
       FROM tareas t
       INNER JOIN leads l ON t.lead_id = l.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    return tarea[0];
  } catch (error) {
    console.error('Error creando tarea:', error);
    throw error;
  }
};

/**
 * Completar tarea
 */
exports.completeTarea = async (id) => {
  try {
    await pool.query(
      `UPDATE tareas SET completada = TRUE, completed_at = NOW() WHERE id = ?`,
      [id]
    );

    const [updated] = await pool.query(
      `SELECT t.*,
              l.nombre as lead_nombre,
              u.name as assigned_to_name
       FROM tareas t
       INNER JOIN leads l ON t.lead_id = l.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [id]
    );

    return updated[0];
  } catch (error) {
    console.error('Error completando tarea:', error);
    throw error;
  }
};

/**
 * Generar tareas automáticas basadas en estados de leads
 */
exports.generarTareasAutomaticas = async () => {
  try {
    const ahora = new Date();
    
    // Obtener leads que necesitan seguimiento
    const [leads] = await pool.query(`
      SELECT l.*, 
             TIMESTAMPDIFF(HOUR, COALESCE(l.last_status_change, l.created_at), NOW()) as horas_sin_cambio
      FROM leads l
      WHERE l.estado IN ('nuevo', 'contactado', 'interesado', 'negociacion', 'no_contesta_2', 'no_contesta_3')
      AND l.assigned_to IS NOT NULL
    `);

    const tareasCreadas = [];

    for (const lead of leads) {
      const horasSinCambio = lead.horas_sin_cambio;
      let debeCrearTarea = false;
      let tarea = null;

      // Lógica de tareas automáticas
      if (lead.estado === 'nuevo' && horasSinCambio > 2) {
        tarea = {
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
          tipo: 'llamar',
          prioridad: horasSinCambio > 24 ? 'alta' : 'media',
          fecha_limite: new Date(Date.now() + 4 * 60 * 60 * 1000),
          descripcion: `Realizar primer contacto con ${lead.nombre}`
        };
        debeCrearTarea = true;
      } else if (lead.estado === 'contactado' && horasSinCambio > 24) {
        tarea = {
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
          tipo: 'whatsapp',
          prioridad: horasSinCambio > 72 ? 'alta' : 'media',
          fecha_limite: new Date(Date.now() + 12 * 60 * 60 * 1000),
          descripcion: `Enviar información del ${lead.modelo} a ${lead.nombre}`
        };
        debeCrearTarea = true;
      } else if (lead.estado === 'interesado' && horasSinCambio > 48) {
        tarea = {
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
          tipo: 'cotizar',
          prioridad: 'alta',
          fecha_limite: new Date(Date.now() + 8 * 60 * 60 * 1000),
          descripcion: `Enviar cotización personalizada para ${lead.modelo}`
        };
        debeCrearTarea = true;
      } else if (lead.estado === 'negociacion' && horasSinCambio > 24) {
        tarea = {
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
          tipo: 'seguimiento',
          prioridad: 'alta',
          fecha_limite: new Date(Date.now() + 6 * 60 * 60 * 1000),
          descripcion: `Seguimiento urgente - ${lead.nombre} en negociación`
        };
        debeCrearTarea = true;
      }

      // Verificar que no exista ya una tarea similar
      if (debeCrearTarea && tarea) {
        const [existente] = await pool.query(
          `SELECT id FROM tareas 
           WHERE lead_id = ? 
           AND tipo = ? 
           AND completada = FALSE 
           AND DATE(fecha_limite) = DATE(?)`,
          [tarea.lead_id, tarea.tipo, tarea.fecha_limite]
        );

        if (existente.length === 0) {
          const created = await exports.createTarea(tarea);
          tareasCreadas.push(created);
        }
      }
    }

    return tareasCreadas;
  } catch (error) {
    console.error('Error generando tareas automáticas:', error);
    throw error;
  }
};

/**
 * Obtener tareas urgentes sin completar
 */
exports.getTareasUrgentes = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*,
              l.nombre as lead_nombre,
              u.name as assigned_to_name
       FROM tareas t
       INNER JOIN leads l ON t.lead_id = l.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.completada = FALSE
       AND t.prioridad = 'alta'
       AND t.fecha_limite < NOW()
       ORDER BY t.fecha_limite ASC`
    );

    return rows;
  } catch (error) {
    console.error('Error obteniendo tareas urgentes:', error);
    throw error;
  }
};

/**
 * Limpiar tareas completadas antiguas (más de 30 días)
 */
exports.limpiarTareasAntiguas = async () => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tareas 
       WHERE completada = TRUE 
       AND completed_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    return result.affectedRows;
  } catch (error) {
    console.error('Error limpiando tareas antiguas:', error);
    throw error;
  }
};