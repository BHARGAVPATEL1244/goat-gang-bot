/**
 * Middleware to validate x-api-key header
 */
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.API_KEY;

    if (!validKey) {
        console.error('API_KEY is not set in environment variables!');
        return res.status(500).json({ success: false, error: 'Internal server configuration error' });
    }

    if (!apiKey || apiKey !== validKey) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
    }

    next();
}

module.exports = validateApiKey;
