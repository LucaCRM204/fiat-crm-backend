const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const dotenv = require('dotenv');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const pino = require('pino');

dotenv.config();

const BOT_CONFIG = {
  BOT_ID: 'BOT-FIAT',
  BOT_NAME: 'Sofia',
  COMPANY: 'Auto del Sol',
  SESSION_DIR: './whatsapp-bot/auth-bot-fiat',
  CRM_SOURCE: 'whatsapp',
  MARCA: 'fiat',
  EQUIPO: process.env.BOT_EQUIPO || 'principal',
  INACTIVITY_TIMEOUT: parseInt(process.env.BOT_TIMEOUT || '600000') // 10 minutos en milisegundos
};

// Configuración del CRM
const CRM_CONFIG = {
  baseUrl: process.env.CRM_BASE_URL || "http://localhost:3001/api",
  timeout: 30000
};

// Modelos de FIAT con información completa
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
    anticipo: '$11.487.000',
    alias: ['cronos', 'cronos 70/30', 'cronos 7030']
  },
  'cronos_9010': { 
    nombre: 'CRONOS DRIVE 1.3 MT5 (Plan 90/10)',
    valor: '$32.820.000',
    plan: '90/10 - 84 cuotas',
    anticipo: '$8.205.000',
    alias: ['cronos 90/10', 'cronos 9010']
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

const datosCliente = {};
const temporizadores = {};
let sockGlobal = null;
let isReconnecting = false;
let reconnectAttempts = 0;
let socketConectado = false;
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
  
  const logFile = `logs/bot-fiat-${new Date().toISOString().split('T')[0]}.log`;
  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    fs.appendFileSync(logFile, logMsg + (data ? '\nData: ' + JSON.stringify(data) : '') + '\n');
  } catch (error) {
    console.error(`[${BOT_CONFIG.BOT_ID}] Error escribiendo log:`, error);
  }
}

// Obtener número real del contacto
async function obtenerNumeroReal(msg, sock) {
  try {
    const from = msg.key.remoteJid;
    
    // 1. Intentar obtener de participant primero
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
    
    // 3. Si es @lid, intentar resolverlo
    if (from && from.includes('@lid')) {
      log('WARN', `⚠️ Contacto @lid detectado: ${from}, intentando resolver...`);
      
      try {
        const msgString = JSON.stringify(msg);
        const numberMatches = msgString.match(/54\d{10,11}/g);
        if (numberMatches && numberMatches.length > 0) {
          const uniqueNumbers = [...new Set(numberMatches)];
          log('INFO', `📱 Números encontrados en mensaje: ${uniqueNumbers.join(', ')}`);
          return uniqueNumbers[0];
        }
      } catch (err) {
        log('WARN', `⚠️ Error buscando número en objeto mensaje: ${err.message}`);
      }
      
      log('WARN', `⚠️ No se pudo resolver @lid automáticamente: ${from}`);
      return null;
    }
    
    log('WARN', `⚠️ Formato de contacto no reconocido: ${from}`);
    return null;
    
  } catch (error) {
    log('ERROR', `❌ Error obteniendo número real: ${error.message}`);
    return null;
  }
}

// Función para buscar modelo por input del usuario
function encontrarModeloPorInput(input, modelos) {
  const inputLower = input.toLowerCase().trim();
  const inputNum = parseInt(inputLower);
  
  // Si es un número, buscar por índice
  const modelosArray = Object.entries(modelos);
  if (!isNaN(inputNum) && inputNum > 0 && inputNum <= modelosArray.length) {
    const [key, modelo] = modelosArray[inputNum - 1];
    return { key, ...modelo };
  }
  
  // Buscar por nombre o alias
  for (const [key, modelo] of modelosArray) {
    const nombreLower = modelo.nombre.toLowerCase();
    
    // Buscar coincidencia exacta o parcial
    if (nombreLower.includes(inputLower) || inputLower.includes(key)) {
      return { key, ...modelo };
    }
    
    // Buscar en alias si existen
    if (modelo.alias) {
      for (const alias of modelo.alias) {
        if (alias.toLowerCase().includes(inputLower) || inputLower.includes(alias.toLowerCase())) {
          return { key, ...modelo };
        }
      }
    }
  }
  
  return null;
}

// Temporizador de inactividad
function iniciarTemporizador(from, cliente, sock) {
  clearTimeout(temporizadores[from]);
  
  temporizadores[from] = setTimeout(async () => {
    log('INFO', `⏰ Timeout de inactividad para ${from}`);
    
    try {
      await enviarMensajeSeguro(sock, from, {
        text: '⏰ *Sesión finalizada por inactividad*\n\nGracias por tu interés en *Auto del Sol*.\n\nSi querés retomar la conversación, enviame un mensaje y con gusto te ayudaré. 😊'
      });
    } catch (error) {
      log('ERROR', `Error enviando mensaje de timeout: ${error.message}`);
    }
    
    delete datosCliente[from];
    delete temporizadores[from];
  }, BOT_CONFIG.INACTIVITY_TIMEOUT);
}

// Enviar mensaje con reintentos
async function enviarMensajeSeguro(sock, to, content, maxRetries = 3) {
  if (!socketConectado || !sock) {
    log('WARN', `⚠️ Socket no conectado, mensaje no enviado a ${to}`);
    return null;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sock.sendMessage(to, content);
      log('INFO', `✅ Mensaje enviado correctamente a ${to} (intento ${attempt})`);
      return result;
    } catch (error) {
      log('ERROR', `❌ Error enviando mensaje (intento ${attempt}/${maxRetries}): ${error.message}`);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }
}

// Enviar lead al CRM
async function enviarACRM(leadData) {
  try {
    log('INFO', '📤 Enviando lead al CRM...', leadData);
    
    const webhookSecret = process.env.WEBHOOK_SECRET || 'auto-del-sol-fiat-2024';
    
    const payload = {
      nombre: leadData.nombre,
      telefono: leadData.numeroReal || leadData.telefono,
      modelo: leadData.vehiculo,
      formaPago: 'Plan de ahorro',
      fuente: BOT_CONFIG.CRM_SOURCE,
      estado: 'nuevo',
      equipo: BOT_CONFIG.EQUIPO,
      notas: `Lead generado por bot WhatsApp ${BOT_CONFIG.BOT_NAME}\nMarca: ${BOT_CONFIG.MARCA.toUpperCase()}\nModelo consultado: ${leadData.vehiculo}`,
      webhookKey: webhookSecret
    };
    
    log('INFO', '📦 Payload para CRM:', payload);
    
    const response = await axios.post(
      `${CRM_CONFIG.baseUrl}/leads/bot-webhook`,
      payload,
      {
        timeout: CRM_CONFIG.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Key': webhookSecret
        }
      }
    );
    
    if (response.data && response.data.lead) {
      log('INFO', '✅ Lead guardado en CRM exitosamente', {
        id: response.data.lead.id,
        nombre: response.data.lead.nombre,
        vendedor: response.data.lead.vendedor || response.data.lead.assigned_to
      });
      
      if (response.data.lead.vendedor || response.data.lead.assigned_to) {
        log('INFO', `🎯 Lead asignado a vendedor ID: ${response.data.lead.vendedor || response.data.lead.assigned_to}`);
      }
    } else {
      log('WARN', '⚠️ Lead guardado pero respuesta inusual del CRM', response.data);
    }
    
    return response.data;
    
  } catch (error) {
    log('ERROR', '❌ Error enviando al CRM:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    if (error.response?.status === 401) {
      log('ERROR', '🔒 Error de autenticación con CRM - verificar credenciales');
    } else if (error.response?.status === 404) {
      log('ERROR', '🔍 Endpoint del CRM no encontrado - verificar URL');
    }
    
    throw error;
  }
}

// Inicialización del bot
const init = async () => {
  if (isReconnecting) {
    log('INFO', '⏳ Ya hay una reconexión en progreso...');
    return;
  }
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('ERROR', `❌ Máximo de intentos de reconexión alcanzado (${MAX_RECONNECT_ATTEMPTS})`);
    process.exit(1);
  }

  isReconnecting = true;

  try {
    log('INFO', '🚀 Iniciando bot de WhatsApp FIAT...');
    
    const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger,
      version,
      defaultQueryTimeoutMs: undefined,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      qrTimeout: 60000,
      browser: ['Bot FIAT', 'Chrome', '1.0.0']
    });

    sockGlobal = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log('INFO', '📱 QR Code generado:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        socketConectado = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        log('WARN', `⚠️ Conexión cerrada. ¿Reconectar? ${shouldReconnect}`);
        
        if (shouldReconnect) {
          isReconnecting = false;
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 30000);
          log('INFO', `🔄 Reintentando conexión en ${delay/1000} segundos...`);
          setTimeout(() => init(), delay);
        } else {
          log('ERROR', '❌ Bot desconectado (logout)');
          process.exit(0);
        }
      }

      if (connection === 'open') {
        socketConectado = true;
        isReconnecting = false;
        reconnectAttempts = 0;
        log('INFO', `✅ Bot ${BOT_CONFIG.BOT_NAME} de ${BOT_CONFIG.COMPANY} conectado exitosamente!`);
        log('INFO', `📞 Marca: ${BOT_CONFIG.MARCA.toUpperCase()}`);
        log('INFO', `👥 Equipo: ${BOT_CONFIG.EQUIPO}`);
        log('INFO', `⏰ Timeout de inactividad: ${BOT_CONFIG.INACTIVITY_TIMEOUT / 60000} minutos`);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        
        if (!msg.message || msg.key.fromMe) return;
        
        if (!msg.message || Object.keys(msg.message).length === 0) {
          return;
        }
        
        const numeroReal = await obtenerNumeroReal(msg, sock);
        const from = msg.key.remoteJid;
        
        log('INFO', `📱 Mensaje de: ${numeroReal || 'desconocido'}`);

        // SI NO PUDIMOS OBTENER EL NÚMERO, PEDIRLO DIRECTAMENTE
        if (!numeroReal) {
          log('WARN', `⚠️ No se pudo obtener número de: ${from}, solicitando manualmente...`);
          
          let texto = '';
          if (msg.message?.conversation) texto = msg.message.conversation;
          else if (msg.message?.extendedTextMessage?.text) texto = msg.message.extendedTextMessage.text;
          else if (msg.message?.buttonsResponseMessage?.selectedButtonId) texto = msg.message.buttonsResponseMessage.selectedButtonId;
          else if (msg.message?.templateButtonReplyMessage?.selectedId) texto = msg.message.templateButtonReplyMessage.selectedId;
          else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) texto = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
          else return;
          
          // Si no hay conversación iniciada, pedir teléfono
          if (!datosCliente[from]) {
            datosCliente[from] = { 
              paso: 'solicitar_telefono',
              marca: BOT_CONFIG.MARCA,
              numeroReal: null,
              esLid: true,
              fromLid: from,
              pushName: msg.pushName || 'Cliente'
            };
            
            await enviarMensajeSeguro(sock, from, {
              text: `¡Hola! Soy *${BOT_CONFIG.BOT_NAME}* 👋\n\nTu asistente virtual de *${BOT_CONFIG.COMPANY}*\n\n🚗 *¡Bienvenido a FIAT!*\n\n📱 Para poder ayudarte y que un asesor te contacte, necesito que me compartas tu número de WhatsApp con código de área.\n\n💡 Ejemplo: *11 2345 6789*\n\n_Escribí tu número para continuar_`
            });
            return;
          }
          
          // Si ya está en conversación, verificar si nos dio el teléfono
          const cliente = datosCliente[from];
          
          if (cliente.paso === 'solicitar_telefono') {
            const textoLimpio = texto.replace(/\D/g, '');
            
            if (textoLimpio.length >= 10) {
              let numeroExtraido = textoLimpio;
              
              if (numeroExtraido.length === 10) {
                numeroExtraido = '549' + numeroExtraido;
              } else if (numeroExtraido.length === 11 && numeroExtraido.startsWith('9')) {
                numeroExtraido = '54' + numeroExtraido;
              } else if (numeroExtraido.length === 12 && numeroExtraido.startsWith('54')) {
                numeroExtraido = '549' + numeroExtraido.substring(2);
              } else if (!numeroExtraido.startsWith('54') && numeroExtraido.length >= 10) {
                numeroExtraido = '549' + numeroExtraido.slice(-10);
              }
              
              cliente.numeroReal = numeroExtraido;
              cliente.paso = 'modelo';
              
              log('INFO', `✅ Número obtenido manualmente de @lid: ${numeroExtraido}`);
              
              // Mostrar modelos disponibles
              const modelosArray = Object.entries(MODELOS_FIAT);
              const lista = modelosArray.map(([key, modelo], i) => 
                `${i + 1}. ${modelo.nombre}`
              ).join('\n');
              
              iniciarTemporizador(from, cliente, sock);
              
              await enviarMensajeSeguro(sock, from, {
                text: `¡Perfecto, *${cliente.pushName}*! 👍\n\n¿Qué modelo de FIAT te gustaría conocer?\n\n${lista}\n\n_Escribí el número o el nombre del modelo_`
              });
              return;
            } else {
              await enviarMensajeSeguro(sock, from, {
                text: '📱 Por favor, envíame un número válido con código de área.\n\n💡 Ejemplo: *11 2345 6789*'
              });
              return;
            }
          }
          
          log('INFO', `✅ Procesando conversación @lid con número manual: ${cliente.numeroReal}`);
        }

        log('INFO', `✅ Procesando conversación con número real: ${numeroReal}`);

        // INICIAR CONVERSACIÓN
        if (!datosCliente[from]) {
          datosCliente[from] = { 
            paso: 'modelo', 
            marca: BOT_CONFIG.MARCA,
            numeroReal: numeroReal,
            pushName: msg.pushName || 'Cliente'
          };
          iniciarTemporizador(from, datosCliente[from], sock);

          const modelosArray = Object.entries(MODELOS_FIAT);
          const lista = modelosArray.map(([key, modelo], i) => 
            `${i + 1}. ${modelo.nombre}`
          ).join('\n');

          await enviarMensajeSeguro(sock, from, {
            text: `¡Hola! Soy *${BOT_CONFIG.BOT_NAME}* 👋\n\nTu asistente virtual de *${BOT_CONFIG.COMPANY}*\n\n🚗 *¡Bienvenido a FIAT!*\n\n¿Qué modelo te gustaría conocer?\n\n${lista}\n\n_Escribí el número o el nombre del modelo_`
          });
          return;
        }

        // Extraer texto del mensaje
        let texto = '';
        if (msg.message?.conversation) texto = msg.message.conversation;
        else if (msg.message?.extendedTextMessage?.text) texto = msg.message.extendedTextMessage.text;
        else if (msg.message?.buttonsResponseMessage?.selectedButtonId) texto = msg.message.buttonsResponseMessage.selectedButtonId;
        else if (msg.message?.templateButtonReplyMessage?.selectedId) texto = msg.message.templateButtonReplyMessage.selectedId;
        else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) texto = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else return;

        const cliente = datosCliente[from];

        // PASO 1: SELECCIÓN DE MODELO
        if (cliente.paso === 'modelo') {
          const modeloEncontrado = encontrarModeloPorInput(texto, MODELOS_FIAT);

          if (!modeloEncontrado) {
            await enviarMensajeSeguro(sock, from, {
              text: 'No entendí el modelo 😅\n\nPor favor, respondé con el *número* o el *nombre* del vehículo.'
            });
            return;
          }

          cliente.modelo = modeloEncontrado.nombre;
          cliente.modeloKey = modeloEncontrado.key;
          cliente.modeloInfo = modeloEncontrado;
          cliente.paso = 'nombre';
          iniciarTemporizador(from, cliente, sock);

          await enviarMensajeSeguro(sock, from, {
            text: `¡Excelente elección! El *${modeloEncontrado.nombre}* es increíble 🚗✨\n\n💰 *Valor:* ${modeloEncontrado.valor}\n📋 *Plan:* ${modeloEncontrado.plan}\n💵 *Anticipo:* ${modeloEncontrado.anticipo}\n\n¿Cuál es tu nombre completo?`
          });
          return;
        }

        // PASO 2: NOMBRE DEL CLIENTE
        if (cliente.paso === 'nombre') {
          cliente.nombre = texto;
          clearTimeout(temporizadores[from]);
          delete temporizadores[from];

          await enviarMensajeSeguro(sock, from, {
            text: `¡Gracias, *${cliente.nombre.charAt(0).toUpperCase() + cliente.nombre.slice(1)}*! 🎉\n\nUn especialista de *Auto del Sol* te contactará pronto para brindarte toda la información sobre tu *${cliente.modelo}*.\n\n✨ *Estás a un paso de tu próximo FIAT* ✨`
          });

          // Preparar datos del lead
          const leadData = {
            nombre: cliente.nombre,
            telefono: from,
            numeroReal: cliente.numeroReal || numeroReal,
            marca: BOT_CONFIG.MARCA,
            vehiculo: cliente.modelo
          };

          // Enviar al CRM
          try {
            await enviarACRM(leadData);
            log('INFO', `✅ Lead procesado exitosamente: ${cliente.nombre} - ${cliente.modelo}`);
          } catch (error) {
            log('ERROR', `❌ Error procesando lead: ${error.message}`);
          }

          delete datosCliente[from];
        }
      } catch (error) {
        log('ERROR', `❌ Error procesando mensaje: ${error.message}`);
      }
    });

  } catch (error) {
    isReconnecting = false;
    socketConectado = false;
    log('ERROR', '💥 Error crítico en init', error);
    reconnectAttempts++;
    
    const delay = Math.min(10000 * reconnectAttempts, 60000);
    log('INFO', `🔄 Reintentando en ${delay/1000} segundos...`);
    setTimeout(() => init(), delay);
  }
};

// Manejo de señales de terminación
process.on('SIGINT', async () => {
  log('INFO', '🛑 Deteniendo bot FIAT...');
  socketConectado = false;
  if (sockGlobal) {
    await sockGlobal.logout();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('INFO', '🛑 Deteniendo bot FIAT...');
  socketConectado = false;
  if (sockGlobal) {
    await sockGlobal.logout();
  }
  process.exit(0);
});

// Exportar función de inicio para CommonJS
module.exports = { startBot: init };