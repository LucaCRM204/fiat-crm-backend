const pool = require('../db');

/**
 * Listar cotizaciones de un lead
 */
exports.listCotizaciones = async (leadId) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, 
              u.name as created_by_name,
              l.nombre as lead_nombre
       FROM cotizaciones c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.lead_id = ?
       ORDER BY c.created_at DESC`,
      [leadId]
    );
    
    // Parsear JSON de planes
    return rows.map(row => ({
      ...row,
      planes: typeof row.planes === 'string' ? JSON.parse(row.planes) : row.planes
    }));
  } catch (error) {
    console.error('Error listando cotizaciones:', error);
    throw error;
  }
};

/**
 * Crear nueva cotización
 */
exports.createCotizacion = async (data) => {
  try {
    const { 
      lead_id, 
      vehiculo, 
      precio_contado, 
      anticipo, 
      valor_usado, 
      planes,
      bonificaciones,
      notas,
      created_by 
    } = data;

    const [result] = await pool.query(
      `INSERT INTO cotizaciones 
       (lead_id, vehiculo, precio_contado, anticipo, valor_usado, planes, bonificaciones, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lead_id,
        vehiculo,
        precio_contado,
        anticipo || 0,
        valor_usado || 0,
        JSON.stringify(planes),
        bonificaciones,
        notas,
        created_by
      ]
    );

    const [cotizacion] = await pool.query(
      `SELECT c.*,
              u.name as created_by_name,
              l.nombre as lead_nombre
       FROM cotizaciones c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    return {
      ...cotizacion[0],
      planes: JSON.parse(cotizacion[0].planes)
    };
  } catch (error) {
    console.error('Error creando cotización:', error);
    throw error;
  }
};

/**
 * Obtener cotización por ID
 */
exports.getCotizacionById = async (id) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*,
              u.name as created_by_name,
              l.nombre as lead_nombre
       FROM cotizaciones c
       LEFT JOIN users u ON c.created_by = u.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.id = ?`,
      [id]
    );

    if (rows.length === 0) return null;

    return {
      ...rows[0],
      planes: JSON.parse(rows[0].planes)
    };
  } catch (error) {
    console.error('Error obteniendo cotización:', error);
    throw error;
  }
};