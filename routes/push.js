const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const webpush = require('web-push');

// Configurar VAPID keys (genera estas con: npx web-push generate-vapid-keys)
webpush.setVapidDetails(
  'mailto:tu-email@ejemplo.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Guardar suscripción
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Datos de suscripción incompletos' });
    }

    await req.db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) 
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando suscripción:', error);
    res.status(500).json({ error: 'Error al guardar suscripción' });
  }
});

// Enviar notificación a un usuario
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    const [subscriptions] = await req.db.query(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    const payload = JSON.stringify({ title, body, data });

    const promises = subscriptions.map(sub => {
      return webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }, payload).catch(error => {
        // Si la suscripción es inválida, eliminarla
        if (error.statusCode === 410) {
          req.db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        }
      });
    });

    await Promise.all(promises);
    res.json({ success: true });
  } catch (error) {
    console.error('Error enviando notificación:', error);
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
});

module.exports = router;