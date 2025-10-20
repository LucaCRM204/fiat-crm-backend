const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'alluma_crm_secret_key_2024';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
    }
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const [users] = await req.db.query(
      'SELECT id, name, email, role, reportsTo, active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (users.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    req.user = users[0];
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Por favor inicia sesión nuevamente.' });
    }
    res.status(500).json({ error: 'Error en la autenticación' });
  }
};

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para realizar esta acción',
        requiredRoles: allowedRoles,
        yourRole: req.user.role
      });
    }
    next();
  };
};

// CAMBIA ESTA LÍNEA:
module.exports = authMiddleware; // Exporta directamente el middleware
module.exports.checkRole = checkRole; // Exporta checkRole como propiedad
module.exports.JWT_SECRET = JWT_SECRET; // Exporta JWT_SECRET como propiedad