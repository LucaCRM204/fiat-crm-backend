const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
require('dotenv').config();

const authRouter = require('./routes/auth');
const leadsRouter = require('./routes/leads');
const presupuestosRouter = require('./routes/presupuestos');

// Rutas opcionales con manejo de errores
let usersRouter, notasRouter, recordatoriosRouter, cotizacionesRouter, tareasRouter, pushRouter, metasRouter;

try { 
  usersRouter = require('./routes/users'); 
} catch (err) { 
  console.warn('⚠️ Ruta users no disponible:', err.message);
  usersRouter = null; 
}

try {
  notasRouter = require('./routes/notas');
} catch (err) {
  console.warn('⚠️ Ruta notas no disponible:', err.message);
  notasRouter = null;
}

try {
  recordatoriosRouter = require('./routes/recordatorios');
} catch (err) {
  console.warn('⚠️ Ruta recordatorios no disponible:', err.message);
  recordatoriosRouter = null;
}

try {
  cotizacionesRouter = require('./routes/cotizaciones');
} catch (err) {
  console.warn('⚠️ Ruta cotizaciones no disponible:', err.message);
  cotizacionesRouter = null;
}

try {
  tareasRouter = require('./routes/tareas');
} catch (err) {
  console.warn('⚠️ Ruta tareas no disponible:', err.message);
  tareasRouter = null;
}

try {
  pushRouter = require('./routes/push');
} catch (err) {
  console.warn('⚠️ Ruta push no disponible:', err.message);
  pushRouter = null;
}

try {
  metasRouter = require('./routes/metas');
  console.log('✅ Módulo metas cargado correctamente');
} catch (err) {
  console.warn('⚠️ Ruta metas no disponible:', err.message);
  console.error('   Detalle del error:', err);
  metasRouter = null;
}

const app = express();

// Proxy (necesario para cookie Secure detrás de Railway)
app.set('trust proxy', 1);

// Middlewares
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(morgan('dev'));

// CORS configuration
const origins = (process.env.CORS_ORIGIN || '').split(',').map(s=>s.trim()).filter(Boolean);
const corsOpts = {
  origin: true,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-CSRF-Token','Accept'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOpts));
app.options('*', cors(corsOpts));

// Agregar pool de DB a req
const { pool } = require('./db');
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// ============================================
// RUTAS PRINCIPALES
// ============================================

console.log('🔍 Registrando authRouter...');
console.log('authRouter tipo:', typeof authRouter);
app.use('/api/auth', authRouter);
console.log('✅ authRouter registrado');

console.log('🔍 Registrando leadsRouter...');
console.log('leadsRouter tipo:', typeof leadsRouter);
app.use('/api/leads', leadsRouter);
console.log('✅ leadsRouter registrado');

console.log('🔍 Registrando presupuestosRouter...');
console.log('presupuestosRouter tipo:', typeof presupuestosRouter);
app.use('/api/presupuestos', presupuestosRouter);
console.log('✅ presupuestosRouter registrado');

// Rutas opcionales (solo si existen)
if (usersRouter) {
  app.use('/api/users', usersRouter);
  console.log('✅ Ruta /api/users registrada');
}

if (notasRouter) {
  app.use('/api/notas', notasRouter);
  console.log('✅ Ruta /api/notas registrada');
}

if (recordatoriosRouter) {
  app.use('/api/recordatorios', recordatoriosRouter);
  console.log('✅ Ruta /api/recordatorios registrada');
}

if (cotizacionesRouter) {
  app.use('/api/cotizaciones', cotizacionesRouter);
  console.log('✅ Ruta /api/cotizaciones registrada');
}

if (tareasRouter) {
  app.use('/api/tareas', tareasRouter);
  console.log('✅ Ruta /api/tareas registrada');
}

if (pushRouter) {
  app.use('/api/push', pushRouter);
  console.log('✅ Ruta /api/push registrada');
}

if (metasRouter) {
  app.use('/api/metas', metasRouter);
  console.log('✅ Ruta /api/metas registrada');
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(),
    version: '1.3.0',
    features: {
      users: !!usersRouter,
      notas: !!notasRouter,
      recordatorios: !!recordatoriosRouter,
      cotizaciones: !!cotizacionesRouter,
      tareas: !!tareasRouter,
      push: !!pushRouter,
      metas: !!metasRouter,
    }
  });
});

// Ruta raíz
app.get('/', (_req, res) => {
  res.json({ 
    message: 'Alluma CRM Backend API', 
    version: '1.3.0',
    endpoints: {
      auth: '/api/auth',
      users: usersRouter ? '/api/users' : null,
      leads: '/api/leads',
      presupuestos: '/api/presupuestos',
      notas: notasRouter ? '/api/notas' : null,
      recordatorios: recordatoriosRouter ? '/api/recordatorios' : null,
      cotizaciones: cotizacionesRouter ? '/api/cotizaciones' : null,
      tareas: tareasRouter ? '/api/tareas' : null,
      push: pushRouter ? '/api/push' : null,
      metas: metasRouter ? '/api/metas' : null,
      health: '/api/health',
    }
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error en servidor:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════╗');
  console.log(`🚀 Alluma CRM Backend v1.3.0`);
  console.log(`📡 Servidor escuchando en puerto: ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('╠═══════════════════════════════════════╣');
  console.log('📋 Funcionalidades disponibles:');
  console.log(`   ✅ Auth & Leads & Presupuestos`);
  console.log(`   ${usersRouter ? '✅' : '⚠️'} Users`);
  console.log(`   ${notasRouter ? '✅' : '⚠️'} Notas Internas`);
  console.log(`   ${recordatoriosRouter ? '✅' : '⚠️'} Recordatorios`);
  console.log(`   ${cotizacionesRouter ? '✅' : '⚠️'} Cotizaciones`);
  console.log(`   ${tareasRouter ? '✅' : '⚠️'} Tareas`);
  console.log(`   ${pushRouter ? '✅' : '⚠️'} Push Notifications`);
  console.log(`   ${metasRouter ? '✅' : '⚠️'} Metas`);
  console.log('╚═══════════════════════════════════════╝');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔴 SIGTERM recibido. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🔴 SIGINT recibido. Cerrando servidor...');
  process.exit(0);
});