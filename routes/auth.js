const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, allowInactiveUsers } = req.body;

    console.log('🔐 Intento de login:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Buscar usuario
    const [users] = await req.db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const user = users[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log('❌ Contraseña incorrecta para:', email);
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    // Verificar si está activo (a menos que se permita usuarios inactivos)
    if (!allowInactiveUsers && !user.active) {
      console.log('⚠️ Usuario inactivo:', email);
      return res.status(401).json({ 
        error: 'Tu cuenta está desactivada. Contacta al administrador para más información.' 
      });
    }

    // Generar token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Retornar datos del usuario (sin password)
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      reportsTo: user.reportsTo,
      active: user.active
    };

    console.log('✅ Login exitoso:', email, '- Rol:', user.role);

    res.json({
      ok: true,
      token,
      user: userData
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor al procesar el login' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req, res) => {
  console.log('👋 Logout:', req.user.email);
  res.json({ ok: true, message: 'Sesión cerrada correctamente' });
});

// Verificar token
router.get('/verify', authMiddleware, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;