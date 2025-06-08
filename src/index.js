const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("baileys");
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const userContext = {};
const adminNumbers = ['59168166901@s.whatsapp.net']; // Números de administradores
const advisorNumbers = ['59168166901@s.whatsapp.net']; // Números de asesores

const conectarWhatsapp = async () => {
    console.log('🚀 CONECTANDO AL SERVIDOR DE WHATSAPP...');
    const { state, saveCreds } = await useMultiFileAuthState('69554690');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    // Guardamos la conexión
    sock.ev.on('creds.update', saveCreds);

    // Generar QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 ¡Escanea el código QR para conectar!');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const puedeConectar = lastDisconnect.error?.output.statusCode != DisconnectReason.loggedOut;
            console.log('❌ Error de conexión...');
            if (puedeConectar) {
                console.log('🔄 Reintentando conexión...');
                setTimeout(conectarWhatsapp, 5000); // Esperar 5 segundos antes de reconectar
            }
        } else if (connection === 'open') {
            console.log('✅ ¡CONEXIÓN ESTABLECIDA EXITOSAMENTE!');
        }
    });

    // RECIBIR MENSAJES
    sock.ev.on('messages.upsert', async event => {
        try {
            const mensaje = event.messages[0];
            const type = event.type;
            const id = mensaje.key.remoteJid;
            const phoneNumber = id.replace('@s.whatsapp.net', '');

            // Ignorar mensajes innecesarios
            if (
                type !== 'notify' ||
                mensaje.key.fromMe ||
                id.includes('@g.us') ||
                id.includes('@broadcast')
            ) {
                return;
            }
            
            const mensajeRecibido = mensaje.message?.extendedTextMessage?.text || mensaje.message?.conversation || '';
            const mensajeNormalizado = mensajeRecibido.trim().toLowerCase();

            console.log(`📨 Mensaje de ${phoneNumber}: ${mensajeRecibido}`);

            // ===== SISTEMA DE COMANDOS DE ADMINISTRADOR =====
            if (adminNumbers.includes(id)) {
                if (mensajeNormalizado.startsWith('/stats')) {
                    await enviarEstadisticas(sock, id);
                    return;
                }
                if (mensajeNormalizado.startsWith('/broadcast ')) {
                    const mensaje = mensajeRecibido.substring(11);
                    await enviarMensajeMasivo(sock, mensaje);
                    await sock.sendMessage(id, { text: '📢 Mensaje enviado a todos los usuarios activos' });
                    return;
                }
                if (mensajeNormalizado.startsWith('/reset ')) {
                    const targetPhone = mensajeRecibido.substring(7) + '@s.whatsapp.net';
                    if (userContext[targetPhone]) {
                        delete userContext[targetPhone];
                        await sock.sendMessage(id, { text: `✅ Usuario ${targetPhone} reseteado` });
                    }
                    return;
                }
            }

            // ===== MANEJO DE MENSAJES DESDE QRs ESPECÍFICOS =====
            
            // QR 1: Info Chatbots
            if (mensajeRecibido === 'Info Chatbots' || mensajeRecibido === 'info Chatbots') {
                inicializarContexto(id);
                await enviarInfoChatbots(sock, id);
                userContext[id].consultoChatbots = true;
                userContext[id].ultimaActividad = Date.now();
                return;
            }

            // QR 2: Proyectos Universitarios  
            if (mensajeRecibido === 'Proyectos Universitarios') {
                inicializarContexto(id);
                await enviarInfoProyectosUniversitarios(sock, id);
                userContext[id].ultimaActividad = Date.now();
                return;
            }

            // QR 3: Desarrollo Web
            if (mensajeRecibido === 'Desarrollo Web') {
                inicializarContexto(id);
                await enviarInfoDesarrolloWeb(sock, id);
                userContext[id].ultimaActividad = Date.now();
                return;
            }

            // QR 4: Info Laravel
            if (mensajeRecibido === 'Info Laravel') {
                inicializarContexto(id);
                await enviarInfoLaravel(sock, id);
                userContext[id].ultimaActividad = Date.now();
                return;
            }

            // ===== COMANDOS ESPECIALES =====
            if (mensajeNormalizado === 'menu' || mensajeNormalizado === 'inicio' || mensajeNormalizado === 'start') {
                inicializarContexto(id);
                await menuSeleccion(sock, id, "main");
                return;
            }

            if (mensajeNormalizado === 'ayuda' || mensajeNormalizado === 'help') {
                await enviarAyuda(sock, id);
                return;
            }

            // ===== INICIALIZAR CONTEXTO PARA NUEVOS USUARIOS =====
            if (!userContext[id]) {
                inicializarContexto(id);
                await enviarBienvenida(sock, id);
                await menuSeleccion(sock, id, "main");
                return;
            }

            // Actualizar última actividad
            userContext[id].ultimaActividad = Date.now();

            // ===== ESTADO: CON ASESOR =====
            if (userContext[id].conAsesor) {
                // El bot no responde cuando está con asesor
                console.log(`👤 Usuario ${phoneNumber} está siendo atendido por un asesor.`);
                return;
            }

            // ===== MANEJO DEL "SI" PARA DIFERENTES CONTEXTOS =====
            if ((mensajeNormalizado === 'si' || mensajeNormalizado === 'sí' || mensajeNormalizado === 'inscribirme') && userContext[id].consultoChatbots) {
                await enviarQRPago(sock, id, 'Curso de ChatBots');
                userContext[id].consultoChatbots = false;
                userContext[id].conAsesor = true; // Transferir a asesor después del pago
                
                // Notificar a asesores sobre inscripción
                for (const asesor of advisorNumbers) {
                    await sock.sendMessage(asesor, {
                        text: `💰 *NUEVA INSCRIPCIÓN - CURSO CHATBOTS*
                        
📱 Usuario: ${phoneNumber}
⏰ Hora: ${new Date().toLocaleString()}
🎓 Servicio: Curso de ChatBots

El usuario ya recibió el QR de pago. Favor realizar seguimiento para completar inscripción.`
                    });
                }
                return;
            }

            if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
                if (userContext[id].esperandoConfirmacion) {
                    await enviarQRPago(sock, id, userContext[id].servicioSolicitado);
                    userContext[id].esperandoConfirmacion = false;
                    userContext[id].conAsesor = true; // Transferir a asesor después del pago
                    
                    // Notificar a asesores
                    for (const asesor of advisorNumbers) {
                        await sock.sendMessage(asesor, {
                            text: `💰 *NUEVA SOLICITUD DE SERVICIO*
                            
📱 Usuario: ${phoneNumber}
⏰ Hora: ${new Date().toLocaleString()}
💼 Servicio: ${userContext[id].servicioSolicitado}

El usuario ya recibió el QR de pago. Favor realizar seguimiento para completar proceso.`
                        });
                    }
                    return;
                }
            }

            // ===== MANEJO DE OPCIONES DE MENÚ =====
            if (mensajeRecibido === 'A') {
                await enviarInfoChatbots(sock, id);
                userContext[id].consultoChatbots = true;
                return;
            }

            // Procesar opciones del menú principal
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
                    
                    // Manejar acción especial para asesor
                    if (optionSeleccionada.accion === 'asesor') {
                        userContext[id].conAsesor = true;
                        userContext[id].horaInicioAsesor = Date.now();
                        
                        // Notificar a asesores
                        for (const asesor of advisorNumbers) {
                            await sock.sendMessage(asesor, {
                                text: `🔔 *NUEVO CLIENTE REQUIERE ATENCIÓN*
                                
📱 Número: ${phoneNumber}
⏰ Hora: ${new Date().toLocaleString()}
💬 Ha solicitado hablar con un asesor

Por favor, contacta al cliente lo antes posible.`
                            });
                        }
                        return;
                    }
                    
                    // Cambiar a submenu si existe
                    if (optionSeleccionada.submenu) {
                        userContext[id].menuActual = optionSeleccionada.submenu;
                        await enviarMenu(sock, id, optionSeleccionada.submenu);
                    }
                } else {
                    await sock.sendMessage(id, { 
                        text: `❌ Opción no válida. Por favor elige una opción del menú.
                        
💡 Escribe *"menu"* para ver las opciones disponibles.` 
                    });
                }
            } else {
                // Si no hay menú válido, volver al menú principal
                userContext[id].menuActual = "main";
                await menuSeleccion(sock, id, "main");
            }

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            await sock.sendMessage(id, { 
                text: '🤖 Disculpa, ocurrió un error. Por favor intenta nuevamente o escribe "menu" para reiniciar.' 
            });
        }
    });

    // ===== LIMPIEZA AUTOMÁTICA DE CONTEXTOS INACTIVOS =====
    setInterval(() => {
        const ahora = Date.now();
        const tiempoLimite = 30 * 60 * 1000; // 30 minutos
        
        for (const userId in userContext) {
            if (ahora - userContext[userId].ultimaActividad > tiempoLimite) {
                console.log(`🧹 Limpiando contexto inactivo: ${userId}`);
                delete userContext[userId];
            }
        }
    }, 10 * 60 * 1000); // Ejecutar cada 10 minutos
}

// ===== FUNCIONES AUXILIARES =====

const inicializarContexto = (id) => {
    if (!userContext[id]) {
        userContext[id] = {
            menuActual: "main",
            consultoChatbots: false,
            conAsesor: false,
            esperandoConfirmacion: false,
            servicioSolicitado: null,
            ultimaActividad: Date.now(),
            horaInicioAsesor: null
        };
    }
};

const enviarBienvenida = async (sock, id) => {
    await sock.sendMessage(id, {
        text: `🎉 *¡Hola! Bienvenido/a a SYSOFT* 🚀

Tu asistente virtual está aquí para ayudarte.

💡 *Comandos útiles:*
• *menu* - Ver opciones principales
• *ayuda* - Obtener ayuda
• *inicio* - Reiniciar conversación

¿En qué podemos ayudarte hoy? 👇`
    });
};

const enviarAyuda = async (sock, id) => {
    await sock.sendMessage(id, {
        text: `🆘 *CENTRO DE AYUDA SYSOFT*

📌 *Comandos disponibles:*
• *menu* - Menú principal
• *ayuda* - Esta ayuda
• *inicio* - Reiniciar

🎓 *Nuestros servicios:*
• Cursos de programación
• Desarrollo web a medida  
• Proyectos universitarios
• Asesoría personalizada

📞 *¿Necesitas ayuda humana?*
Selecciona la opción "Contactar Asesor" en el menú principal.

⚡ *¿Algo no funciona?*
Escribe *"inicio"* para reiniciar la conversación.`
    });
};

const enviarEstadisticas = async (sock, id) => {
    const totalUsuarios = Object.keys(userContext).length;
    const usuariosActivos = Object.values(userContext).filter(ctx => 
        Date.now() - ctx.ultimaActividad < 30 * 60 * 1000
    ).length;
    const usuariosConAsesor = Object.values(userContext).filter(ctx => ctx.conAsesor).length;

    await sock.sendMessage(id, {
        text: `📊 *ESTADÍSTICAS DEL BOT*

👥 Usuarios totales: ${totalUsuarios}
🟢 Usuarios activos (30min): ${usuariosActivos}
👤 Con asesor: ${usuariosConAsesor}

⏰ Última actualización: ${new Date().toLocaleString()}`
    });
};

const enviarMensajeMasivo = async (sock, mensaje) => {
    for (const userId in userContext) {
        try {
            await sock.sendMessage(userId, { text: `📢 *MENSAJE DE SYSOFT*\n\n${mensaje}` });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo entre mensajes
        } catch (error) {
            console.error(`Error enviando mensaje a ${userId}:`, error);
        }
    }
};

const enviarInfoChatbots = async (sock, id) => {
    // Información del curso
    await sock.sendMessage(id, {
        text: `🤖 *CURSO DE CHATBOTS CON NODE.JS + IA (ChatGPT)*

🚀 Aprende desde cero y lanza tu propio bot inteligente con conexión a ChatGPT y bases de datos.

📆 *Inicio:* Viernes 18 de junio  
💳 *Precio Normal:* 120 Bs / $18 USD  
🎁 *OFERTA ESPECIAL:* 105 Bs / $15 USD

🕘 *Horarios por país:*
🇦🇷 🇺🇾 🇵🇾 22:30  
🇧🇴 🇻🇪 🇩🇴 🇳🇱 🇵🇷 🇨🇱 21:30  
🇨🇴 🇵🇪 🇪🇨 20:30  
🇲🇽 🇵🇦 🇨🇷 🇸🇻 🇭🇳 🇳🇮 19:30

⏳ *Duración:* 2 días intensivos
🎥 *Modalidad:* Online en vivo (Zoom)
🧠 *Requisitos:* Conocimientos básicos de programación

🎯 *Lo que aprenderás:*
• Desarrollo con Node.js y Baileys
• Integración con ChatGPT API
• Conexión a bases de datos
• Despliegue en servidores
• Monetización de bots`
    });

    // Enviar PDF del temario
    try {
        await sock.sendMessage(id, {
            document: fs.readFileSync('./public/pdf/temario-chat-bot.pdf'),
            fileName: 'Temario_Curso_ChatBot.pdf',
            mimetype: 'application/pdf',
            caption: '📎 Temario completo del curso'
        });
    } catch (error) {
        console.log('⚠️ No se pudo enviar el PDF del temario');
    }

    // Pregunta final
    await sock.sendMessage(id, {
        text: `🎯 *¿Listo para convertirte en un experto en ChatBots?*

Responde *"INSCRIBIRME"* o *"SI"* para recibir los métodos de pago.

⏰ ¡Cupos limitados!`
    });
};

const enviarInfoProyectosUniversitarios = async (sock, id) => {
    await sock.sendMessage(id, { 
        image: fs.readFileSync('./public/img/QRpago.jpeg'),
        caption: `🎓 *DESARROLLO DE PROYECTOS UNIVERSITARIOS*

👨‍🎓 Te ayudamos con tu proyecto de grado, tesis o trabajos académicos relacionados con programación y tecnología.

💡 *Servicios incluidos:*
• Desarrollo de aplicaciones web completas
• Sistemas de gestión empresarial
• APIs RESTful y bases de datos
• Documentación técnica profesional
• Asesoría durante todo el proceso
• Presentaciones y defensas

🏆 *Tecnologías que manejamos:*
• Laravel, Node.js, React, Vue.js
• PHP, JavaScript, Python
• MySQL, PostgreSQL, MongoDB
• Bootstrap, Tailwind CSS

💰 *Precios especiales para estudiantes*
📞 *Consulta gratuita incluida*
⏰ *Entrega garantizada en fechas acordadas*

📲 ¿Te interesa? Responde *"SI"* para recibir más información y presupuesto personalizado.` 
    });
    
    userContext[id].esperandoConfirmacion = true;
    userContext[id].servicioSolicitado = 'Proyecto Universitario';
};

const enviarInfoDesarrolloWeb = async (sock, id) => {
    await sock.sendMessage(id, { 
        image: fs.readFileSync('./public/img/QRpago.jpeg'),
        caption: `💻 *DESARROLLO WEB PROFESIONAL A MEDIDA*

🚀 Creamos aplicaciones web personalizadas según las necesidades específicas de tu negocio.

⭐ *Nuestros servicios incluyen:*
• Páginas web corporativas modernas
• Tiendas online (E-commerce) completas
• Sistemas de gestión empresarial (CRM, ERP)
• Aplicaciones web interactivas
• Optimización SEO profesional
• Hosting y mantenimiento

🏆 *Stack tecnológico:*
• Frontend: React, Vue.js, HTML5, CSS3, JavaScript
• Backend: Laravel, Node.js, PHP
• Bases de datos: MySQL, PostgreSQL
• Cloud: AWS, DigitalOcean

💼 *Incluimos:*
• Diseño responsive (móvil y desktop)
• Panel de administración
• Capacitación para el cliente
• Soporte técnico 6 meses
• Certificado SSL gratuito

📞 *Consulta y cotización gratuita*
🎯 *Proyectos desde $200 USD*

📲 ¿Listo para digitalizar tu negocio? Responde *"SI"* para comenzar.` 
    });
    
    userContext[id].esperandoConfirmacion = true;
    userContext[id].servicioSolicitado = 'Desarrollo Web';
};

const enviarInfoLaravel = async (sock, id) => {
    await sock.sendMessage(id, { 
        image: fs.readFileSync('./public/img/LARAVEL.jpg'),
        caption: `🚀 *CURSO DE LARAVEL - PRÓXIMO LANZAMIENTO*

📚 Curso completo de Laravel desde básico hasta avanzado + desarrollo de APIs profesionales.

🎯 *Temario preliminar:*
• Fundamentos de Laravel y MVC
• Eloquent ORM y migraciones
• Blade templates y componentes
• Autenticación y autorización
• APIs RESTful con Sanctum
• Testing y deployment
• Proyectos reales

📅 *Información próximamente:*
• Fecha de inicio definitiva
• Horarios por zona horaria
• Precio especial de lanzamiento
• Bonos y certificación

🔔 *¿Quieres ser el primero en enterarte?*
Responde *"SI"* y te avisaremos apenas esté disponible con un descuento exclusivo del 30%.

💡 *¡Los primeros 50 inscritos tendrán precio especial!*` 
    });
    
    userContext[id].esperandoConfirmacion = true;
    userContext[id].servicioSolicitado = 'Curso Laravel';
};

const enviarQRPago = async (sock, id, servicio) => {
    // Enviar QR de pago
    await sock.sendMessage(id, {
        image: fs.readFileSync('./public/img/QRpago.jpeg'),
        caption: `💳 *MÉTODOS DE PAGO - ${servicio}*

📱 *Opciones disponibles:*
• Transferencia bancaria
• QR Code (imagen adjunta)
• Yape (Perú)
• Yape (Bolivia)

💰 *Datos bancarios:*
📧 Te enviaremos los datos una vez confirmes el método.`
    });

    // Enviar instrucciones para completar inscripción
    await sock.sendMessage(id, {
        text: `📋 *PARA COMPLETAR SU INSCRIPCIÓN*

Una vez realizado el pago debe enviar:

📸 *Foto del comprobante de pago*

📝 *Datos requeridos:*
• Nombre completo
• Correo electrónico
• País
• Ciudad
• Edad
• Celular
• Empresa/institución
• Posición en su trabajo
• Curso al que se inscribe

Saludos cordiales 🤝`
    });
};

const menuSeleccion = async (sock, id, menukey) => {
    const menu = menuData[menukey];
    if (!menu) return;

    const optionSeleccionado = Object.entries(menu.options)
        .map(([key, option]) => `• *${key}*: ${option.text}`)
        .join('\n');

    const menuMensaje = `${menu.mensaje}\n\n${optionSeleccionado}\n\n👆 *Selecciona una opción*`;

    try {
        await sock.sendMessage(id, {
            image: fs.readFileSync('./public/img/GIFanuncios.gif'),
            caption: menuMensaje
        });
    } catch (error) {
        // Si no se puede enviar la imagen, enviar solo texto
        await sock.sendMessage(id, { text: menuMensaje });
    }
};

const enviarMenu = async (sock, id, menukey) => {
    const menu = menuData[menukey];
    if (!menu) return;
    
    const optionSeleccionado = Object.entries(menu.options)
        .map(([key, option]) => `• *${key}*: ${option.text}`)
        .join('\n');

    const menuMensaje = `${menu.mensaje}\n\n${optionSeleccionado}\n\n👆 *Selecciona una opción*`;
    
    try {
        await sock.sendMessage(id, {
            image: fs.readFileSync('./public/img/GIFanuncios.gif'),
            caption: menuMensaje
        });
    } catch (error) {
        await sock.sendMessage(id, { text: menuMensaje });
    }
};

// ===== CONFIGURACIÓN DE MENÚS =====
const menuData = {
    main: {
        mensaje: `🎉 *¡Bienvenido/a a SYSOFT!* 🚀

Somos tu aliado tecnológico especializado en programación y desarrollo. Aquí encontrarás cursos de alta calidad y servicios profesionales para potenciar tus habilidades.

✨ *¿En qué podemos ayudarte hoy?*`,
        options: {
            A: {
                text: "🤖 Información Curso de ChatBots",
                respuesta: { tipo: "text", msg: "" }
            },
            B: {
                text: "🅱️ Información Curso de Laravel",
                respuesta: {
                    tipo: "text",
                    msg: "📚 Próximamente: Curso completo de Laravel básico, avanzado y desarrollo de APIs profesionales. ¡Mantente atento! 🚀"
                }
            },
            C: {
                text: "💻 Desarrollo de aplicaciones web a medida",
                respuesta: {
                    tipo: "image",
                    msg: fs.readFileSync('./public/img/poster.png')
                }
            },
            D: {
                text: "🎓 Desarrollo de proyectos universitarios",
                respuesta: {
                    tipo: "image", 
                    msg: fs.readFileSync('./public/img/poster.png')
                }
            },
            E: {
                text: "👤 Contactar con un Asesor",
                respuesta: {
                    tipo: "text",
                    msg: `👋 *¡Perfecto!* Un asesor especializado se pondrá en contacto contigo muy pronto.

⏰ *Tiempo de respuesta:* 5-15 minutos (horario laboral)
📞 *Horario de atención:* Lunes a Viernes 9:00 AM - 6:00 PM

Mientras tanto, puedes continuar explorando nuestros servicios. 😊`
                },
                accion: "asesor"
            }
        }
    }
};

// ===== INICIAR EL BOT =====
console.log('🤖 Iniciando SYSOFT WhatsApp Bot...');
conectarWhatsapp().catch(error => {
    console.error('❌ Error fatal al iniciar el bot:', error);
    process.exit(1);
});