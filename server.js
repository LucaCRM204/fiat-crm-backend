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
let usersRouter, recordatoriosRouter, cotizacionesRouter, tareasRouter, pushRouter, metasRouter;
try { 
  usersRouter = require('./routes/users'); 
} catch (err) { 
  console.warn('⚠️ Ruta users no disponible:', err.message);
  usersRouter = null; 
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
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-CSRF-Token','Accept'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOpts));
app.options('*', cors(corsOpts));

// ← AGREGAR ESTAS LÍNEAS AQUÍ
const { pool } = require('./db');
app.use((req, res, next) => {
  req.db = pool;
  next();
});
// FIN DEL CÓDIGO NUEVO

// ============================================
// RUTAS PRINCIPALES
// ============================================

app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/presupuestos', presupuestosRouter);
app.use('/api/webhooks', require('./routes/webhooks'));

// Rutas opcionales (solo si existen)
if (usersRouter) app.use('/api/users', usersRouter);
if (recordatoriosRouter) app.use('/api/recordatorios', recordatoriosRouter);
if (cotizacionesRouter) app.use('/api/cotizaciones', cotizacionesRouter);
if (tareasRouter) app.use('/api/tareas', tareasRouter);
if (pushRouter) app.use('/api/push', pushRouter);
if (metasRouter) {
  try {
    app.use('/api/metas', metasRouter);
    console.log('✅ Ruta /api/metas registrada');
  } catch (err) {
    console.error('❌ Error registrando ruta metas:', err.message);
  }
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(),
    version: '1.2.0',
    features: {
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
    version: '1.2.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      leads: '/api/leads',
      presupuestos: '/api/presupuestos',
      recordatorios: recordatoriosRouter ? '/api/recordatorios' : null,
      cotizaciones: cotizacionesRouter ? '/api/cotizaciones' : null,
      tareas: tareasRouter ? '/api/tareas' : null,
      push: pushRouter ? '/api/push' : null,
      metas: metasRouter ? '/api/metas' : null,
      webhooks: '/api/webhooks',
      health: '/api/health',
    }
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════╗');
  console.log(`🚀 Alluma CRM Backend v1.2.0`);
  console.log(`📡 Servidor escuchando en puerto: ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('╠═══════════════════════════════════════╣');
  console.log('📋 Funcionalidades disponibles:');
  console.log(`   ✅ Auth & Users`);
  console.log(`   ✅ Leads & Presupuestos`);
  console.log(`   ${recordatoriosRouter ? '✅' : '⚠️'} Recordatorios`);
  console.log(`   ${cotizacionesRouter ? '✅' : '⚠️'} Cotizaciones`);
  console.log(`   ${tareasRouter ? '✅' : '⚠️'} Tareas`);
  console.log(`   ${pushRouter ? '✅' : '⚠️'} Push Notifications`);
  console.log(`   ${metasRouter ? '✅' : '⚠️'} Metas`);
  console.log('╚═══════════════════════════════════════╝');
  
  // Iniciar cron jobs
  initCronJobs();
});

// ============================================
// CRON JOBS
// ============================================

function initCronJobs() {
  console.log('⏰ Iniciando cron jobs...');

  // Importar servicios
  let tareasService, recordatoriosService, pushService;
  
  try {
    tareasService = require('./services/tareas');
  } catch (err) {
    console.warn('   ⚠️  Servicio de tareas no disponible');
  }

  try {
    recordatoriosService = require('./services/recordatorios');
  } catch (err) {
    console.warn('   ⚠️  Servicio de recordatorios no disponible');
  }

  try {
    pushService = require('./services/pushNotifications');
  } catch (err) {
    console.warn('   ⚠️  Servicio de push no disponible');
  }

  // ============================================
  // CRON 1: Generar tareas automáticas cada hora
  // ============================================
  if (tareasService && tareasService.generarTareasAutomaticas) {
    cron.schedule('0 * * * *', async () => {
      console.log('📋 [CRON] Generando tareas automáticas...');
      try {
        const tareas = await tareasService.generarTareasAutomaticas();
        console.log(`   ✅ ${tareas.length} tareas generadas`);
      } catch (error) {
        console.error('   ❌ Error generando tareas:', error.message);
      }
    });
    console.log('   ✅ Cron de tareas automáticas activo (cada hora)');
  }

  // ============================================
  // CRON 2: Verificar recordatorios pendientes cada 5 minutos
  // ============================================
  if (recordatoriosService && pushService) {
    cron.schedule('*/5 * * * *', async () => {
      try {
        if (recordatoriosService.getRecordatoriosPendientes) {
          const pendientes = await recordatoriosService.getRecordatoriosPendientes();
          
          if (pendientes.length > 0) {
            console.log(`🔔 [CRON] ${pendientes.length} recordatorios pendientes`);
            
            // Enviar notificaciones push
            if (pushService.notifyRecordatorio) {
              for (const recordatorio of pendientes) {
                try {
                  await pushService.notifyRecordatorio(recordatorio);
                  console.log(`   ✅ Push enviado para recordatorio ${recordatorio.id}`);
                } catch (err) {
                  console.error(`   ❌ Error enviando push:`, err.message);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('   ❌ Error verificando recordatorios:', error.message);
      }
    });
    console.log('   ✅ Cron de recordatorios activo (cada 5 minutos)');
  }

  // ============================================
  // CRON 3: Limpiar tareas completadas antiguas (cada día a las 3 AM)
  // ============================================
  if (tareasService && tareasService.limpiarTareasAntiguas) {
    cron.schedule('0 3 * * *', async () => {
      console.log('🧹 [CRON] Limpiando tareas antiguas...');
      try {
        const eliminadas = await tareasService.limpiarTareasAntiguas();
        console.log(`   ✅ ${eliminadas} tareas antiguas eliminadas`);
      } catch (error) {
        console.error('   ❌ Error limpiando tareas:', error.message);
      }
    });
    console.log('   ✅ Cron de limpieza activo (diario a las 3 AM)');
  }

  // ============================================
  // CRON 4: Generar tareas urgentes cada 30 minutos
  // ============================================
  if (tareasService && pushService) {
    cron.schedule('*/30 * * * *', async () => {
      try {
        if (tareasService.getTareasUrgentes) {
          const urgentes = await tareasService.getTareasUrgentes();
          
          if (urgentes.length > 0) {
            console.log(`⚠️  [CRON] ${urgentes.length} tareas urgentes sin completar`);
            
            // Notificar tareas urgentes
            if (pushService.notifyTareaUrgente) {
              for (const tarea of urgentes) {
                try {
                  await pushService.notifyTareaUrgente(tarea);
                } catch (err) {
                  console.error(`   ❌ Error notificando tarea urgente:`, err.message);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('   ❌ Error verificando tareas urgentes:', error.message);
      }
    });
    console.log('   ✅ Cron de tareas urgentes activo (cada 30 minutos)');
  }

  console.log('╔═══════════════════════════════════════╗');
  console.log('✅ Sistema de cron jobs inicializado');
  console.log('╚═══════════════════════════════════════╝\n');
}

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
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