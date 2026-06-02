const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: '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' });

// ============================================================
// ⚙️  CONFIGURACIÓN — Solo edita esta sección
// ============================================================

const GRUPO_CIBERSEGURIDAD = '120363429008587884@g.us';
const MODO_DEBUG            = false;
const NOMBRE_BOT            = 'hydra';

// ============================================================
// 👋 MENSAJE DE BIENVENIDA
// ============================================================

const MENSAJE_BIENVENIDA = (numero) =>
`🛡️ ¡Bienvenido/a @${numero} a la Comunidad de Ciberseguridad! 🛡️

Este grupo se creó para apoyarnos en nuestro crecimiento en este mundo. Aquí todos sumamos: tanto si estás dando tus primeros pasos como si ya tienes experiencia en el sector.

¿Qué hacemos aquí?
💡 Compartir ideas, herramientas, referencias y documentación.
🤝 Colaborar respondiendo las dudas de otros miembros.
🚀 Impulsar proyectos juntos a medida que crezcamos.
💼 Networking & Empleo: Conectarnos entre nosotros. Queremos que el grupo sirva para conocernos y que, quienes ya trabajan en el sector, puedan compartir oportunidades laborales y vacantes.

⚠️ Nota: Mantengamos el grupo enfocado en ciberseguridad, tecnología y aprendizaje. ¡El respeto mutuo es la única regla!

━━━━━━━━━━━━━━━━━━━━━
🐍 *Soy HYDRA, tu asistente de ciberseguridad*

Puedo ayudarte con dudas sobre:
🔐 Conceptos y fundamentos de ciberseguridad
💻 Hacking ético y pentesting
🛡️ Seguridad en redes y sistemas
⚠️ Vulnerabilidades, CVEs y exploits
🔍 Herramientas: Nmap, Metasploit, Burp Suite, Wireshark…
🕵️ OSINT, criptografía, forense digital y más

*¿Cómo invocarme?* Menciona mi nombre al inicio de tu mensaje:
_"Hydra, ¿qué es un ataque de fuerza bruta?"_
_"Hydra explícame SQL Injection"_

Si no me mencionas, no respondo — así mantenemos el grupo ordenado ✌️`;

// ============================================================
// 🧠 ESTADO INTERNO
// ============================================================

const conversaciones = {};
const colaMensajes   = [];
let   procesandoCola = false;
let   botActivo      = true;

// ID del grupo — se puede setear aquí directamente o dejar que
// el modo debug lo muestre en consola para que lo copies.
let grupoObjetivo = GRUPO_CIBERSEGURIDAD;

// ============================================================
// 🔧 FUNCIONES AUXILIARES
// ============================================================

function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');
}

function mencionaBot(texto) {
    return new RegExp(`\\b${NOMBRE_BOT}\\b`).test(normalizarTexto(texto));
}

function extraerPregunta(texto) {
    return texto
        .replace(new RegExp(`@?${NOMBRE_BOT}[,:.!]?\\s*`, 'gi'), '')
        .trim();
}

/**
 * Detecta comandos de administrador con variantes flexibles:
 *   "HYDRA, desactivate" / "HYDRA desactivate" / "hydra desactívate" → 'desactivar'
 *   "HYDRA, activate"    / "HYDRA activate"    / "hydra actívate"    → 'activar'
 */
function detectarComandoAdmin(texto) {
    const norm = normalizarTexto(texto);
    const tieneHydra = /\bhydra\b/.test(norm);
    if (!tieneHydra) return null;

    // Acepta: desactivate, desactívate, desactivar, desactiva, off
    if (/\b(desactivate|desactivar|desactiva|off)\b/.test(norm)) return 'desactivar';
    // Acepta: activate, actívate, activar, activa, on
    if (/\b(activate|activar|activa|on)\b/.test(norm))           return 'activar';

    return null;
}

async function esAdminGrupo(sock, groupJid, userJid) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const admins = metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
        return admins.includes(userJid);
    } catch {
        return false;
    }
}

// ============================================================
// 🤖 HYDRA — IA (Groq + LLaMA)
// ============================================================

async function responderHydra(pregunta, userJid) {
    if (!conversaciones[userJid]) conversaciones[userJid] = [];
    conversaciones[userJid].push({ role: 'user', content: pregunta });

    const historial = conversaciones[userJid].slice(-10);

    const respuesta = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'system',
                content: `Eres HYDRA, asistente de ciberseguridad experto dentro de un grupo de WhatsApp para estudiantes.

Tu personalidad:
- Directo, claro y preciso. Sin rodeos.
- Lenguaje técnico explicado siempre con un ejemplo real.
- Tratas a los estudiantes de tú.
- Emojis tecnológicos con moderación (🔐 💻 🛡️ ⚠️ 🔍 🕵️).

Reglas estrictas:
1. Solo respondes sobre ciberseguridad, hacking ético, redes, SO, criptografía, OSINT, malware y temas directamente relacionados.
2. Si la pregunta no pertenece a esos temas, responde exactamente: "Solo respondo sobre ciberseguridad 🔐"
3. NUNCA inventes herramientas, CVEs, exploits ni datos inexistentes.
4. Si no sabes algo con certeza, dilo explícitamente.
5. Máximo 3–4 párrafos cortos. Usa listas con guiones cuando aclaren la respuesta.
6. Sin saludos ni despedidas; ve directo al punto.`,
            },
            ...historial,
        ],
    });

    const textoRespuesta = respuesta.choices[0].message.content;
    conversaciones[userJid].push({ role: 'assistant', content: textoRespuesta });
    return textoRespuesta;
}

// ============================================================
// 📋 COLA
// ============================================================

async function procesarCola(sock) {
    if (procesandoCola) return;
    procesandoCola = true;

    while (colaMensajes.length > 0) {
        const { from, texto, userJid, pushName } = colaMensajes.shift();

        try {
            const pregunta = extraerPregunta(texto);
            const numero   = userJid.split('@')[0];

            console.log(`🔍 [COLA] @${numero} preguntó: ${pregunta}`);

            const respuesta = await responderHydra(pregunta, userJid);

            await sock.sendMessage(from, {
                text: `@${numero}\n\n${respuesta}`,
                mentions: [userJid],
            });

            console.log(`✅ HYDRA respondió a @${numero}`);

            if (colaMensajes.length > 0) await new Promise(r => setTimeout(r, 1200));

        } catch (err) {
            console.error(`❌ Error respondiendo a ${userJid}:`, err.message);
        }
    }

    procesandoCola = false;
}

// ============================================================
// 📡 CONEXIÓN WHATSAPP
// ============================================================

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n📱 Escanea este QR con WhatsApp:\n');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const codigo     = lastDisconnect?.error?.output?.statusCode;
            const reconectar = codigo !== DisconnectReason.loggedOut;
            console.log(`🔌 Conexión cerrada. Código: ${codigo} | Reconectando: ${reconectar}`);
            if (reconectar) conectarWhatsApp();
        }
        if (connection === 'open') {
            console.log(`✅ HYDRA conectado — Bot ${botActivo ? 'ACTIVO ✅' : 'INACTIVO ⛔'}`);
            if (!grupoObjetivo) {
                console.log('');
                console.log('══════════════════════════════════════════════════');
                console.log('⚠️  GRUPO_CIBERSEGURIDAD está vacío.');
                console.log('   Envía cualquier mensaje en tu grupo de WhatsApp');
                console.log('   y el ID aparecerá aquí abajo. Luego cópialo y');
                console.log('   pégalo en la variable GRUPO_CIBERSEGURIDAD.');
                console.log('══════════════════════════════════════════════════');
                console.log('');
            }
        }
    });

    // ── Nuevos miembros ──────────────────────────────────────
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (!grupoObjetivo || id !== grupoObjetivo) return;

        if (action === 'add') {
            for (const participant of participants) {
                try {
                    // 1. Extraemos el texto del JID de forma segura
                    const jid = typeof participant === 'string' ? participant : (participant.id || participant.jid);
                    
                    // Si no se encuentra un JID válido, saltamos al siguiente participante
                    if (!jid) continue; 

                    // 2. Ahora sí podemos usar el split de forma segura sobre un string
                    const numero = jid.split('@')[0];
                    
                    await sock.sendMessage(id, {
                        text: MENSAJE_BIENVENIDA(numero),
                        mentions: [jid], // Usamos el jid para la mención correcta
                    });
                    
                    console.log(`👋 Bienvenida enviada a @${numero}`);
                } catch (err) {
                    console.error('❌ Error enviando bienvenida:', err.message);
                }
            }
        }
    });
    // ── Mensajes entrantes ───────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Si es mensaje propio, solo procesar comandos de admin
            if (msg.key.fromMe) {
                const textoTemp =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text || '';
                if (!mencionaBot(textoTemp) || !detectarComandoAdmin(textoTemp)) continue;
            }

            const from = msg.key.remoteJid;

            // Modo debug: muestra el ID de cada grupo con actividad
            if (MODO_DEBUG && from.endsWith('@g.us')) {
                console.log(`🐛 [DEBUG] Mensaje en grupo → ID: ${from}`);

                // Auto-llenar grupoObjetivo si está vacío (solo el primero que aparezca)
                if (!grupoObjetivo) {
                    grupoObjetivo = from;
                    console.log(`✅ grupoObjetivo seteado automáticamente a: ${from}`);
                    console.log('120363429008587884@g.us');
                }
            }

            if (!grupoObjetivo || from !== grupoObjetivo) continue;

            const texto =
                msg.message?.conversation              ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption     ||
                msg.message?.videoMessage?.caption     ||
                '';

            if (!texto.trim() || !mencionaBot(texto)) continue;

            const userJid = msg.key.participant || msg.key.remoteJid;
            const numero  = userJid.split('@')[0];

            // ── Comandos de administrador ─────────────────────
            const comando = detectarComandoAdmin(texto);
            if (comando) {
                const esAdmin = await esAdminGrupo(sock, from, userJid);

                if (!esAdmin) {
                    await sock.sendMessage(from, {
                        text: `@${numero} Solo los administradores pueden usar ese comando 🔒`,
                        mentions: [userJid],
                    });
                    continue;
                }

                if (comando === 'desactivar') {
                    botActivo = false;
                    await sock.sendMessage(from, {
                        text: '⛔ *HYDRA desactivado.* No responderé preguntas hasta que un admin escriba _"HYDRA, activate"_.',
                    });
                    console.log('⛔ Bot desactivado por admin @' + numero);
                } else {
                    botActivo = true;
                    await sock.sendMessage(from, {
                        text: '✅ *HYDRA activado.* Listo para responder preguntas del grupo 🐍',
                    });
                    console.log('✅ Bot activado por admin @' + numero);
                }
                continue;
            }

            // ── Bot inactivo ──────────────────────────────────
            if (!botActivo) {
                console.log(`🔕 Bot inactivo → ignorando pregunta de @${numero}`);
                continue;
            }

            const pushName = msg.pushName || numero;
            console.log(`💬 [GRUPO] ${pushName} preguntó: ${texto}`);

            colaMensajes.push({ from, texto, userJid, pushName });
            procesarCola(sock);
        }
    });
}

conectarWhatsApp();
