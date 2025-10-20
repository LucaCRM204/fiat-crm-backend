const express = require('express');
const router = express.Router();
const pushService = require('../services/pushNotifications');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/push/vapid-public-key
 * Obtener clave pública VAPID (no requiere autenticación)
 */
router.get('/vapid-public-key', (req, res) => {
  try {
    if (!process.env.VAPID_PUBLIC_KEY) {
      return res.status(500).json({ 
        error: 'VAPID_PUBLIC_KEY no configurada en el servidor' 
      });
    }

    res.json({ 
      publicKey: process.env.VAPID_PUBLIC_KEY 
    });
  } catch (error) {
    console.error('Error obteniendo clave VAPID:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/subscribe
 * Suscribir usuario a notificaciones push
 */
router.post('/subscribe', authMiddleware, async (req, res) => {
  console.log('=== POST /api/push/subscribe ===');
  console.log('User ID:', req.user?.id);
  console.log('Body completo:', JSON.stringify(req.body, null, 2));
  
  try {
    // ✅ CORRECCIÓN: El frontend envía { subscription: {...} }
    const { subscription } = req.body;
    
    console.log('Subscription extraída:', JSON.stringify(subscription, null, 2));
    
    // Validar estructura de la suscripción
    if (!subscription || !subscription.endpoint) {
      console.error('❌ Suscripción inválida: falta endpoint');
      return res.status(400).json({ 
        error: 'Suscripción inválida: falta endpoint',
        received: req.body
      });
    }

    if (!subscription.keys || !subscription.keys.auth || !subscription.keys.p256dh) {
      console.error('❌ Suscripción inválida: faltan keys');
      return res.status(400).json({ 
        error: 'Suscripción inválida: faltan keys (auth, p256dh)',
        received: subscription
      });
    }

    console.log('✅ Validación OK, guardando...');
    await pushService.savePushSubscription(req.user.id, subscription);
    
    console.log('✅ Suscripción guardada exitosamente');
    res.json({ 
      ok: true,
      message: 'Suscripción guardada exitosamente',
      userId: req.user.id
    });
  } catch (error) {
    console.error('❌ Error suscribiendo a push:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/push/is-subscribed
 * Verificar si el usuario está suscrito
 */
router.get('/is-subscribed', authMiddleware, async (req, res) => {
  try {
    const hasSubscriptions = await pushService.hasActiveSubscriptions(req.user.id);
    const subscriptions = await pushService.getUserSubscriptions(req.user.id);
    
    res.json({ 
      subscribed: hasSubscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Error verificando suscripción:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/push/test
 * Enviar notificación de prueba al usuario actual
 */
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const customMessage = req.body.message || 'Si ves esto, las notificaciones push funcionan correctamente!';

    const success = await pushService.sendPushToUser(req.user.id, {
      title: '🧪 Notificación de Prueba',
      body: customMessage,
      icon: '/logo192.png',
      badge: '/badge-72.png',
      tag: 'test-notification',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    });

    if (success) {
      res.json({ 
        ok: true,
        message: 'Notificación de prueba enviada exitosamente'
      });
    } else {
      res.status(500).json({ 
        ok: false,
        error: 'No se pudo enviar la notificación. Verifica que estés suscrito.'
      });
    }
  } catch (error) {
    console.error('Error enviando notificación de prueba:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/push/unsubscribe
 * Eliminar todas las suscripciones del usuario
 */
router.delete('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const subscriptions = await pushService.getUserSubscriptions(req.user.id);
    
    for (const sub of subscriptions) {
      await pushService.removeInvalidSubscription(sub.endpoint);
    }

    res.json({ 
      ok: true,
      message: `${subscriptions.length} suscripciones eliminadas`
    });
  } catch (error) {
    console.error('Error eliminando suscripciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/push/stats
 * Obtener estadísticas de suscripciones (solo admins)
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Solo admins pueden ver estadísticas
    if (!['owner', 'director'].includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para ver estadísticas de push' 
      });
    }

    const stats = await pushService.getSubscriptionStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas de push:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;