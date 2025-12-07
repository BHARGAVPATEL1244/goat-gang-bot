const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authMiddleware = require('./middleware/auth');
const guildsRoutes = require('./routes/guilds');
const messagesRoutes = require('./routes/messages');

function startServer(client) {
    const app = express();
    const PORT = process.env.PORT || 3001;

    // Security Middleware
    app.use(helmet());

    // CORS: Restrict to frontend domain if provided, otherwise allow all (dev)
    const frontendUrl = process.env.FRONTEND_URL;
    app.use(cors({
        origin: frontendUrl || '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'x-api-key']
    }));

    // Body Parser
    app.use(express.json({ limit: '50mb' }));

    // Inject Discord Client into Request
    app.set('client', client);

    // Logging Middleware
    app.use((req, res, next) => {
        console.log(`[API] ${req.method} ${req.path}`);
        next();
    });

    // Auth Middleware (Global)
    app.use(authMiddleware);

    // Routes
    app.use('/guilds', guildsRoutes);
    app.use('/messages', messagesRoutes);
    app.use('/members', require('./routes/members'));
    app.use('/giveaways', require('./routes/giveaways'));

    // 404 Handler
    app.use((req, res) => {
        res.status(404).json({ success: false, error: 'Endpoint not found' });
    });

    // Error Handler
    app.use((err, req, res, next) => {
        console.error('[API Error]', err);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    });

    app.listen(PORT, () => {
        console.log(`API Server running on port ${PORT}`);
    });
}

module.exports = { startServer };
