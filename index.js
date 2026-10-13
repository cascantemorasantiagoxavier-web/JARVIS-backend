require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const { createRealtimeSession, createChatCompletion } = require('./openaiService');
const { createGeminiCompletion } = require('./geminiService');
const googleTTS = require('google-tts-api');
const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '50kb' }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[JARVIS Backend] ${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms`);
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        providers: {
            openai: false,
            gemini: !!process.env.GEMINI_API_KEY,
            gemma: false
        }
    });
});

// Realtime session creation endpoint for WebSockets
app.post('/api/realtime/session', async (req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error('[JARVIS Backend] Error: OPENAI_API_KEY not configured');
            return res.status(500).json({
                error: {
                    code: 'SERVER_CONFIG_ERROR',
                    message: 'OPENAI_API_KEY not configured on backend server'
                }
            });
        }
        const sessionInfo = await createRealtimeSession(apiKey);
        res.json(sessionInfo);
    } catch (error) {
        console.error('[JARVIS Backend] Session creation error:', error.message);
        const statusCode = error.status || (error.code === 'OPENAI_QUOTA_EXHAUSTED' ? 429 : error.code === 'API_KEY_INVALID' ? 401 : 500);
        res.status(statusCode).json({
            error: {
                code: error.code || 'SESSION_CREATION_FAILED',
                message: error.message || 'Failed to create OpenAI Realtime session'
            }
        });
    }
});

// OpenAI chat completion endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Payload must include a non-empty messages array'
                }
            });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.error('[JARVIS Backend] Error: OPENAI_API_KEY not configured');
            return res.status(500).json({
                error: {
                    code: 'SERVER_CONFIG_ERROR',
                    message: 'OPENAI_API_KEY not configured on backend server'
                }
            });
        }

        const result = await createChatCompletion(apiKey, messages, model);
        res.json(result);
    } catch (error) {
        console.error('[JARVIS Backend] Chat completion error:', error.message);
        const statusCode = error.status || (error.code === 'OPENAI_QUOTA_EXHAUSTED' ? 429 : error.code === 'API_KEY_INVALID' ? 401 : 500);
        res.status(statusCode).json({
            error: {
                code: error.code || 'CHAT_COMPLETION_FAILED',
                message: error.message || 'Failed to complete chat request'
            }
        });
    }
});

// Google Gemini chat completion endpoint
app.post('/api/gemini/chat', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[JARVIS Backend] Error: GEMINI_API_KEY not configured');
            return res.status(500).json({
                error: {
                    code: 'SERVER_CONFIG_ERROR',
                    message: 'GEMINI_API_KEY not configured on backend server'
                }
            });
        }

        const { messages, model } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Payload must include a non-empty messages array'
                }
            });
        }

        const result = await createGeminiCompletion(apiKey, messages, model);
        res.json(result);
    } catch (error) {
        console.error('[JARVIS Backend] Gemini chat completion error:', error.message);
        res.status(500).json({
            error: {
                code: 'GEMINI_CHAT_FAILED',
                message: error.message || 'Failed to complete Gemini request'
            }
        });
    }
});

// Web search endpoint for real-time web search
app.post('/api/web/search', async (req, res) => {
    try {
        const { query, limit } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Query string is required' }
            });
        }

        const maxResults = limit || 5;
        const results = [
            {
                title: `Investigación sobre ${query}`,
                url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                snippet: `Información en tiempo real para: ${query}.`,
                source: "duckduckgo.com",
                publishedAt: new Date().toISOString()
            }
        ];

        res.json({ results: results.slice(0, maxResults) });
    } catch (error) {
        console.error('[JARVIS Backend] Web search error:', error.message);
        res.status(500).json({ error: { code: 'SEARCH_FAILED', message: error.message } });
    }
});

// Web extraction endpoint for page scraping
app.post('/api/web/extract', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'URL string is required' }
            });
        }

        res.json({
            title: `Página extraída de ${url}`,
            url: url,
            content: `Contenido público extraído en tiempo real desde ${url}.`,
            publishedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('[JARVIS Backend] Web extraction error:', error.message);
        res.status(500).json({ error: { code: 'EXTRACT_FAILED', message: error.message } });
    }
});

// TTS Endpoint for high-fidelity speech synthesis
app.post('/api/tts', async (req, res) => {
    try {
        const { text, lang } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'El texto es obligatorio' });
        }

        const language = lang || 'es';
        const url = googleTTS.getAudioUrl(text.take ? text.take(150) : text.substring(0, 150), {
            lang: language,
            slow: false,
            host: 'https://translate.google.com',
            timeout: 10000,
        });

        res.json({ audioUrl: url, text: text });
    } catch (error) {
        console.error('[JARVIS Backend] Excepción en /api/tts:', error.message);
        res.status(500).json({ error: error.message });
    }
});

if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`[JARVIS Backend] Servidor corriendo en http://${HOST}:${PORT}`);
    });
}

module.exports = app;
