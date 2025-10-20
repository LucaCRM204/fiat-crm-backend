// services/tareas.js
const { pool } = require('../db');

/**
 * Genera tareas automáticas basadas en el estado de los leads
 */
async function generarTareasAutomaticas() {
  try {
    // Obtener todos los leads activos que necesitan seguimiento
    const [leads] = await pool.query(`
      SELECT *, 
             TIMESTAMPDIFF(HOUR, COALESCE(last_status_change, created_at), NOW()) as horas_sin_cambio
      FROM leads
      WHERE estado IN ('nuevo', 'contactado', 'interesado', 'negociacion', 'no_contesta_2', 'no_contesta_3')
      AND assigned_to IS NOT NULL
      ORDER BY created_at DESC
    `);

    const tareasGeneradas = [];
    const ahora = new Date();

    for (const lead of leads) {
      const horasSinCambio = lead.horas_sin_cambio || 0;
      const diasSinCambio = Math.floor(horasSinCambio / 24);

      let tareaGenerada = null;

      // Lógica según estado
      switch (lead.estado) {
        case 'nuevo':
          if (horasSinCambio > 2) {
            tareaGenerada = {
              leadId: lead.id,
              asignadoA: lead.assigned_to,
              tipo: 'llamar',
              prioridad: horasSinCambio > 24 ? 'alta' : 'media',
              fechaLimite: new Date(ahora.getTime() + 4 * 60 * 60 * 1000).toISOString(),
              descripcion: `Realizar primer contacto con ${lead.nombre}`,
              completada: false
            };
          }
          break;

        case 'contactado':
          if (diasSinCambio > 1) {
            tareaGenerada = {
              leadId: lead.id,
              asignadoA: lead.assigned_to,
              tipo: 'whatsapp',
              prioridad: diasSinCambio > 3 ? 'alta' : 'media',
              fechaLimite: new Date(ahora.getTime() + 12 * 60 * 60 * 1000).toISOString(),
              descripcion: `Enviar información del ${lead.modelo} a ${lead.nombre}`,
              completada: false
            };
          }
          break;

        case 'interesado':
          if (diasSinCambio > 2) {
            tareaGenerada = {
              leadId: lead.id,
              asignadoA: lead.assigned_to,
              tipo: 'cotizar',
              prioridad: 'alta',
              fechaLimite: new Date(ahora.getTime() + 8 * 60 * 60 * 1000).toISOString(),
              descripcion: `Enviar cotización personalizada para ${lead.modelo}`,
              completada: false
            };
          }
          break;

        case 'negociacion':
          if (diasSinCambio > 1) {
            tareaGenerada = {
              leadId: lead.id,
              asignadoA: lead.assigned_to,
              tipo: 'seguimiento',
              prioridad: 'alta',
              fechaLimite: new Date(ahora.getTime() + 6 * 60 * 60 * 1000).toISOString(),
              descripcion: `Seguimiento urgente - ${lead.nombre} en negociación`,
              completada: false
            };
          }
          break;

        case 'no_contesta_2':
        case 'no_contesta_3':
          tareaGenerada = {
            leadId: lead.id,
            asignadoA: lead.assigned_to,
            tipo: 'llamar',
            prioridad: 'alta',
            fechaLimite: new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            descripcion: `Reintentar contacto con ${lead.nombre} - ${lead.estado.replace('_', ' ')}`,
            completada: false
          };
          break;
      }

      if (tareaGenerada) {
        tareasGeneradas.push(tareaGenerada);
      }
    }

    console.log(`✅ ${tareasGeneradas.length} tareas automáticas generadas`);
    return tareasGeneradas;

  } catch (error) {
    console.error('❌ Error generando tareas automáticas:', error);
    throw error;
  }
}

/**
 * Obtener tareas urgentes (vencidas o próximas a vencer)
 */
async function getTareasUrgentes() {
  try {
    const [leads] = await pool.query(`
      SELECT *
      FROM leads
      WHERE estado IN ('interesado', 'negociacion')
      AND assigned_to IS NOT NULL
      AND TIMESTAMPDIFF(HOUR, COALESCE(last_status_change, created_at), NOW()) > 48
      LIMIT 20
    `);

    return leads.map(lead => ({
      leadId: lead.id,
      asignadoA: lead.assigned_to,
      tipo: 'seguimiento',
      prioridad: 'alta',
      descripcion: `URGENTE: Seguimiento ${lead.nombre} - ${lead.modelo}`,
      lead
    }));

  } catch (error) {
    console.error('❌ Error obteniendo tareas urgentes:', error);
    return [];
  }
}

/**
 * Limpiar tareas completadas antiguas (más de 30 días)
 */
async function limpiarTareasAntiguas() {
  try {
    // Por ahora, solo retornamos 0 ya que las tareas se generan en tiempo real
    // En el futuro, si guardas tareas en la DB, aquí las limpiarías
    console.log('✅ Limpieza de tareas ejecutada');
    return 0;
  } catch (error) {
    console.error('❌ Error limpiando tareas:', error);
    return 0;
  }
}

module.exports = {
  generarTareasAutomaticas,
  getTareasUrgentes,
  limpiarTareasAntiguas
};