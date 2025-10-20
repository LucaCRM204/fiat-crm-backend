// routes/webhooks.js
const express = require('express');
const router = express.Router();

// Webhook para Meta/Facebook
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

// Webhook para WhatsApp Bot
router.post('/whatsapp', async (req, res) => {
  try {
    console.log('📩 Webhook WhatsApp recibido:', JSON.stringify(req.body, null, 2));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error en webhook WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;