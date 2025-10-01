const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Listar usuarios
router.get('/', async (req, res) => {
  try {
    const [users] = await req.db.query(
      'SELECT id, name, email, role, reportsTo, active, created_at, updated_at FROM users ORDER BY id ASC'
    );
    console.log(`📋 Listado de ${users.length} usuarios`);
    res.json(users);
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Obtener un usuario específico
router.get('/:id', async (req, res) => {
  try {
    const [users] = await req.db.query(
      'SELECT id, name, email, role, reportsTo, active, created_at, updated_at FROM users WHERE id = ?',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// Crear usuario (solo owner, gerente_general, gerente)
router.post('/', checkRole('owner', 'gerente_general', 'gerente'), async (req, res) => {
  try {
    const { name, email, password, role, reportsTo, active } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos: name, email, password, role' });
    }

    // Verificar si el email ya existe
    const [existing] = await req.db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado en el sistema' });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario
    const [result] = await req.db.query(
      'INSERT INTO users (name, email, password, role, reportsTo, active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, reportsTo || null, active !== undefined ? active : 1]
    );

    // Obtener el usuario creado
    const [newUser] = await req.db.query(
      'SELECT id, name, email, role, reportsTo, active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    console.log(`✅ Usuario creado: ${email} - Rol: ${role}`);
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Actualizar usuario
router.put('/:id', checkRole('owner', 'gerente_general', 'gerente'), async (req, res) => {
  try {
    const { name, email, password, role, reportsTo, active } = req.body;
    const userId = req.params.id;

    // Verificar que el usuario existe
    const [users] = await req.db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Preparar la actualización
    let updateQuery = 'UPDATE users SET name = ?, email = ?, role = ?, reportsTo = ?, active = ?';
    let params = [name, email, role, reportsTo || null, active !== undefined ? active : 1];

    // Si hay nueva contraseña, agregarla
    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password = ?';
      params.push(hashedPassword);
    }

    updateQuery += ' WHERE id = ?';
    params.push(userId);

    await req.db.query(updateQuery, params);

    // Obtener el usuario actualizado
    const [updatedUser] = await req.db.query(
      'SELECT id, name, email, role, reportsTo, active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    console.log(`✅ Usuario actualizado: ${email}`);
    res.json(updatedUser[0]);
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Eliminar usuario (solo owner)
router.delete('/:id', checkRole('owner'), async (req, res) => {
  try {
    const userId = req.params.id;

    // Verificar que no es el owner
    const [user] = await req.db.query('SELECT role, email FROM users WHERE id = ?', [userId]);
    if (user.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user[0].role === 'owner') {
      return res.status(400).json({ error: 'No se puede eliminar al Owner del sistema' });
    }

    // Verificar que no tiene subordinados
    const [subordinados] = await req.db.query('SELECT id, name FROM users WHERE reportsTo = ?', [userId]);
    if (subordinados.length > 0) {
      return res.status(400).json({ 
        error: 'El usuario tiene subordinados reportando a él. Debes reasignarlos primero.',
        subordinados: subordinados.map(s => s.name)
      });
    }

    // Verificar que no tiene leads asignados
    const [leads] = await req.db.query('SELECT id FROM leads WHERE assigned_to = ?', [userId]);
    if (leads.length > 0) {
      return res.status(400).json({ 
        error: `El usuario tiene ${leads.length} lead(s) asignado(s). Debes reasignarlos primero.`,
        leadsCount: leads.length
      });
    }

    // Eliminar usuario
    await req.db.query('DELETE FROM users WHERE id = ?', [userId]);

    console.log(`🗑️ Usuario eliminado: ${user[0].email}`);
    res.json({ ok: true, message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;