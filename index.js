require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Hercai } = require('hercai');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Initialisation du client Hercai ─────────────────────────────────────────
const hercai = new Hercai(
  process.env.HERCAI_API_KEY ? { apiKey: process.env.HERCAI_API_KEY } : {}
);

// ─── Middlewares globaux ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting global (100 req / 15 min par IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans 15 minutes.' },
});
app.use(limiter);

// ─── Middleware de validation JSON body ───────────────────────────────────────
function requireBody(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Champs requis manquants : ${missing.join(', ')}`,
      });
    }
    next();
  };
}

// ─── Route racine ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'Hercai REST API',
    version: '1.0.0',
    endpoints: {
      chat: {
        completions: 'POST /v1/chat/completions',
        models: 'GET  /v1/chat/models',
      },
      images: {
        generations: 'POST /v1/images/generations',
        models: 'GET  /v1/images/models',
      },
      audio: {
        speech: 'POST /v1/audio/speech',
        models: 'GET  /v1/audio/models',
      },
      ratelimits: {
        all: 'GET /v1/ratelimits',
        byCategory: 'GET /v1/ratelimits/category/:category',
        byModel: 'GET /v1/ratelimits/model/:model',
      },
    },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CHAT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/chat/completions
 * Body:
 *   messages  {Array}   — historique [{role, content}]
 *   model     {string}  — ex: "openai/GPT-4-32k-0613"  (optionnel)
 *   stream    {boolean} — réponse en streaming SSE       (optionnel)
 */
app.post('/v1/chat/completions', requireBody('messages'), async (req, res) => {
  const { messages, model, stream = false } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" doit être un tableau non vide.' });
  }

  try {
    if (stream) {
      // ── Mode streaming : SSE ───────────────────────────────────────────────
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await hercai.chat.completions.create({
        messages,
        ...(model && { model }),
        stream: true,
      });

      for await (const chunk of streamResponse) {
        res.write(`data: ${JSON.stringify({ reply: chunk.reply })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // ── Mode normal ────────────────────────────────────────────────────────
      const response = await hercai.chat.completions.create({
        messages,
        ...(model && { model }),
      });

      res.json({ reply: response.reply });
    }
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * GET /v1/chat/models
 * Retourne la liste des modèles de chat disponibles.
 */
app.get('/v1/chat/models', async (req, res) => {
  try {
    const models = await hercai.chat.models.retrieve();
    res.json({ models });
  } catch (err) {
    handleError(res, err);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// IMAGES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/images/generations
 * Body:
 *   prompt          {string}  — description de l'image
 *   model           {string}  — ex: "blackforestlabs/Flux-1.0"  (optionnel)
 *   negative_prompt {string}  — ce qu'on veut éviter             (optionnel)
 *   size            {string}  — ex: "1024x1024"                  (optionnel)
 *   seed            {string}  — graine de génération             (optionnel)
 *   steps           {number}  — nombre d'étapes                  (optionnel)
 *   response_format {string}  — "url" | "buffer"                 (optionnel)
 */
app.post('/v1/images/generations', requireBody('prompt'), async (req, res) => {
  const {
    prompt,
    model,
    negative_prompt = '',
    size,
    seed,
    steps,
    response_format = 'url',
  } = req.body;

  try {
    const result = await hercai.images.generations({
      prompt,
      negative_prompt,
      ...(model && { model }),
      ...(size && { size }),
      ...(seed && { seed: String(seed) }),
      ...(steps && { steps }),
      response_format,
    });

    if (response_format === 'buffer') {
      // Renvoie l'image directement en PNG
      res.setHeader('Content-Type', 'image/png');
      res.send(result);
    } else {
      res.json({ url: result?.url || result });
    }
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * GET /v1/images/models
 * Retourne la liste des modèles d'image disponibles.
 */
app.get('/v1/images/models', async (req, res) => {
  try {
    const models = await hercai.images.models.retrieve();
    res.json({ models });
  } catch (err) {
    handleError(res, err);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUDIO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/audio/speech
 * Body:
 *   input   {string}  — texte à lire
 *   model   {string}  — ex: "openai/Echo"  (optionnel)
 *   format  {string}  — "mp3" | "wav"      (optionnel, défaut: "mp3")
 * Retourne le fichier audio directement.
 */
app.post('/v1/audio/speech', requireBody('input'), async (req, res) => {
  const { input, model, format = 'mp3' } = req.body;

  try {
    const audioBuffer = await hercai.audio.speech.create({
      input,
      ...(model && { model }),
      format,
    });

    const mimeTypes = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
    res.setHeader('Content-Type', mimeTypes[format] || 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="speech.${format}"`);
    res.send(audioBuffer);
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * GET /v1/audio/models
 * Retourne la liste des modèles audio disponibles.
 */
app.get('/v1/audio/models', async (req, res) => {
  try {
    const models = await hercai.audio.models.retrieve();
    res.json({ models });
  } catch (err) {
    handleError(res, err);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// RATE LIMITS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/ratelimits
 * Retourne tous les rate limits.
 */
app.get('/v1/ratelimits', async (req, res) => {
  try {
    const rateLimits = await hercai.ratelimits.retrieve();
    res.json({ rateLimits });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * GET /v1/ratelimits/category/:category
 * Params: category — ex: "image", "chat", "audio"
 */
app.get('/v1/ratelimits/category/:category', async (req, res) => {
  const { category } = req.params;
  try {
    const rateLimits = await hercai.ratelimits.retrieveByCategory(category);
    res.json({ category, rateLimits });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * GET /v1/ratelimits/model/:model
 * Params: model (encodé en URL) — ex: openai%2FGPT-4-32k-0613
 */
app.get('/v1/ratelimits/model/:model', async (req, res) => {
  const model = decodeURIComponent(req.params.model);
  try {
    const rateLimits = await hercai.ratelimits.retrieveByModel(model);
    res.json({ model, rateLimits });
  } catch (err) {
    handleError(res, err);
  }
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.path}` });
});

// ─── Gestionnaire d'erreurs centralisé ────────────────────────────────────────
function handleError(res, err) {
  console.error('[Hercai API Error]', err?.message || err);
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({
    error: err?.message || 'Erreur interne du serveur',
  });
}

// ─── Démarrage local (ignoré sur Vercel) ─────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅  Hercai REST API démarrée sur http://localhost:${PORT}`);
    console.log(`🔑  Mode : ${process.env.HERCAI_API_KEY ? 'Clé API personnalisée' : 'Tier gratuit'}`);
  });
}

// ─── Export pour Vercel (serverless) ─────────────────────────────────────────
module.exports = app;
