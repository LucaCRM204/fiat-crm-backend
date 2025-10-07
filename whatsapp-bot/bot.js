const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { createLead } = require('../services/leads');
const db = require('../db');
const fs = require('fs');
const path = require('path');

// Configuración del Bot
const BOT_CONFIG = {
  BOT_ID: 'BOT-FIAT',
  BOT_NAME: 'Martín',
  COMPANY: 'Auto del sol - FIAT',
  SESSION_DIR: './whatsapp-bot/auth_info',
  CRM_SOURCE: 'whatsapp',
  MARCA: 'FIAT'
};

// Modelos FIAT disponibles con datos completos
const MODELOS_FIAT = {
  'titano': { 
    nombre: 'TITANO ENDURANCE MT 4X4',
    valor: '$48.694.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$17.042.900',
    detalles: `💰 Cuotas 2 a 11: $637.851
💰 Cuota 12: $674.085
💰 Cuota 13: $683.592
💰 Cuotas 14 a 18: $493.639
💰 Cuotas 19 a 42: $516.509
💰 Cuotas 43 a 84: $493.639`
  },
  'argo': { 
    nombre: 'ARGO DRIVE 1.3 MT',
    valor: '$27.898.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$9.764.300',
    detalles: `💰 Cuotas 2 a 11: $389.488
💰 Cuotas 12 y 13: $410.132
💰 Desde cuota 14: $281.258`
  },
  'cronos_7030': { 
    nombre: 'CRONOS DRIVE 1.3 MT5 (Plan 70/30)',
    valor: '$32.820.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$11.487.000',
    detalles: `💰 Cuotas 2 a 11: $427.545
💰 Cuotas 12 y 13: $458.204
💰 Desde cuota 14: $330.880`
  },
  'cronos_9010': { 
    nombre: 'CRONOS DRIVE 1.3 MT5 (Plan 90/10)',
    valor: '$32.820.000',
    plan: '90/10 - 84 cuotas',
    anticipo: '$8.205.000',
    detalles: `💰 Cuotas 2 a 11: $545.802
💰 Cuotas 12 y 13: $570.089
💰 Desde cuota 14: $418.478`
  },
  'fastback': { 
    nombre: 'FASTBACK TURBO 270 AT6',
    valor: '$40.653.000',
    plan: '60/40 - 84 cuotas',
    anticipo: '$16.261.200',
    detalles: `💰 Cuotas 2 a 11: $513.309
💰 Cuotas 12 y 13: $543.392
💰 Desde cuota 14: $355.598`
  },
  'mobi': { 
    nombre: 'MOBI TREKKING 1.0',
    valor: '$24.096.000',
    plan: '80/20 - 84 cuotas',
    anticipo: '$7.228.800',
    detalles: `💰 Cuotas 2 a 11: $285.953
💰 Cuota 12: $303.785
💰 Cuotas 13 a 18: $311.679
💰 Cuota 19: $337.404
💰 Cuotas 20 a 24: $275.085
💰 Cuotas 25 a 72: $291.163
💰 Desde cuota 73: $275.085`
  },
  'toro': { 
    nombre: 'TORO FREEDOM T270 AT6 4X2',
    valor: '$42.390.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$16.956.000',
    detalles: `💰 Cuotas 2 a 11: $552.213
💰 Cuotas 12 y 13: $591.812
💰 Cuotas 14 a 18: $427.362
💰 Cuotas 19 a 42: $447.162
💰 Desde cuota 43: $427.362`
  },
  'pulse': { 
    nombre: 'PULSE DRIVE 1.3L MT',
    valor: '$32.833.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$11.491.550',
    detalles: `💰 Cuotas 2 a 11: $458.385
💰 Cuota 12: $482.681
💰 Cuota 13: $458.385
💰 Desde cuota 14: $331.011`
  },
  'fiorino': { 
    nombre: 'FIORINO ENDURANCE 1.4L',
    valor: '$27.459.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$10.983.600',
    detalles: `💰 Cuotas 2 a 11: $383.358
💰 Cuota 12: $403.358
💰 Cuota 13: $383.358
💰 Desde cuota 14: $276.832`
  },
  'strada': { 
    nombre: 'STRADA FREEDOM CD',
    valor: '$33.660.000',
    plan: '70/30 - 84 cuotas',
    anticipo: '$13.464.000',
    detalles: `💰 Cuotas 2 a 11: $469.931
💰 Cuota 12: $494.840
💰 Cuota 13: $469.931
💰 Desde cuota 14: $339.349`
  }
};

// Almacenamiento de conversaciones
const datosCliente = new Map();
const temporizadores = new Map();
const contactosBloqueados = new Map();

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

// Test de conexión a base de datos
async function testConexion() {
  try {
    log('INFO', '🔍 Iniciando test de conexión a BD...');
    
    const dbName = await db.query('SELECT DATABASE() as db_name');
    log('INFO', `📊 Base de datos conectada: ${JSON.stringify(dbName)}`);
    
    const totalUsuarios = await db.query('SELECT COUNT(*) as total FROM users');
    log('INFO', `👥 Total usuarios en BD: ${totalUsuarios[0].total}`);
    
    const vendedoresActivos = await db.query(`SELECT COUNT(*) as total FROM users WHERE role = 'vendedor' AND active = 1`);
    log('INFO', `✅ Vendedores activos: ${vendedoresActivos[0].total}`);
    
    const primerosVendedores = await db.query(`SELECT id, name, role, active FROM users WHERE role = 'vendedor' AND active = 1 LIMIT 3`);
    log('INFO', `🔹 Primeros 3 vendedores: ${JSON.stringify(primerosVendedores)}`);
    
  } catch (error) {
    log('ERROR', '❌ Error en test de conexión:', error);
  }
}

// Extraer número real del JID - MEJORADO
function obtenerNumeroReal(msg) {
  try {
    const from = msg.key.remoteJid;
    
    // MÉTODO 1: senderPn (sender phone number) - PRIORIDAD MÁXIMA
    if (msg.key.senderPn) {
      const numero = msg.key.senderPn.split('@')[0];
      log('INFO', `✅ Número extraído de senderPn: ${numero}`);
      return numero;
    }
    
    // MÉTODO 2: remoteJid normal @s.whatsapp.net
    if (from && from.includes('@s.whatsapp.net') && !from.includes('lid')) {
      const numero = from.split('@')[0];
      log('INFO', `✅ Número extraído de remoteJid: ${numero}`);
      return numero;
    }
    
    // MÉTODO 3: participant (mensajes en grupos)
    if (msg.key.participant && !msg.key.participant.includes('lid')) {
      const numero = msg.key.participant.split('@')[0];
      log('INFO', `✅ Número extraído de participant: ${numero}`);
      return numero;
    }
    
    // MÉTODO 4: contextInfo del mensaje
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      const participantNum = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
      if (!participantNum.includes('lid')) {
        log('INFO', `✅ Número extraído de contextInfo: ${participantNum}`);
        return participantNum;
      }
    }
    
    // Si llegamos aquí con @lid pero NO hay senderPn
    if (from && from.includes('lid')) {
      log('ERROR', `❌ @lid sin senderPn disponible: ${from}`);
      log('DEBUG', `Estructura completa del mensaje: ${JSON.stringify(msg.key)}`);
      return null;
    }
    
    // Default: intentar extraer de remoteJid
    const numero = from.split('@')[0];
    if (numero && numero.length >= 10 && !numero.includes('lid')) {
      log('INFO', `✅ Número extraído (default): ${numero}`);
      return numero;
    }
    
    log('ERROR', `❌ No se pudo extraer número válido de: ${from}`);
    return null;
    
  } catch (error) {
    log('ERROR', 'Error extrayendo número real:', error);
    return null;
  }
}

// Limpiar y formatear teléfono para Argentina
function limpiarTelefonoWhatsApp(telefono, numeroReal = null) {
  try {
    if (numeroReal && !numeroReal.includes('lid')) {
      telefono = numeroReal;
    }
    
    telefono = String(telefono ?? '');
    log('INFO', `📞 Número original: ${telefono}`);
    
    if (telefono.includes('@lid') && !numeroReal) {
      log('ERROR', `No se pudo obtener número real de @lid: ${telefono}`);
      return null;
    }
    
    let numeroLimpio = telefono.split('@')[0];
    let soloDigitos = numeroLimpio.replace(/\D/g, '');
    
    if (soloDigitos.length < 10) {
      log('ERROR', `Número muy corto: ${soloDigitos}`);
      return null;
    }
    
    // Normalizar formato argentino
    let numeroFinal = soloDigitos;
    if (numeroFinal.startsWith('5454')) numeroFinal = numeroFinal.substring(2);
    
    if (numeroFinal.length === 10) {
      numeroFinal = '549' + numeroFinal;
    } else if (numeroFinal.length === 11 && numeroFinal.startsWith('9')) {
      numeroFinal = '54' + numeroFinal;
    } else if (numeroFinal.length === 12 && numeroFinal.startsWith('54')) {
      numeroFinal = '549' + numeroFinal.substring(2);
    } else if (!numeroFinal.startsWith('54')) {
      if (numeroFinal.length >= 10) {
        numeroFinal = '549' + numeroFinal.slice(-10);
      }
    }
    
    const telefonoFinal = '+' + numeroFinal;
    log('INFO', `✅ Teléfono final: ${telefonoFinal}`);
    return telefonoFinal;
  } catch (error) {
    log('ERROR', 'Error procesando teléfono:', error);
    return null;
  }
}

// Obtener vendedor disponible - CORREGIDO
async function obtenerVendedorDisponible() {
  try {
    log('INFO', '🔍 Buscando vendedor disponible...');
    
    const result = await db.query(
      `SELECT id, name, role, active FROM users 
       WHERE role = 'vendedor' AND active = 1 
       ORDER BY RAND() LIMIT 1`
    );
    
    // Extraer el primer nivel del array doble
    const vendedores = result[0] || result;
    
    log('INFO', `📊 Consulta vendedores - Resultados: ${vendedores.length}`);
    
    if (vendedores.length > 0) {
      log('INFO', `👤 Datos vendedor: ${JSON.stringify(vendedores[0])}`);
      log('INFO', `✅ Vendedor seleccionado: ${vendedores[0].name} (ID: ${vendedores[0].id})`);
      return vendedores[0].id;
    }
    
    log('WARN', '⚠️ No hay vendedores activos en la base de datos');
    return null;
    
  } catch (error) {
    log('ERROR', '❌ Error obteniendo vendedor:', error);
    return null;
  }
}

// Detectar modelo FIAT en el texto
function detectarModelo(texto) {
  const textoLower = texto.toLowerCase().trim();
  
  // Buscar por número
  const modelosArray = Object.entries(MODELOS_FIAT);
  const numero = parseInt(textoLower);
  if (!isNaN(numero) && numero >= 1 && numero <= modelosArray.length) {
    const [key, data] = modelosArray[numero - 1];
    return { key, ...data };
  }
  
  // Buscar por nombre
  for (const [key, data] of Object.entries(MODELOS_FIAT)) {
    if (textoLower.includes(key) || textoLower.includes(data.nombre.toLowerCase())) {
      return { key, ...data };
    }
  }
  
  return null;
}

// Enviar mensaje con reintentos
async function enviarMensajeSeguro(sock, destinatario, contenido, reintentos = 3) {
  for (let i = 0; i < reintentos; i++) {
    try {
      await sock.sendMessage(destinatario, contenido);
      return true;
    } catch (error) {
      log('WARN', `Intento ${i + 1}/${reintentos} falló: ${error.message}`);
      if (i < reintentos - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return false;
}

// Crear lead en CRM
async function crearLeadEnCRM(leadData) {
  try {
    log('INFO', `Creando lead en CRM: ${leadData.nombre}`);
    
    const telefonoLimpio = limpiarTelefonoWhatsApp(leadData.telefono, leadData.numeroReal);
    
    if (!telefonoLimpio) {
      log('WARN', `Número inválido: ${leadData.telefono}`);
      return { success: false, error: 'NUMERO_INVALIDO' };
    }

    const vendedorId = await obtenerVendedorDisponible();
    
    const lead = await createLead({
      nombre: leadData.nombre,
      telefono: telefonoLimpio,
      modelo: leadData.modelo || 'Consultar',
      formaPago: leadData.formaPago || 'A definir',
      infoUsado: leadData.infoUsado || '',
      entrega: !!leadData.infoUsado,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'nuevo',
      fuente: BOT_CONFIG.CRM_SOURCE,
      assigned_to: vendedorId,
      notas: `[${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.MARCA}]
🤖 Sistema: ${BOT_CONFIG.BOT_ID}
⚡ Timestamp: ${new Date().toISOString()}
📞 Teléfono: ${telefonoLimpio}
🎯 Captura automática WhatsApp
${vendedorId ? `👤 Vendedor ID: ${vendedorId}` : '⚠️ SIN VENDEDOR ASIGNADO'}

📋 INFORMACIÓN DEL LEAD:
- Cliente: ${leadData.nombre}
- Modelo: ${leadData.modelo || 'A consultar'}
- Forma pago: ${leadData.formaPago || 'A definir'}
- Usado: ${leadData.infoUsado || 'Sin información'}`,
      equipo: 'roberto'
    });

    log('INFO', `✅ Lead creado exitosamente: ID ${lead.id}`);
    return { success: true, data: lead };

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
        errorInfo: { message: error.message, timestamp: new Date().toISOString() }
      }, null, 2));
      
      log('INFO', `📝 Lead guardado en fallback: ${filename}`);
    } catch (e) {
      log('ERROR', 'Error guardando fallback', e);
    }
    
    return { success: false, error: error.message };
  }
}

// Temporizador de inactividad (6 horas)
function iniciarTemporizador(from, cliente, sock) {
  if (temporizadores.has(from)) {
    clearTimeout(temporizadores.get(from));
  }
  
  const timer = setTimeout(async () => {
    const datos = datosCliente.get(from);
    if (!datos) return;

    const respondioAlgo = datos.nombre || datos.modelo || datos.formaPago || datos.usadoInfo;

    const payload = {
      nombre: datos.nombre || (respondioAlgo ? 'Lead sin nombre' : 'Lead Incompleto'),
      telefono: from,
      numeroReal: datos.numeroReal,
      modelo: datos.modelo || '',
      formaPago: datos.formaPago || '',
      infoUsado: datos.usadoInfo || ''
    };

    await crearLeadEnCRM(payload);

    await enviarMensajeSeguro(sock, from, {
      text: `Vimos que no completaste todos los datos, pero no te preocupes 😊\n\nYa pasé tu información para que un asesor te contacte y te ayude con tu 0km FIAT 🚗`
    });

    datosCliente.delete(from);
    temporizadores.delete(from);
  }, 21600000);

  temporizadores.set(from, timer);
}

// Procesar mensajes del cliente
async function procesarMensaje(sock, msg) {
  try {
    const numeroReal = obtenerNumeroReal(msg);
    const from = msg.key.remoteJid;
    
    log('INFO', `📱 Mensaje de: ${numeroReal || 'desconocido'}`);
    
    if (!msg.message) {
      log('WARN', `Mensaje sin contenido`);
      await enviarMensajeSeguro(sock, from, {
        text: 'Disculpa, hubo un error al recibir tu mensaje. ¿Podrías reenviarlo? 🙏'
      });
      return;
    }

    let texto = '';
    if (msg.message?.conversation) {
      texto = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      texto = msg.message.extendedTextMessage.text;
    } else {
      log('WARN', 'Tipo de mensaje no soportado');
      return;
    }

    const textoLower = texto.toLowerCase().trim();

    // Si NO hay número real, bloquear
    if (!numeroReal) {
      if (contactosBloqueados.has(from)) {
        log('INFO', `⛔ Ignorando mensaje de contacto bloqueado: ${from}`);
        return;
      }
      
      log('ERROR', `❌ No se pudo extraer número real de: ${from}`);
      contactosBloqueados.set(from, { timestamp: new Date().toISOString() });
      
      await enviarMensajeSeguro(sock, from, {
        text: '❌ Lo siento, no puedo procesar mensajes desde este tipo de contacto.\n\n📱 Por favor, envíame un mensaje directo desde tu WhatsApp personal.\n\nGracias 🙏'
      });
      return;
    }

    log('INFO', `✅ Procesando conversación con número real: ${numeroReal}`);

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
        text: `🏆 Hola soy *${BOT_CONFIG.BOT_NAME}* tu asistente virtual de *Auto del sol*, estoy para ayudarte a tener tu 0km FIAT.\n\n🎉 *¡Felicitaciones!* Fuiste uno de los seleccionados para participar *EN LA PROMO MUNDIAL 2026*🏆.\n\nPor lo cual tendrás beneficios especiales y un montón de regalos.\n\n🚗 *¿Qué modelo de FIAT te gustaría tener?*\n\n${listaModelos}\n\nDecime el número del modelo que te interesa o escribilo directamente.`
      });

      return;
    }

    const cliente = datosCliente.get(from);

    // PASO 1: Seleccionar modelo
    if (cliente.paso === 'modelo') {
      const modelo = detectarModelo(texto);

      if (!modelo) {
        await enviarMensajeSeguro(sock, from, {
          text: 'No entendí el modelo. Respondé con el *número* o el *nombre* (ej: Argo, Cronos, Pulse, etc.).'
        });
        return;
      }

      cliente.modelo = modelo.nombre;
      iniciarTemporizador(from, cliente, sock);

      await enviarMensajeSeguro(sock, from, {
        text: `🎯 ¡Excelente elección! El *${modelo.nombre}* es un modelo increíble. Te cuento más sobre él:\n\n💰 Valor: ${modelo.valor}\n📋 ${modelo.plan}\n💸 Anticipo: ${modelo.anticipo}\n\n${modelo.detalles}\n\n⚡ *Y DENTRO DE LAS PRÓXIMAS 72 HORAS TENÉS TODOS ESTOS BENEFICIOS ESPECIALES*\n\n✅ *ADJUDICACIÓN ASEGURADA*\n✅ *ENTREGA DE USADOS LLAVE CONTRA LLAVE*\n✅ *PROMO AMIGOS*\n✅ *VOUCHER VACACIONAL*\n✅ *TANQUE LLENO* al retirar tu 0km\n✅ *12 CUOTAS BONIFICADAS*\n✅ *VOUCHER DE $1.000.000 PARA GASTOS DE RETIRO*\n✅ *POLARIZADO*\n🎁 *Y MUCHOS REGALOS MÁS PARA DISFRUTAR EL MUNDIAL A PLENO!*`
      });

      cliente.paso = 'formaPago';
      await enviarMensajeSeguro(sock, from, {
        text: `💳 *¿Cómo pensás pagar el anticipo?*\n\n1️⃣ Solo en efectivo\n2️⃣ Solo entregando un usado (desde 2010)\n3️⃣ Efectivo + usado`
      });
      return;
    }

    // PASO 2: Forma de pago
    if (cliente.paso === 'formaPago') {
      const opcionesPago = {
        '1': 'Efectivo',
        '2': 'Usado',
        '3': 'Efectivo + Usado',
        'efectivo': 'Efectivo',
        'usado': 'Usado',
        'efectivo + usado': 'Efectivo + Usado'
      };

      const formaPagoDetectada = Object.entries(opcionesPago)
        .find(([clave]) => textoLower.includes(clave));
      
      if (formaPagoDetectada) {
        cliente.formaPago = formaPagoDetectada[1];
        
        if (cliente.formaPago.includes('Usado')) {
          cliente.paso = 'usadoInfo';
          iniciarTemporizador(from, cliente, sock);
          await enviarMensajeSeguro(sock, from, {
            text: '🚘 *Decime los siguientes datos del usado:*\n\n📋 Marca - Modelo - Año - Kilómetros\n\n💡 Ejemplo: FIAT Cronos 2020 45000KM'
          });
        } else if (cliente.formaPago === 'Efectivo') {
          cliente.paso = 'nombre';
          iniciarTemporizador(from, cliente, sock);
          await enviarMensajeSeguro(sock, from, { 
            text: '💪 ¡Entendido! Ya estás más cerca de tu próximo 0KM 🚗\n\n👤 *Decime tu nombre completo:*' 
          });
        }
      } else {
        await enviarMensajeSeguro(sock, from, { 
          text: 'No te entendí. Indicá si es *1) efectivo*, *2) usado* o *3) efectivo + usado*.' 
        });
      }
      return;
    }

    // PASO 3: Info del usado
    if (cliente.paso === 'usadoInfo') {
      cliente.usadoInfo = texto;
      cliente.paso = 'nombre';
      iniciarTemporizador(from, cliente, sock);
      await enviarMensajeSeguro(sock, from, { 
        text: '✅ ¡Perfecto! El auto usado que mencionaste entra dentro de lo aceptado.\n\n¿Podés confirmarme tu nombre completo para continuar con la gestión?' 
      });
      return;
    }

    // PASO 4: Nombre y finalización
    if (cliente.paso === 'nombre') {
      cliente.nombre = texto;
      
      if (temporizadores.has(from)) {
        clearTimeout(temporizadores.get(from));
        temporizadores.delete(from);
      }

      await enviarMensajeSeguro(sock, from, {
        text: `📢 ¡Gracias, ${cliente.nombre.charAt(0).toUpperCase() + cliente.nombre.slice(1)}!\n\nUn especialista de Auto del sol se va a contactar con vos para continuar con tu financiación exclusiva 🚗\n\n🎁 *NO TE OLVIDES DE TODOS LOS BENEFICIOS ESPECIALES QUE TENÉS*\n\n✅ *ADJUDICACIÓN ASEGURADA*\n✅ *ENTREGA DE USADOS LLAVE CONTRA LLAVE*\n✅ *PROMO AMIGOS*\n✅ *VOUCHER VACACIONAL*\n✅ *TANQUE LLENO* al retirar tu 0km\n✅ *12 CUOTAS BONIFICADAS*\n✅ *VOUCHER DE $1.000.000 PARA GASTOS DE RETIRO*\n✅ *POLARIZADO*\n🏆 *Y MUCHOS REGALOS MÁS PARA DISFRUTAR EL MUNDIAL A PLENO!*`
      });

      const leadData = {
        nombre: cliente.nombre,
        telefono: from,
        numeroReal: cliente.numeroReal,
        modelo: cliente.modelo,
        formaPago: cliente.formaPago,
        infoUsado: cliente.usadoInfo || ''
      };

      await crearLeadEnCRM(leadData);

      datosCliente.delete(from);
    }

  } catch (error) {
    log('ERROR', `Error procesando mensaje: ${error.message}`, error);
  }
}

// Iniciar bot
async function startBot() {
  try {
    log('INFO', `Iniciando ${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.MARCA}...`);
    
    // Test de conexión a BD
    await testConexion();
    
    const { state, saveCreds } = await useMultiFileAuthState(BOT_CONFIG.SESSION_DIR);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['FIAT CRM Bot', 'Chrome', '20.0.04'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: undefined,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        console.clear();
        console.log(`\n📱 ESCANEA ESTE QR PARA ${BOT_CONFIG.BOT_NAME} (${BOT_CONFIG.MARCA}):\n`);
        qrcode.generate(qr, { small: true });
        console.log(`\n🤖 Bot: ${BOT_CONFIG.BOT_NAME} - ${BOT_CONFIG.BOT_ID}\n`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        log('WARN', `Conexión cerrada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          setTimeout(() => startBot(), 3000);
        }
      }

      if (connection === 'open') {
        console.log(`\n✅ ${BOT_CONFIG.BOT_NAME} (${BOT_CONFIG.MARCA}) CONECTADO!`);
        console.log(`🤖 Bot ID: ${BOT_CONFIG.BOT_ID}`);
        console.log(`📞 Clientes activos: ${datosCliente.size}`);
        console.log(`⛔ Contactos bloqueados: ${contactosBloqueados.size}`);
        console.log(`🚀 Bot listo para recibir mensajes...\n`);
        log('INFO', `${BOT_CONFIG.BOT_NAME} conectado exitosamente`);
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
    log('ERROR', 'Error crítico en startBot', error);
    console.error(`💥 Error crítico:`, error);
    setTimeout(() => startBot(), 5000);
  }
}

module.exports = { startBot };