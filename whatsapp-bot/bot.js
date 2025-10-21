const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const db = require('../db'); // ✅ Solo necesitamos db
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Configuración del Bot
const BOT_CONFIG = {
  BOT_ID: 'BOT-FIAT',
  BOT_NAME: 'Martín',
  COMPANY: 'Auto del sol - FIAT',
  SESSION_DIR: './whatsapp-bot/auth_info',
  CRM_SOURCE: 'whatsapp',
  MARCA: 'FIAT'
};

// Modelos FIAT disponibles
const MODELOS_FIAT = {
  'titano': { 
    nombre: 'TITANO ENDURANCE MT 4X4',
    valor: '$48.694.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$17.042.900'
  },
  'argo': { 
    nombre: 'ARGO DRIVE 1.3 MT',
    valor: '$27.898.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$9.764.300'
  },
  'cronos_7030': { 
    nombre: 'CRONOS DRIVE 1.3 MT5 (Plan 70/30)',
    valor: '$32.820.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$11.487.000'
  },
  'cronos_9010': { 
    nombre: 'CRONOS DRIVE 1.3 MT5 (Plan 90/10)',
    valor: '$32.820.000',
    plan: '90/10 - 84 cuotas',
    anticipo: '$8.205.000'
  },
  'fastback': { 
    nombre: 'FASTBACK TURBO 270 AT6',
    valor: '$40.653.000',
    plan: '60/40 - 84 cuotas',
    anticipo: '$16.261.200'
  },
  'mobi': { 
    nombre: 'MOBI TREKKING 1.0',
    valor: '$24.096.000',
    plan: '80/20 - 84 cuotas',
    anticipo: '$7.228.800'
  },
  'toro': { 
    nombre: 'TORO FREEDOM T270 AT6 4X2',
    valor: '$42.390.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$16.956.000'
  },
  'pulse': { 
    nombre: 'PULSE DRIVE 1.3L MT',
    valor: '$32.833.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$11.491.550'
  },
  'fiorino': { 
    nombre: 'FIORINO ENDURANCE 1.4L',
    valor: '$27.459.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$10.983.600'
  },
  'strada': { 
    nombre: 'STRADA FREEDOM CD',
    valor: '$33.660.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$13.464.000'
  }
};

// Almacenamiento
const datosCliente = new Map();
const temporizadores = new Map();
const contactosBloqueados = new Map();
let sockGlobal = null;
let socketConectado = false;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

const logger = pino({ level: 'silent' });

// Sistema de logging
function log(nivel, mensaje, data = null) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${BOT_CONFIG.BOT_ID}] ${nivel}: ${mensaje}`;
  console.log(logMsg);
  
  if (data) {
    console.log(`[${BOT_CONFIG.BOT_ID}] Data:`, JSON.stringify(data, null, 2));
  }
  
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, `bot-fiat-${new Date().toISOString().split('T')[0]}.log`);
  try {
    fs.appendFileSync(logFile, logMsg + (data ? '\nData: ' + JSON.stringify(data) : '') + '\n');
  } catch (error) {
    console.error(`Error escribiendo log:`, error);
  }
}

// Test de conexión a BD
async function testConexion() {
  try {
    log('INFO', '🔍 Iniciando test de conexión a BD...');
    
    const [result] = await db.query('SELECT DATABASE() as db_name');
    log('INFO', `📊 Base de datos: ${result[0].db_name}`);
    
    const [totalResult] = await db.query('SELECT COUNT(*) as total FROM users');
    log('INFO', `👥 Total usuarios: ${totalResult[0].total}`);
    
    const [vendedoresResult] = await db.query(`SELECT COUNT(*) as total FROM users WHERE role = 'vendedor' AND active = 1`);
    log('INFO', `✅ Vendedores activos: ${vendedoresResult[0].total}`);
    
  } catch (error) {
    log('ERROR', '❌ Error en test de conexión:', error.message);
  }
}

// Extraer número real - LÓGICA MEJORADA
async function obtenerNumeroReal(msg, sock) {
  try {
    const from = msg.key.remoteJid;
    
    // 1. Intentar participant primero
    if (msg.key.participant && !msg.key.participant.includes('lid')) {
      const numero = msg.key.participant.split('@')[0];
      log('INFO', `✅ Número extraído de participant: ${numero}`);
      return numero;
    }
    
    // 2. Si es @s.whatsapp.net normal
    if (from && from.includes('@s.whatsapp.net') && !from.includes('lid')) {
      const numero = from.split('@')[0];
      log('INFO', `✅ Número extraído de remoteJid: ${numero}`);
      return numero;
    }
    
    // 3. Si es @lid, intentar múltiples métodos
    if (from && from.includes('@lid')) {
      log('WARN', `⚠️ Contacto @lid detectado: ${from}`);
      
      try {
        // Método A: Buscar números en el objeto del mensaje
        const msgString = JSON.stringify(msg);
        const numberMatches = msgString.match(/54\d{10,11}/g);
        if (numberMatches && numberMatches.length > 0) {
          const uniqueNumbers = [...new Set(numberMatches)];
          log('INFO', `📱 Números encontrados: ${uniqueNumbers.join(', ')}`);
          
          for (const num of uniqueNumbers) {
            if (num.length >= 12 && num.startsWith('54')) {
              log('INFO', `✅ Número real encontrado: ${num}`);
              return num;
            }
          }
        }
        
        // Método B: contextInfo
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
          const participant = msg.message.extendedTextMessage.contextInfo.participant;
          if (!participant.includes('lid')) {
            const numero = participant.split('@')[0];
            log('INFO', `✅ Número extraído de contextInfo: ${numero}`);
            return numero;
          }
        }
        
      } catch (error) {
        log('ERROR', `Error resolviendo @lid: ${error.message}`);
      }
      
      log('ERROR', `❌ No se pudo resolver @lid: ${from}`);
      return null;
    }
    
    // 4. Fallback
    const numero = from.split('@')[0];
    if (numero && numero.length >= 10 && !numero.includes('lid')) {
      log('INFO', `✅ Número extraído (default): ${numero}`);
      return numero;
    }
    
    log('ERROR', `❌ No se pudo extraer número de: ${from}`);
    return null;
    
  } catch (error) {
    log('ERROR', 'Error extrayendo número:', error.message);
    return null;
  }
}

// Limpiar teléfono
function limpiarTelefonoWhatsApp(telefono, numeroReal = null) {
  try {
    if (numeroReal && !numeroReal.includes('lid')) {
      telefono = numeroReal;
    }
    
    telefono = String(telefono ?? '');
    
    if (telefono.includes('@lid') && !numeroReal) {
      log('ERROR', `No se pudo obtener número real de @lid`);
      return null;
    }
    
    let numeroLimpio = telefono.split('@')[0];
    let soloDigitos = numeroLimpio.replace(/\D/g, '');
    
    if (soloDigitos.length < 10) {
      log('ERROR', `Número muy corto: ${soloDigitos}`);
      return null;
    }
    
    let numeroFinal = soloDigitos;
    if (numeroFinal.startsWith('5454')) numeroFinal = numeroFinal.substring(2);
    if (numeroFinal.length === 10) numeroFinal = '549' + numeroFinal;
    else if (numeroFinal.length === 11 && numeroFinal.startsWith('9')) numeroFinal = '54' + numeroFinal;
    else if (numeroFinal.length === 12 && numeroFinal.startsWith('54')) numeroFinal = '549' + numeroFinal.substring(2);
    else if (!numeroFinal.startsWith('54') && numeroFinal.length >= 10) numeroFinal = '549' + numeroFinal.slice(-10);
    
    const telefonoFinal = '+' + numeroFinal;
    log('INFO', `✅ Teléfono final: ${telefonoFinal}`);
    return telefonoFinal;
  } catch (error) {
    log('ERROR', 'Error procesando teléfono:', error.message);
    return null;
  }
}

// ✅ NUEVA FUNCIÓN: Obtener vendedor disponible usando db.query directamente
async function obtenerVendedorDisponible() {
  try {
    log('INFO', '🔍 Buscando vendedor...');
    
    const [vendedores] = await db.query(
      `SELECT id, name FROM users 
       WHERE role = 'vendedor' AND active = 1 
       ORDER BY RAND() LIMIT 1`
    );
    
    if (vendedores.length > 0) {
      log('INFO', `✅ Vendedor: ${vendedores[0].name} (ID: ${vendedores[0].id})`);
      return vendedores[0].id;
    }
    
    log('WARN', '⚠️ No hay vendedores activos');
    return null;
    
  } catch (error) {
    log('ERROR', `❌ Error obteniendo vendedor: ${error.message}`);
    return null;
  }
}

// Detectar modelo
function detectarModelo(texto) {
  const textoLower = texto.toLowerCase().trim();
  
  const modelosArray = Object.entries(MODELOS_FIAT);
  const numero = parseInt(textoLower);
  if (!isNaN(numero) && numero >= 1 && numero <= modelosArray.length) {
    const [key, data] = modelosArray[numero - 1];
    return { key, ...data };
  }
  
  for (const [key, data] of Object.entries(MODELOS_FIAT)) {
    const nombreLower = data.nombre.toLowerCase();
    if (textoLower.includes(key) || nombreLower.includes(textoLower) || textoLower.includes(nombreLower.split(' ')[0])) {
      return { key, ...data };
    }
  }
  
  return null;
}

// Enviar mensaje seguro
async function enviarMensajeSeguro(sock, destinatario, contenido, reintentos = 3) {
  for (let i = 0; i < reintentos; i++) {
    try {
      if (!socketConectado || !sockGlobal) {
        log('WARN', `Socket no conectado (intento ${i + 1}/${reintentos})`);
        await new Promise(r => setTimeout(r, 2000));
        
        if (socketConectado && sockGlobal) {
          sock = sockGlobal;
        } else {
          continue;
        }
      }

      await sockGlobal.sendMessage(destinatario, contenido);
      log('INFO', `✅ Mensaje enviado`);
      return true;
      
    } catch (error) {
      log('WARN', `⚠️ Intento ${i + 1}/${reintentos} falló: ${error.message}`);
      if (i < reintentos - 1) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }
  
  log('ERROR', '❌ No se pudo enviar mensaje después de reintentos');
  return false;
}

// ✅ NUEVA FUNCIÓN: Crear lead directamente con db.query
async function crearLeadEnCRM(leadData) {
  try {
    log('INFO', `Creando lead: ${leadData.nombre}`);
    
    const telefonoLimpio = limpiarTelefonoWhatsApp(leadData.telefono, leadData.numeroReal);
    
    if (!telefonoLimpio) {
      log('WARN', `Número inválido`);
      return { success: false, error: 'NUMERO_INVALIDO' };
    }

    const vendedorId = await obtenerVendedorDisponible();
    
    // Obtener el nombre del vendedor
    let nombreVendedor = 'Sin asignar';
    if (vendedorId) {
      const [vendedorData] = await db.query('SELECT name FROM users WHERE id = ?', [vendedorId]);
      nombreVendedor = vendedorData[0]?.name || 'Sin asignar';
    }

    // Historial inicial
    const historialInicial = JSON.stringify([
      {
        estado: 'nuevo',
        timestamp: new Date().toISOString(),
        usuario: BOT_CONFIG.BOT_NAME
      },
      ...(vendedorId ? [{
        estado: `Asignado automáticamente a ${nombreVendedor} (Bot WhatsApp)`,
        timestamp: new Date().toISOString(),
        usuario: 'Sistema'
      }] : [])
    ]);

    // Insertar lead en la base de datos
    const [result] = await db.query(
      `INSERT INTO leads 
      (nombre, telefono, modelo, formaPago, infoUsado, entrega, notas, estado, fuente, fecha, assigned_to, equipo, historial, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadData.nombre,
        telefonoLimpio,
        leadData.modelo || 'Consultar',
        'A definir',
        '',
        0,
        `[${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.MARCA}]
🤖 ${BOT_CONFIG.BOT_ID}
📞 ${telefonoLimpio}
🎯 WhatsApp Bot
${vendedorId ? `👤 Vendedor: ${nombreVendedor}` : '⚠️ Sin vendedor'}

📋 DATOS:
- ${leadData.nombre}
- ${leadData.modelo || 'A consultar'}`,
        'nuevo',
        BOT_CONFIG.CRM_SOURCE,
        new Date().toISOString().split('T')[0],
        vendedorId || null,
        'roberto',
        historialInicial,
        vendedorId || null
      ]
    );

    log('INFO', `✅ Lead creado: ID ${result.insertId}`);
    return { success: true, data: { id: result.insertId } };

  } catch (error) {
    log('ERROR', `❌ Error creando lead: ${error.message}`);
    
    try {
      const fallbackDir = path.join(__dirname, 'fallback-leads');
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      
      const filename = path.join(fallbackDir, `lead-${Date.now()}.json`);
      fs.writeFileSync(filename, JSON.stringify({
        ...leadData,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      log('INFO', `💾 Guardado en fallback`);
    } catch (e) {
      log('ERROR', 'Error en fallback', e.message);
    }
    
    return { success: false, error: error.message };
  }
}

// Temporizador 20 minutos
function iniciarTemporizador(from, cliente, sock) {
  if (temporizadores.has(from)) {
    clearTimeout(temporizadores.get(from));
  }
  
  const timer = setTimeout(async () => {
    const datos = datosCliente.get(from);
    if (!datos) return;

    const respondioAlgo = datos.nombre || datos.modelo;

    const payload = {
      nombre: datos.nombre || (respondioAlgo ? 'Lead sin nombre' : 'Lead Incompleto'),
      telefono: from,
      numeroReal: datos.numeroReal,
      modelo: datos.modelo || ''
    };

    await crearLeadEnCRM(payload);

    await enviarMensajeSeguro(sock, from, {
      text: `Pasó un tiempo sin respuesta, pero no te preocupes 😊\n\nYa derivé tu info para que un asesor te contacte 🚗`
    });

    datosCliente.delete(from);
    temporizadores.delete(from);
  }, 1200000); // 20 minutos

  temporizadores.set(from, timer);
}

// Procesar mensajes
async function procesarMensaje(sock, msg) {
  try {
    const numeroReal = await obtenerNumeroReal(msg, sock);
    const from = msg.key.remoteJid;
    
    log('INFO', `📱 Mensaje de: ${numeroReal || 'desconocido'}`);
    
    if (!msg.message || Object.keys(msg.message).length === 0) {
      return;
    }

    let texto = '';
    if (msg.message?.conversation) texto = msg.message.conversation;
    else if (msg.message?.extendedTextMessage?.text) texto = msg.message.extendedTextMessage.text;
    else if (msg.message?.buttonsResponseMessage?.selectedButtonId) texto = msg.message.buttonsResponseMessage.selectedButtonId;
    else if (msg.message?.templateButtonReplyMessage?.selectedId) texto = msg.message.templateButtonReplyMessage.selectedId;
    else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) texto = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    else return;

    // SI NO hay número real, solicitar
    if (!numeroReal) {
      log('WARN', `⚠️ No se pudo obtener número`);
      
      if (!datosCliente.has(from)) {
        datosCliente.set(from, { 
          paso: 'solicitar_telefono',
          numeroReal: null,
          esLid: true,
          pushName: msg.pushName || 'Cliente'
        });
        
        await enviarMensajeSeguro(sock, from, {
          text: `Hola! Soy *${BOT_CONFIG.BOT_NAME}* 👋\n\n*Felicitaciones!* Fuiste seleccionado para la *PROMO MUNDIAL 2026* 🏆\n\n📱 Necesito tu número de WhatsApp con código de área.\n\n💡 Ejemplo: *11 2345 6789*`
        });
        return;
      }
      
      const cliente = datosCliente.get(from);
      
      if (cliente.paso === 'solicitar_telefono') {
        const textoLimpio = texto.replace(/\D/g, '');
        
        if (textoLimpio.length >= 10) {
          let numeroExtraido = textoLimpio;
          
          if (numeroExtraido.length === 10) numeroExtraido = '549' + numeroExtraido;
          else if (numeroExtraido.length === 11 && numeroExtraido.startsWith('9')) numeroExtraido = '54' + numeroExtraido;
          else if (numeroExtraido.length === 12 && numeroExtraido.startsWith('54')) numeroExtraido = '549' + numeroExtraido.substring(2);
          else if (!numeroExtraido.startsWith('54') && numeroExtraido.length >= 10) numeroExtraido = '549' + numeroExtraido.slice(-10);
          
          cliente.numeroReal = numeroExtraido;
          cliente.paso = 'modelo';
          
          log('INFO', `✅ Número obtenido: ${numeroExtraido}`);
          
          const listaModelos = Object.entries(MODELOS_FIAT)
            .map(([key, data], index) => `${index + 1}️⃣ ${data.nombre}`)
            .join('\n');
          
          iniciarTemporizador(from, cliente, sock);
          
          await enviarMensajeSeguro(sock, from, {
            text: `Perfecto! 👍\n\n¿Qué modelo de FIAT te gustaría?\n\n${listaModelos}\n\n_Escribí el número o nombre_`
          });
          return;
        } else {
          await enviarMensajeSeguro(sock, from, {
            text: '📱 Necesito un número válido.\n\n💡 Ejemplo: *11 2345 6789*'
          });
          return;
        }
      }
    }

    log('INFO', `✅ Procesando con número: ${numeroReal}`);

    // Iniciar conversación
    if (!datosCliente.has(from)) {
      datosCliente.set(from, { 
        paso: 'modelo',
        numeroReal: numeroReal
      });
      iniciarTemporizador(from, datosCliente.get(from), sock);

      const listaModelos = Object.entries(MODELOS_FIAT)
        .map(([key, data], index) => `${index + 1}️⃣ ${data.nombre}`)
        .join('\n');

      await enviarMensajeSeguro(sock, from, {
        text: `Hola! Soy *${BOT_CONFIG.BOT_NAME}* 👋\n\nTu asistente de *${BOT_CONFIG.COMPANY}*\n\n*Felicitaciones!* Fuiste seleccionado para la *PROMO MUNDIAL 2026* 🏆\n\n¿Qué modelo FIAT te gustaría?\n\n${listaModelos}\n\n_Escribí el número o nombre_`
      });
      return;
    }

    const cliente = datosCliente.get(from);

    // PASO 1: Modelo
    if (cliente.paso === 'modelo') {
      const modelo = detectarModelo(texto);

      if (!modelo) {
        await enviarMensajeSeguro(sock, from, {
          text: 'No entendí el modelo 😅\n\nRespondé con el *número* o *nombre*'
        });
        return;
      }

      cliente.modelo = modelo.nombre;
      cliente.paso = 'nombre';
      iniciarTemporizador(from, cliente, sock);

      await enviarMensajeSeguro(sock, from, {
        text: `Excelente! El *${modelo.nombre}* es increíble 🚗✨\n\n¿Cuál es tu nombre completo?`
      });
      return;
    }

    // PASO 2: Nombre
    if (cliente.paso === 'nombre') {
      cliente.nombre = texto;
      
      if (temporizadores.has(from)) {
        clearTimeout(temporizadores.get(from));
        temporizadores.delete(from);
      }

      await enviarMensajeSeguro(sock, from, {
        text: `Gracias, *${cliente.nombre.charAt(0).toUpperCase() + cliente.nombre.slice(1)}*! 🎉\n\nUn especialista te contactará pronto.\n\n✨ *BENEFICIOS EXCLUSIVOS:* ✨\n\n🏆 ADJUDICACIÓN ASEGURADA\n🔑 ENTREGA LLAVE X LLAVE\n⛽ TANQUE LLENO\n💰 12 CUOTAS BONIFICADAS\n🎁 VOUCHER $1.000.000\n🎨 POLARIZADO\n🏖️ VOUCHER VACACIONAL\n👥 PROMO AMIGOS\n\n*¡Y MUCHOS MÁS!* 🎁`
      });

      const leadData = {
        nombre: cliente.nombre,
        telefono: from,
        numeroReal: cliente.numeroReal,
        modelo: cliente.modelo
      };

      await crearLeadEnCRM(leadData);

      datosCliente.delete(from);
    }

  } catch (error) {
    log('ERROR', `Error: ${error.message}`);
  }
}

// Iniciar bot
async function startBot() {
  if (isReconnecting) {
    log('WARN', '⏳ Reconexión en progreso...');
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Máximo de intentos alcanzado`);
    reconnectAttempts = 0;
    setTimeout(() => startBot(), 300000);
    return;
  }

  isReconnecting = true;
  
  try {
    log('INFO', `🚀 Iniciando ${BOT_CONFIG.BOT_NAME}... (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
    await testConexion();
    
    const { version } = await fetchLatestBaileysVersion();
    log('INFO', `📦 Baileys: ${version.join('.')}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.SESSION_DIR);
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['FIAT Bot', 'Chrome', '20.0.04'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 3000,
      qrTimeout: 60000,
      logger
    });
    
    sockGlobal = sock;
    
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        console.clear();
        console.log(`\n${'='.repeat(50)}`);
        console.log(`QR PARA ${BOT_CONFIG.BOT_NAME} (${BOT_CONFIG.MARCA}):`);
        console.log(`${'='.repeat(50)}\n`);
        qrcode.generate(qr, { small: true });
        console.log(`\n${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.BOT_ID}`);
        console.log(`${'='.repeat(50)}\n`);
      }

      if (connection === 'close') {
        isReconnecting = false;
        sockGlobal = null;
        socketConectado = false;
        
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        log('WARN', `🔌 Conexión cerrada. Código: ${statusCode}`);
        
        if (statusCode === DisconnectReason.loggedOut) {
          log('ERROR', '🚫 Sesión cerrada - Escanear QR');
          reconnectAttempts = 0;
          return;
        }
        
        if (shouldReconnect) {
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 60000);
          log('INFO', `🔄 Reconectando en ${delay/1000}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => {
            isReconnecting = false;
            startBot();
          }, delay);
        }
      }

      if (connection === 'open') {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`✅ ${BOT_CONFIG.BOT_NAME} CONECTADO!`);
        console.log(`${BOT_CONFIG.BOT_ID} - ${BOT_CONFIG.MARCA}`);
        console.log(`⏱️  Temporizador: 20 minutos`);
        console.log(`${'='.repeat(50)}\n`);
        log('INFO', '✅ Conectado');
        
        isReconnecting = false;
        reconnectAttempts = 0;
        sockGlobal = sock;
        socketConectado = true;
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      const msg = messages[0];
      if (msg.key.fromMe) return;
      if (msg.key.remoteJid.includes('@g.us')) return;

      await procesarMensaje(sock, msg);
    });

    return sock;

  } catch (error) {
    isReconnecting = false;
    socketConectado = false;
    log('ERROR', `💥 Error crítico: ${error.message}`);
    reconnectAttempts++;
    
    const delay = Math.min(10000 * reconnectAttempts, 60000);
    log('INFO', `🔄 Reintentando en ${delay/1000}s...`);
    setTimeout(() => {
      isReconnecting = false;
      startBot();
    }, delay);
  }
}

process.on('SIGINT', async () => {
  log('INFO', '🛑 Deteniendo bot...');
  socketConectado = false;
  if (sockGlobal) {
    await sockGlobal.logout();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('INFO', '🛑 Deteniendo bot...');
  socketConectado = false;
  if (sockGlobal) {
    await sockGlobal.logout();
  }
  process.exit(0);
});

module.exports = { startBot };