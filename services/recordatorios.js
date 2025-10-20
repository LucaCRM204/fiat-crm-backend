const pool = require('../db');

/**
 * Listar recordatorios de un usuario según su rol
 */
exports.listRecordatorios = async (userId, userRole) => {
  try {
    let query = `
      SELECT r.*, 
             l.nombre as lead_nombre, 
             l.telefono as lead_telefono,
             l.modelo as lead_modelo
      FROM recordatorios r
      INNER JOIN leads l ON r.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];

    // Filtrar por permisos
    if (userRole === 'vendedor') {
      query += ` AND l.assigned_to = ?`;
      params.push(userId);
    } else if (userRole === 'supervisor') {
      query += ` AND (l.assigned_to = ? OR l.assigned_to IN (
        SELECT id FROM users WHERE reportsTo = ?
      ))`;
      params.push(userId, userId);
    }
    // owner, director, gerente ven todos

    query += ` ORDER BY r.fecha ASC, r.hora ASC`;

    const [rows] = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('Error listando recordatorios:', error);
    throw error;
  }
};

/**
 * Crear un nuevo recordatorio
 */
exports.createRecordatorio = async (data) => {
  try {
    const { lead_id, fecha, hora, descripcion, created_by } = data;
    
    const [result] = await pool.query(
      `INSERT INTO recordatorios (lead_id, fecha, hora, descripcion, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [lead_id, fecha, hora, descripcion, created_by]
    );

    const [recordatorio] = await pool.query(
      `SELECT r.*, 
              l.nombre as lead_nombre,
              l.telefono as lead_telefono,
              l.modelo as lead_modelo
       FROM recordatorios r
       INNER JOIN leads l ON r.lead_id = l.id
       WHERE r.id = ?`,
      [result.insertId]
    );

    return recordatorio[0];
  } catch (error) {
    console.error('Error creando recordatorio:', error);
    throw error;
  }
};

/**
 * Actualizar recordatorio (marcar como completado)
 */
exports.updateRecordatorio = async (id, data) => {
  try {
    const fields = [];
    const values = [];

    if (data.completado !== undefined) {
      fields.push('completado = ?');
      values.push(data.completado);
    }

    if (fields.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    values.push(id);
    
    await pool.query(
      `UPDATE recordatorios SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const [updated] = await pool.query(
      `SELECT r.*,
              l.nombre as lead_nombre,
              l.telefono as lead_telefono,
              l.modelo as lead_modelo
       FROM recordatorios r
       INNER JOIN leads l ON r.lead_id = l.id
       WHERE r.id = ?`,
      [id]
    );

    return updated[0];
  } catch (error) {
    console.error('Error actualizando recordatorio:', error);
    throw error;
  }
};

/**
 * Eliminar recordatorio
 */
exports.deleteRecordatorio = async (id) => {
  try {
    await pool.query(`DELETE FROM recordatorios WHERE id = ?`, [id]);
    return true;
  } catch (error) {
    console.error('Error eliminando recordatorio:', error);
    throw error;
  }
};

/**
 * Obtener recordatorios pendientes (para notificaciones)
 * Busca recordatorios cuya fecha/hora está en los próximos 5 minutos
 */
exports.getRecordatoriosPendientes = async () => {
  try {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60000);

    const [rows] = await pool.query(
      `SELECT r.*, 
              l.nombre as lead_nombre, 
              l.telefono, 
              l.assigned_to,
              l.modelo as lead_modelo
       FROM recordatorios r
       INNER JOIN leads l ON r.lead_id = l.id
       WHERE r.completado = FALSE
       AND CONCAT(r.fecha, ' ', r.hora) <= ?
       AND CONCAT(r.fecha, ' ', r.hora) >= ?`,
      [fiveMinutesLater, now]
    );

    return rows;
  } catch (error) {
    console.error('Error obteniendo recordatorios pendientes:', error);
    throw error;
  }
};