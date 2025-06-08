const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("baileys");
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const userContext = {}

const conectarWhatsapp = async () => {
    console.log('CONECTANDO!!!');

    const { state, saveCreds } = await useMultiFileAuthState('Usuario');

    const sock = makeWASocket({
        auth: state
    });

    //guardamos la conexión
    sock.ev.on('creds.update', saveCreds);

    //generar QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escanee codigo QR!');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const puedeConectar = lastDisconnect.error?.output.statusCode != DisconnectReason.loggedOut;
            console.log('Error al CONECTAR!!!');
            if (puedeConectar) {
                conectarWhatsapp();
            }
        } else if (connection === 'open') {
            console.log('CONEXION ABIERTA!!!')
        }
    })

    //RECIBIR MENSAJES
    sock.ev.on('messages.upsert', async event => {
        const mensaje = event.messages[0];
        const type = event.type;
        const id = mensaje.key.remoteJid;

        // Ignorar mensajes innecesarios
        if (
            type !== 'notify' ||
            mensaje.key.fromMe ||
            id.includes('@g.us') ||
            id.includes('@broadcast')
        ) {
            return;
        }
        
        const mensajeRecibido = mensaje.message?.extendedTextMessage?.text || mensaje.message?.conversation;

        console.log(`Mensaje Usuario: ${mensajeRecibido}`);

        // PRIMERO: Manejar mensajes que llegan desde QRs específicos (ANTES de inicializar contexto)
        
        // QR 1: Info Chatbots
        if (mensajeRecibido === 'Info Chatbots' || mensajeRecibido === 'info Chatbots') {
            // Inicializar contexto si no existe
            if (!userContext[id]) {
                userContext[id] = {
                    menuActual: "main",
                    esperandoPago: false,
                    consultoChatbots: false
                };
            }
            await enviarInfoChatbots(sock, id);
            userContext[id].consultoChatbots = true;
            return;
        }

        // QR 2: Proyectos Universitarios  
        if (mensajeRecibido === 'Proyectos Universitarios') {
            // Inicializar contexto si no existe
            if (!userContext[id]) {
                userContext[id] = {
                    menuActual: "main",
                    esperandoPago: false,
                    consultoChatbots: false
                };
            }
            await sock.sendMessage(id, { 
                image: fs.readFileSync('./public/img/QRpago.jpeg'),
                caption: `🎓 *DESARROLLO DE PROYECTOS UNIVERSITARIOS*

👨‍🎓 Te ayudamos con tu proyecto de grado, tesis o trabajos académicos relacionados con programación y tecnología.

💡 *Servicios incluidos:*
• Desarrollo de aplicaciones web
• Sistemas de gestión  
• APIs y bases de datos
• Documentación técnica completa
• Asesoría durante todo el proceso

💰 *Precios especiales para estudiantes*
📞 *Consulta sin compromiso*

📲 ¿Te interesa? Responde *SI* para recibir más información y presupuesto.` 
            });
            return;
        }

        // QR 3: Desarrollo Web
        if (mensajeRecibido === 'Desarrollo Web') {
            // Inicializar contexto si no existe
            if (!userContext[id]) {
                userContext[id] = {
                    menuActual: "main",
                    esperandoPago: false,
                    consultoChatbots: false
                };
            }
            await sock.sendMessage(id, { 
                image: fs.readFileSync('./public/img/QRpago.jpeg'),
                caption: `💻 *DESARROLLO WEB A MEDIDA*

🚀 Creamos aplicaciones web personalizadas según tus necesidades empresariales.

⭐ *Nuestros servicios:*
• Páginas web corporativas
• Tiendas online (E-commerce)
• Sistemas de gestión empresarial
• Aplicaciones web interactivas
• Optimización SEO

🏆 *Tecnologías que manejamos:*
• Laravel, Node.js, React
• PHP, JavaScript, HTML5/CSS3
• MySQL, PostgreSQL

📞 *Consulta gratuita incluida*

📲 ¿Listo para digitalizar tu negocio? Responde *SI* para comenzar.` 
            });
            return;
        }

        // QR 4: Info Laravel
        if (mensajeRecibido === 'Info Laravel') {
            // Inicializar contexto si no existe
            if (!userContext[id]) {
                userContext[id] = {
                    menuActual: "main",
                    esperandoPago: false,
                    consultoChatbots: false
                };
            }
            
            await sock.sendMessage(id, { 
                image: fs.readFileSync('./public/img/LARAVEL.jpg'),
                caption: `🚀 *CURSO DE LARAVEL - PRÓXIMAMENTE*

📚 Curso completo de Laravel desde básico hasta avanzado + desarrollo de APIs.

📅 *Pronto anunciaremos:*
• Fecha de inicio
• Horarios disponibles  
• Precio especial de lanzamiento
• Temario detallado

🔔 *¿Quieres ser el primero en enterarte?*
Responde *SI* y te avisaremos cuando esté disponible con un descuento exclusivo.` 
            });
            return;
        }

        // SEGUNDO: Inicializar contexto del usuario si no existe (para usuarios que escriben directo)
        if (!userContext[id]) {
            userContext[id] = {
                menuActual: "main",
                esperandoPago: false,
                consultoChatbots: false
            };
            menuSeleccion(sock, id, "main");
            return;
        }

        // TERCERO: Manejar el "SI" solo si consultó información de chatbots
        if (mensajeRecibido === 'SI' && userContext[id].consultoChatbots) {
            await sock.sendMessage(
                id,
                {
                    image: fs.readFileSync('./public/img/QRpago.jpeg'),
                    caption: '📲 Este es el código QR para realizar tu pago.'
                }
            );
            // Resetear el estado después de enviar el QR
            userContext[id].consultoChatbots = false;
            userContext[id].esperandoPago = true;
            return;
        }

        // CUARTO: Manejar opciones del menú (incluyendo A para Info Chatbots desde menú)
        if (mensajeRecibido === 'A') {
            await enviarInfoChatbots(sock, id);
            userContext[id].consultoChatbots = true;
            return;
        }

        // Procesar opciones del menú
        const menuActual = userContext[id].menuActual;
        const menu = menuData[menuActual];
        
        if (menu && menu.options) {
            const optionSeleccionada = menu.options[mensajeRecibido];
            
            if (optionSeleccionada) {
                // Procesar respuesta
                if (optionSeleccionada.respuesta) {
                    const tipo = optionSeleccionada.respuesta.tipo;
                    if (tipo === 'text') {
                        await sock.sendMessage(id, { text: optionSeleccionada.respuesta.msg });
                    }   
                    if (tipo === 'image') {
                        await sock.sendMessage(id, { image: optionSeleccionada.respuesta.msg });
                    }
                }
                
                // Cambiar a submenu si existe
                if (optionSeleccionada.submenu) {
                    userContext[id].menuActual = optionSeleccionada.submenu;
                    enviarMenu(sock, id, optionSeleccionada.submenu);
                }
            } else {
                await sock.sendMessage(id, { text: "Por favor elige una opción válida del menú" });
                // Reenviar el menú actual
                menuSeleccion(sock, id, menuActual);
            }
        } else {
            // Si no hay menú válido, volver al menú principal
            userContext[id].menuActual = "main";
            menuSeleccion(sock, id, "main");
        }
    });
}

// Función separada para enviar información de chatbots
const enviarInfoChatbots = async (sock, id) => {
    // Paso 1: Enviar información del curso
    await sock.sendMessage(id, {
        text: `*🎯 CURSO DE CHATBOTS CON NODE.JS + IA (ChatGPT)*

💻 Aprende desde cero y lanza tu propio bot inteligente con conexión a ChatGPT y bases de datos.

📆 *Inicio:* Viernes 18 de junio  
💳 *Precio:* 120 Bs / $18 USD  
🕘 *Horarios:*
🇦🇷 🇺🇾 🇵🇾 22:30  
🇧🇴 🇻🇪 🇩🇴 🇳🇱 🇵🇷 🇨🇱 21:30  
🇨🇴 🇵🇪 🇪🇨 20:30  
🇲🇽 🇵🇦 🇨🇷 🇸🇻 🇭🇳 🇳🇮 19:30

⏳ *Duración:* 2 días (sábado y domingo)  
🎥 *Modalidad:* Online en vivo (Zoom o Meet)  
🧠 *Requisitos:* Conocimientos básicos de programación

💳 *Pago:* Transferencia, QR, Yape o Tigo Money

🎁 *¡Descuento hasta el martes 20!*  
🟢 Solo 105 Bs / $15 USD

🤖 *¿Quieres más info o inscribirte?*  
Responde *"INSCRIBIRME"* y recibirás el enlace de pago.`
    });

    // Paso 2: Enviar PDF
    await sock.sendMessage(id, {
        document: fs.readFileSync('./public/pdf/temario-chat-bot.pdf'),
        fileName: 'Temario Curso ChatBot.pdf',
        mimetype: 'application/pdf',
        caption: '📎 Aquí puedes descargar el temario completo.'
    });

    // Paso 3: Preguntar si quiere inscribirse
    await sock.sendMessage(id, {
        text: `🟢 *¿Quieres inscribirte?*  
Responde con la palabra *SI* y te enviaré los métodos de pago.`
    });
};

const menuSeleccion = async (sock, id, menukey) => {
    const menu = menuData[menukey];

    const optionSeleccionado = Object.entries(menu.options)
        .map(([key, option]) => `-  👉 *${key}*: ${option.text}`)
        .join('\n');

    const menuMensaje = `${menu.mensaje}\n${optionSeleccionado}\n\n >Indica tu opción`

    // OPCIÓN 1: Enviar imagen con caption (texto en la imagen)
    await sock.sendMessage(id, {
        image: fs.readFileSync('./public/img/GIFanuncios.gif'), // Cambia por tu ruta
        caption: menuMensaje
    });

}

const enviarMenu = async (sock, id, menukey) => {
    const menu = menuData[menukey];
    if (menu) {
        const optionSeleccionado = Object.entries(menu.options)
            .map(([key, option]) => `-  👉 *${key}*: ${option.text}`)
            .join('\n');

        const menuMensaje = `${menu.mensaje}\n${optionSeleccionado}\n\n >Indica tu opción`
        
        // OPCIÓN 1: Enviar imagen con caption (texto en la imagen)
        await sock.sendMessage(id, {
            image: fs.readFileSync('./public/img/GIFanuncios.gif'), // Cambia por tu ruta
            caption: menuMensaje
        });

    }
}

const menuData = {
    main: {
        mensaje: `¡Hola! 👋 Bienvenido/a *SYSOFT* 🚀

Somos tu aliado en tecnología y programación. Aquí encontrarás cursos especializados y servicios de desarrollo que te ayudarán a potenciar tus habilidades.

✨ *¿En qué podemos ayudarte hoy?* ✨`,
        options: {
            A: {
                text: "Información Curso de ChatBots",
                respuesta: {
                    tipo: "text",
                    msg: ""
                }
            },
            B: {
                text: "Información Curso de Laravel.",
                respuesta: {
                    tipo: "text",
                    msg: "Pronto: Curso de Laravel básico, avanzado y APIs"
                }
            },
            C: {
                text: "Creación de aplicaciones web a medida",
                respuesta: {
                    tipo: "image",
                    msg: fs.readFileSync('./public/img/poster.png')
                }
            },
            D: {
                text: "Desarrollo de proyectos de grado o universitarios",
                respuesta: {
                    tipo: "image", 
                    msg: fs.readFileSync('./public/img/poster.png')
                }
            },
            C: {
                text: "Contactarme con un Asesor",
                respuesta: {
                    tipo: "text",
                    msg: "En un momento se Presentara un Asesor un usted esperenos.."
                }
            }
        }
    }
};

conectarWhatsapp();