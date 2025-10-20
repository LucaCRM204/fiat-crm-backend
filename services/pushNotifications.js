const webpush = require('web-push');
const pool = require('../db');

// Configurar VAPID con las claves del .env
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Guardar suscripción push de un usuario
 */
exports.savePushSubscription = async (userId, subscription) => {
  try {
    const { endpoint, keys } = subscription;
    
    if (!endpoint || !keys || !keys.auth || !keys.p256dh) {
      throw new Error('Suscripción inválida - faltan campos requeridos');
    }

    // Verificar si ya existe esta suscripción
    const [existing] = await pool.query(
      `SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`,
      [userId, endpoint]
    );

    if (existing.length > 0) {
      // Actualizar suscripción existente
      await pool.query(
        `UPDATE push_subscriptions 
         SET keys_auth = ?, keys_p256dh = ?, updated_at = NOW()
         WHERE user_id = ? AND endpoint = ?`,
        [keys.auth, keys.p256dh, userId, endpoint]
      );
      console.log(`✅ Suscripción push actualizada para usuario ${userId}`);
    } else {
      // Crear nueva suscripción
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, keys_auth, keys_p256dh)
         VALUES (?, ?, ?, ?)`,
        [userId, endpoint, keys.auth, keys.p256dh]
      );
      console.log(`✅ Nueva suscripción push creada para usuario ${userId}`);
    }

    return true;
  } catch (error) {
    console.error('Error guardando suscripción push:', error);
    throw error;
  }
};

/**
 * Obtener todas las suscripciones de un usuario
 */
exports.getUserSubscriptions = async (userId) => {
  try {
    const [rows] = await pool.query(
      `SELECT endpoint, keys_auth, keys_p256dh 
       FROM push_subscriptions 
       WHERE user_id = ?`,
      [userId]
    );

    return rows.map(row => ({
      endpoint: row.endpoint,
      keys: {
        auth: row.keys_auth,
        p256dh: row.keys_p256dh
      }
    }));
  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    throw error;
  }
};

/**
 * Eliminar suscripción inválida o expirada
 */
exports.removeInvalidSubscription = async (endpoint) => {
  try {
    await pool.query(
      `DELETE FROM push_subscriptions WHERE endpoint = ?`,
      [endpoint]
    );
    console.log(`🗑️ Suscripción inválida eliminada: ${endpoint.substring(0, 50)}...`);
  } catch (error) {
    console.error('Error eliminando suscripción:', error);
  }
};

/**
 * Enviar notificación push a un usuario específico
 */
exports.sendPushToUser = async (userId, payload) => {
  try {
    const subscriptions = await exports.getUserSubscriptions(userId);

    if (subscriptions.length === 0) {
      console.log(`⚠️ Usuario ${userId} no tiene suscripciones push activas`);
      return false;
    }

    const payloadString = JSON.stringify(payload);
    let sentCount = 0;
    let errorCount = 0;

    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payloadString);
        sentCount++;
        console.log(`✅ Push enviado exitosamente a usuario ${userId}`);
      } catch (err) {
        errorCount++;
        console.error(`❌ Error enviando push a usuario ${userId}:`, err.message);
        
        // Si la suscripción expiró (HTTP 410 Gone), eliminarla
        if (err.statusCode === 410) {
          await exports.removeInvalidSubscription(subscription.endpoint);
        }
        // Si es 404 Not Found, también eliminar
        else if (err.statusCode === 404) {
          await exports.removeInvalidSubscription(subscription.endpoint);
        }
      }
    });

    await Promise.all(promises);

    console.log(`📊 Push a usuario ${userId}: ${sentCount} enviados, ${errorCount} fallidos`);
    return sentCount > 0;
  } catch (error) {
    console.error('Error en sendPushToUser:', error);
    return false;
  }
};

/**
 * Notificar recordatorio pendiente
 */
exports.notifyRecordatorio = async (recordatorio) => {
  try {
    // Obtener información del lead y vendedor
    const [lead] = await pool.query(
      `SELECT l.id, l.nombre, l.telefono, l.modelo, l.assigned_to,
              u.name as vendedor_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       WHERE l.id = ?`,
      [recordatorio.lead_id]
    );

    if (!lead[0] || !lead[0].assigned_to) {
      console.log(`⚠️ Recordatorio ${recordatorio.id}: Lead sin vendedor asignado`);
      return false;
    }

    const vendedorId = lead[0].assigned_to;
    const leadData = lead[0];

    // Enviar notificación push
    const success = await exports.sendPushToUser(vendedorId, {
      title: '🔔 Recordatorio',
      body: `${leadData.nombre} - ${recordatorio.descripcion}`,
      icon: '/logo192.png',
      badge: '/badge-72.png',
      tag: `recordatorio-${recordatorio.id}`,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: {
        type: 'recordatorio',
        leadId: leadData.id,
        recordatorioId: recordatorio.id,
        leadNombre: leadData.nombre,
        leadModelo: leadData.modelo,
        url: `/leads?id=${leadData.id}`
      },
      actions: [
        { action: 'view', title: '👁️ Ver Lead' },
        { action: 'call', title: '📞 Llamar' }
      ]
    });

    if (success) {
      console.log(`✅ Recordatorio ${recordatorio.id} notificado a vendedor ${vendedorId}`);
    }

    return success;
  } catch (error) {
    console.error('Error notificando recordatorio:', error);
    return false;
  }
};

/**
 * Notificar tarea urgente
 */
exports.notifyTareaUrgente = async (tarea) => {
  try {
    const payload = {
      title: '⚠️ Tarea Urgente',
      body: tarea.descripcion,
      icon: '/logo192.png',
      badge: '/badge-72.png',
      tag: `tarea-${tarea.id}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: {
        type: 'tarea_urgente',
        tareaId: tarea.id,
        leadId: tarea.lead_id,
        prioridad: tarea.prioridad,
        tipo: tarea.tipo,
        url: '/tareas'
      },
      actions: [
        { action: 'view', title: '👁️ Ver Tarea' },
        { action: 'complete', title: '✅ Completar' }
      ]
    };

    const success = await exports.sendPushToUser(tarea.assigned_to, payload);

    if (success) {
      console.log(`✅ Tarea urgente ${tarea.id} notificada`);
    }

    return success;
  } catch (error) {
    console.error('Error notificando tarea urgente:', error);
    return false;
  }
};

/**
 * Notificar nuevo lead asignado
 */
exports.notifyNuevoLead = async (leadId, vendedorId) => {
  try {
    // Obtener información del lead
    const [lead] = await pool.query(
      `SELECT id, nombre, telefono, modelo, fuente 
       FROM leads 
       WHERE id = ?`,
      [leadId]
    );

    if (!lead[0]) {
      console.log(`⚠️ Lead ${leadId} no encontrado`);
      return false;
    }

    const leadData = lead[0];

    const payload = {
      title: '🎯 Nuevo Lead Asignado',
      body: `${leadData.nombre} - ${leadData.modelo}`,
      icon: '/logo192.png',
      badge: '/badge-72.png',
      tag: `lead-${leadId}`,
      vibrate: [200, 100, 200],
      data: {
        type: 'nuevo_lead',
        leadId: leadData.id,
        leadNombre: leadData.nombre,
        leadModelo: leadData.modelo,
        leadTelefono: leadData.telefono,
        fuente: leadData.fuente,
        url: `/leads?id=${leadId}`
      },
      actions: [
        { action: 'view', title: '👁️ Ver Lead' },
        { action: 'call', title: '📞 Llamar' }
      ]
    };

    const success = await exports.sendPushToUser(vendedorId, payload);

    if (success) {
      console.log(`✅ Nuevo lead ${leadId} notificado a vendedor ${vendedorId}`);
    }

    return success;
  } catch (error) {
    console.error('Error notificando nuevo lead:', error);
    return false;
  }
};

/**
 * Notificar cambio de estado importante en lead
 */
exports.notifyCambioEstado = async (leadId, vendedorId, nuevoEstado) => {
  try {
    const estadosImportantes = ['interesado', 'negociacion', 'vendido'];
    
    if (!estadosImportantes.includes(nuevoEstado)) {
      return false; // No notificar estados menos importantes
    }

    const [lead] = await pool.query(
      `SELECT nombre, modelo FROM leads WHERE id = ?`,
      [leadId]
    );

    if (!lead[0]) return false;

    const emojis = {
      interesado: '🔥',
      negociacion: '💰',
      vendido: '🎉'
    };

    const payload = {
      title: `${emojis[nuevoEstado]} Lead ${nuevoEstado}`,
      body: `${lead[0].nombre} - ${lead[0].modelo}`,
      icon: '/logo192.png',
      badge: '/badge-72.png',
      tag: `lead-estado-${leadId}`,
      vibrate: nuevoEstado === 'vendido' ? [200, 100, 200, 100, 200] : [200, 100, 200],
      data: {
        type: 'cambio_estado',
        leadId: leadId,
        nuevoEstado: nuevoEstado,
        url: `/leads?id=${leadId}`
      }
    };

    return await exports.sendPushToUser(vendedorId, payload);
  } catch (error) {
    console.error('Error notificando cambio de estado:', error);
    return false;
  }
};

/**
 * Enviar notificación a múltiples usuarios
 */
exports.sendPushToMultipleUsers = async (userIds, payload) => {
  try {
    const promises = userIds.map(userId => 
      exports.sendPushToUser(userId, payload)
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r === true).length;

    console.log(`📊 Push masivo: ${successCount}/${userIds.length} enviados exitosamente`);
    return successCount;
  } catch (error) {
    console.error('Error enviando push masivo:', error);
    return 0;
  }
};

/**
 * Verificar si un usuario tiene suscripciones activas
 */
exports.hasActiveSubscriptions = async (userId) => {
  try {
    const subscriptions = await exports.getUserSubscriptions(userId);
    return subscriptions.length > 0;
  } catch (error) {
    console.error('Error verificando suscripciones:', error);
    return false;
  }
};

/**
 * Obtener estadísticas de suscripciones
 */
exports.getSubscriptionStats = async () => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_subscriptions,
        COUNT(DISTINCT user_id) as unique_users,
        DATE(created_at) as date
      FROM push_subscriptions
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    return stats;
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return [];
  }
};