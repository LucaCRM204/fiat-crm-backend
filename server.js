require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configurado para múltiples orígenes
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL
].filter(Boolean); // Elimina valores undefined

app.use(cors({
  origin: function(origin, callback) {
    // Permitir requests sin origin (Postman, apps móviles, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Origen bloqueado por CORS: ${origin}`);
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alluma_crm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000 // 60 segundos
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Base de datos conectada correctamente');
    console.log(`📊 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a la base de datos:', err);
    console.error('Detalles del error:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    });
  });

// Make pool available to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/presupuestos', require('./routes/presupuestos'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'FIAT CRM API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DB_NAME
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'FIAT CRM Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      leads: '/api/leads',
      presupuestos: '/api/presupuestos'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.path,
    method: req.method
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  
  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({ 
      error: 'Acceso bloqueado por CORS',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════╗
║     FIAT CRM - Backend Activo         ║
║     Puerto: ${PORT}                         ║
║     Base de datos: ${process.env.DB_NAME || 'alluma_crm'}       ║
║     Entorno: ${process.env.NODE_ENV || 'development'}        ║
║     CORS: ${allowedOrigins.length} orígenes permitidos  ║
╚═══════════════════════════════════════╝
  `);
  console.log('🌐 Orígenes permitidos:', allowedOrigins);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

module.exports = app;