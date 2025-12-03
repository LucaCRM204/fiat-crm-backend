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
  INACTIVITY_TIMEOUT: parseInt(process.env.BOT_TIMEOUT || '600000')
};

const CRM_CONFIG = {
  baseUrl: process.env.CRM_BASE_URL || "http://localhost:3001/api",
  timeout: 30000
};

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
const MAX_RECONNECT_ATTEMPTS = 10;

const logger = pino({ level: 'silent' });

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

async function obtenerNumeroReal(msg, sock) {
  try {
    const from = msg.key.remoteJid;
    
    log('INFO', '🔍 Iniciando extracción de número...');
    
    // PRIORIDAD 1: msg.key.participant
    if (msg.key.participant && !msg.key.participant.includes('lid')) {
      const numero = msg.key.participant.split('@')[0];
      log('INFO', `✅ MÉTODO 1: Número extraído de participant: ${numero}`);
      return numero;
    }
    
    // PRIORIDAD 2: remoteJid @s.whatsapp.net
    if (from && from.includes('@s.whatsapp.net') && !from.includes('lid')) {
      const numero = from.split('@')[0];
      log('INFO', `✅ MÉTODO 2: Número extraído de remoteJid: ${numero}`);
      return numero;
    }
    
    // PRIORIDAD 3: contextInfo.participant
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      const participant = msg.message.extendedTextMessage.contextInfo.participant;
      if (!participant.includes('lid') && participant.includes('@s.whatsapp.net')) {
        const numero = participant.split('@')[0];
        log('INFO', `✅ MÉTODO 3: Número extraído de contextInfo.participant: ${numero}`);
        return numero;
      }
    }
    
    // PRIORIDAD 4: Buscar @s.whatsapp.net en TODO el mensaje
    try {
      const msgString = JSON.stringify(msg);
      const whatsappMatches = msgString.match(/(\d{10,13})@s\.whatsapp\.net/g);
      if (whatsappMatches && whatsappMatches.length > 0) {
        const numeros = whatsappMatches.map(match => match.split('@')[0]);
        const numerosUnicos = [...new Set(numeros)];
        
        log('INFO', `📱 MÉTODO 4: Números @s.whatsapp.net encontrados: ${numerosUnicos.join(', ')}`);
        
        const numeroArgentino = numerosUnicos.find(n => n.startsWith('54') && n.length >= 12);
        if (numeroArgentino) {
          log('INFO', `✅ MÉTODO 4: Número argentino seleccionado: ${numeroArgentino}`);
          return numeroArgentino;
        }
        
        const numeroCompleto = numerosUnicos.sort((a, b) => b.length - a.length)[0];
        log('INFO', `✅ MÉTODO 4: Número seleccionado: ${numeroCompleto}`);
        return numeroCompleto;
      }
    } catch (error) {
      log('WARN', `⚠️ Error en búsqueda de @s.whatsapp.net: ${error.message}`);
    }
    
    // SI ES @lid: INTENTAR MÚLTIPLES MÉTODOS DE CONVERSIÓN
    if (from && from.includes('@lid')) {
      log('WARN', `⚠️ Contacto @lid detectado: ${from}`);
      log('INFO', '🔄 Intentando resolver @lid con múltiples métodos...');
      
      try {
        const lidNumber = from.split('@')[0];
        
        const variaciones = [
          lidNumber,
          lidNumber.replace(/^549/, '54'),
          lidNumber.replace(/^54/, '549'),
          lidNumber.substring(2),
          '549' + lidNumber.substring(2)
        ];
        
        log('INFO', `🔍 Probando ${variaciones.length} variaciones con onWhatsApp...`);
        
        for (const variacion of variaciones) {
          try {
            const jidToTest = `${variacion}@s.whatsapp.net`;
            log('INFO', `   Probando: ${jidToTest}`);
            
            const [result] = await sock.onWhatsApp(jidToTest);
            if (result && result.jid && !result.jid.includes('lid')) {
              const numero = result.jid.split('@')[0];
              log('INFO', `✅ MÉTODO A (onWhatsApp): Número convertido de @lid: ${numero}`);
              return numero;
            }
          } catch (e) {
            // Continuar
          }
        }
        
        const msgString = JSON.stringify(msg);
        const numberMatches = msgString.match(/54\d{10,11}/g);
        
        if (numberMatches && numberMatches.length > 0) {
          const uniqueNumbers = [...new Set(numberMatches)];
          log('INFO', `📱 MÉTODO B: Números 54XX encontrados en @lid: ${uniqueNumbers.join(', ')}`);
          
          for (const num of uniqueNumbers) {
            try {
              const jidToTest = `${num}@s.whatsapp.net`;
              const [result] = await sock.onWhatsApp(jidToTest);
              
              if (result && result.exists && !result.jid.includes('lid')) {
                const numero = result.jid.split('@')[0];
                log('INFO', `✅ MÉTODO B: Número validado desde @lid: ${numero}`);
                return numero;
              }
            } catch (e) {
              // Continuar
            }
          }
          
          const numeroCompleto = uniqueNumbers.sort((a, b) => b.length - a.length)[0];
          log('WARN', `⚠️ MÉTODO B: Usando número de @lid sin validar: ${numeroCompleto}`);
          return numeroCompleto;
        }
        
        const allNumberMatches = msgString.match(/\d{10,13}/g);
        if (allNumberMatches && allNumberMatches.length > 0) {
          const uniqueNums = [...new Set(allNumberMatches)];
          log('INFO', `📱 MÉTODO C: Números genéricos encontrados: ${uniqueNums.join(', ')}`);
          
          for (const num of uniqueNums) {
            if (num.length >= 10 && (num.startsWith('54') || num.startsWith('11') || num.startsWith('9'))) {
              log('INFO', `✅ MÉTODO C: Número genérico seleccionado: ${num}`);
              return num;
            }
          }
        }
        
      } catch (error) {
        log('ERROR', `❌ Error resolviendo @lid: ${error.message}`);
      }
      
      log('ERROR', `❌ @lid NO RESUELTO: ${from}`);
      log('ERROR', `⚠️ Se solicitará número manual al usuario`);
      return null;
    }
    
    const numero = from.split('@')[0];
    if (numero && numero.length >= 10 && !numero.includes('lid')) {
      log('WARN', `⚠️ FALLBACK: Usando número directo: ${numero}`);
      return numero;
    }
    
    log('ERROR', `❌ NO SE PUDO OBTENER NÚMERO de: ${from}`);
    return null;
    
  } catch (error) {
    log('ERROR', `❌ Error crítico en obtenerNumeroReal: ${error.message}`);
    return null;
  }
}

function encontrarModeloPorInput(input, modelos) {
  const inputLower = input.toLowerCase().trim();
  const inputNum = parseInt(inputLower);
  
  const modelosArray = Object.entries(modelos);
  if (!isNaN(inputNum) && inputNum > 0 && inputNum <= modelosArray.length) {
    const [key, modelo] = modelosArray[inputNum - 1];
    return { key, ...modelo };
  }
  
  for (const [key, modelo] of modelosArray) {
    const nombreLower = modelo.nombre.toLowerCase();
    
    if (nombreLower.includes(inputLower) || inputLower.includes(key)) {
      return { key, ...modelo };
    }
    
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

async function enviarACRM(leadData) {
  const payload = {
    nombre: leadData.nombre,
    telefono: leadData.numeroReal || leadData.telefono,
    email: '',
    fuente: BOT_CONFIG.CRM_SOURCE,
    marca: BOT_CONFIG.MARCA,
    vehiculo: leadData.vehiculo || '',
    equipo: BOT_CONFIG.EQUIPO,
    notas: `Lead generado por bot WhatsApp - ${BOT_CONFIG.BOT_NAME}`
  };

  try {
    log('INFO', '📤 Enviando lead al CRM...', payload);
    
    const response = await axios.post(
      `${CRM_CONFIG.baseUrl}/leads`,
      payload,
      {
        timeout: CRM_CONFIG.timeout,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.status === 201 || response.status === 200) {
      log('INFO', '✅ Lead enviado exitosamente al CRM', response.data);
      return true;
    } else {
      log('WARN', `⚠️ Respuesta inesperada del CRM: ${response.status}`);
      return false;
    }
  } catch (error) {
    log('ERROR', '❌ Error enviando lead al CRM', {
      error: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

async function enviarMensajeSeguro(sock, to, contenido, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      await sock.sendMessage(to, contenido);
      return true;
    } catch (error) {
      log('WARN', `⚠️ Intento ${i + 1}/${intentos} falló al enviar mensaje: ${error.message}`);
      if (i === intentos - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return false;
}

const init = async () => {
  if (isReconnecting) {
    log('WARN', '⚠️ Ya hay una reconexión en progreso');
    return;
  }

  isReconnecting = true;

  try {
    log('INFO', `🚀 Iniciando ${BOT_CONFIG.BOT_ID}...`);
    log('INFO', `📁 Directorio de sesión: ${BOT_CONFIG.SESSION_DIR}`);

    if (!fs.existsSync(BOT_CONFIG.SESSION_DIR)) {
      fs.mkdirSync(BOT_CONFIG.SESSION_DIR, { recursive: true });
      log('INFO', `✅ Directorio de sesión creado`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    log('INFO', `📱 Versión de Baileys: ${version.join('.')}`);

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Bot FIAT', 'Chrome', '1.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      getMessage: async () => undefined
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log('INFO', '📱 QR CODE GENERADO');
        console.log('\n' + '='.repeat(50));
        console.log(`${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.BOT_ID}`);
        console.log('='.repeat(50));
        console.log('\n🔲 ESCANEA ESTE CÓDIGO QR:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n' + '='.repeat(50) + '\n');
      }

      if (connection === 'open') {
        console.log('\n' + '='.repeat(50));
        console.log(`✅ ${BOT_CONFIG.BOT_NAME} CONECTADO!`);
        console.log(`${BOT_CONFIG.BOT_ID}`);
        console.log('='.repeat(50) + '\n');
        
        isReconnecting = false;
        reconnectAttempts = 0;
        log('INFO', '✅ Bot conectado exitosamente');
      }

      if (connection === 'close') {
        isReconnecting = false;
        sockGlobal = null;
        
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        log('WARN', `⚠️ Conexión cerrada. Código: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          log('ERROR', '🚫 Sesión cerrada por WhatsApp');
          reconnectAttempts = 0;
          return;
        }

        if (statusCode !== DisconnectReason.loggedOut && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(5000 * reconnectAttempts, 60000);
          log('INFO', `🔄 Reconectando en ${delay/1000}s (Intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          
          setTimeout(() => {
            isReconnecting = false;
            init();
          }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          log('ERROR', '❌ Máximo de intentos alcanzado');
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        if (msg.key.fromMe) return;
        if (msg.key.remoteJid.includes('@g.us')) return;
        if (!msg.message || Object.keys(msg.message).length === 0) return;
        
        const numeroReal = await obtenerNumeroReal(msg, sock);
        const from = msg.key.remoteJid;
        
        log('INFO', `📱 Mensaje de: ${from}`);
        log('INFO', `📞 Número real: ${numeroReal || 'NO RESUELTO'}`);

        let texto = '';
        if (msg.message?.conversation) texto = msg.message.conversation;
        else if (msg.message?.extendedTextMessage?.text) texto = msg.message.extendedTextMessage.text;
        else if (msg.message?.buttonsResponseMessage?.selectedButtonId) texto = msg.message.buttonsResponseMessage.selectedButtonId;
        else if (msg.message?.templateButtonReplyMessage?.selectedId) texto = msg.message.templateButtonReplyMessage.selectedId;
        else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) texto = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else return;

        // SOLO SI NO HAY NÚMERO: SOLICITAR MANUALMENTE
        if (!numeroReal) {
          log('WARN', `⚠️ CASO EXTREMO: Solicitando número manual`);
          
          if (!datosCliente[from]) {
            datosCliente[from] = { 
              paso: 'solicitar_telefono',
              marca: BOT_CONFIG.MARCA,
              numeroReal: null,
              esLid: true,
              fromLid: from,
              pushName: msg.pushName || 'Cliente',
              intentosSolicitud: 0
            };
            
            await enviarMensajeSeguro(sock, from, {
              text: `¡Hola! Soy *${BOT_CONFIG.BOT_NAME}* 👋\n\nTu asistente virtual de *${BOT_CONFIG.COMPANY}*\n\n🚗 *¡Bienvenido a FIAT!*\n\n📱 Para poder ayudarte y que un asesor te contacte, necesito que me compartas tu número de WhatsApp con código de área.\n\n💡 Ejemplo: *11 2345 6789*\n\n_Escribí tu número para continuar_`
            });
            return;
          }
          
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
              
              log('INFO', `✅ Número obtenido MANUALMENTE: ${numeroExtraido}`);
              
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
              cliente.intentosSolicitud = (cliente.intentosSolicitud || 0) + 1;
              
              if (cliente.intentosSolicitud >= 3) {
                await enviarMensajeSeguro(sock, from, {
                  text: '😔 No logro obtener tu número correctamente.\n\nPor favor, llamanos directamente o escribinos por Instagram.\n\n¡Gracias por tu interés en FIAT! 🚗'
                });
                delete datosCliente[from];
                return;
              }
              
              await enviarMensajeSeguro(sock, from, {
                text: '📱 Por favor, envíame un número válido con código de área.\n\n💡 Ejemplo: *11 2345 6789*'
              });
              return;
            }
          }
        }

        // FLUJO NORMAL CON NÚMERO REAL
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

        const cliente = datosCliente[from];

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

        if (cliente.paso === 'nombre') {
          cliente.nombre = texto;
          clearTimeout(temporizadores[from]);
          delete temporizadores[from];

          await enviarMensajeSeguro(sock, from, {
            text: `¡Gracias, *${cliente.nombre.charAt(0).toUpperCase() + cliente.nombre.slice(1)}*! 🎉\n\nUn especialista de *Auto del Sol* te contactará pronto para brindarte toda la información sobre tu *${cliente.modelo}*.\n\n✨ *Estás a un paso de tu próximo FIAT* ✨`
          });

          const leadData = {
            nombre: cliente.nombre,
            telefono: from,
            numeroReal: cliente.numeroReal || numeroReal,
            marca: BOT_CONFIG.MARCA,
            vehiculo: cliente.modelo
          };

          try {
            await enviarACRM(leadData);
            log('INFO', `✅ Lead procesado: ${cliente.nombre} - ${cliente.modelo}`);
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
    log('ERROR', '💥 Error crítico en init', error);
    
    reconnectAttempts++;
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      log('INFO', `🔄 Reintentando en ${delay/1000} segundos...`);
      setTimeout(() => init(), delay);
    }
  }
};

process.on('SIGINT', async () => {
  log('INFO', '🛑 Deteniendo bot...');
  if (sockGlobal) {
    try {
      await sockGlobal.logout();
    } catch (err) {
      log('ERROR', `Error al cerrar: ${err.message}`);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('INFO', '🛑 Deteniendo bot...');
  if (sockGlobal) {
    try {
      await sockGlobal.logout();
    } catch (err) {
      log('ERROR', `Error al cerrar: ${err.message}`);
    }
  }
  process.exit(0);
});

// Iniciar el bot
log('INFO', '🎬 Arrancando bot FIAT...');
init();

module.exports = { startBot: init };