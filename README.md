# Hercai REST API

Une API REST Express.js qui expose tous les endpoints du package `hercai` (Herc.ai).

## Installation

```bash
npm install
cp .env.example .env
# Éditez .env si vous avez une clé API Hercai (optionnel, tier gratuit dispo)
node index.js
```

## Variables d'environnement

| Variable         | Défaut | Description                        |
|-----------------|--------|------------------------------------|
| `PORT`          | `3000` | Port d'écoute du serveur           |
| `HERCAI_API_KEY`| _(vide)_| Clé API Hercai (optionnel)        |

---

## Endpoints

### `GET /`
Affiche la liste de tous les endpoints disponibles.

---

### CHAT

#### `POST /v1/chat/completions`
Génère une réponse textuelle.

**Body JSON :**
```json
{
  "messages": [
    { "role": "user", "content": "Bonjour !" }
  ],
  "model": "openai/GPT-4-32k-0613",
  "stream": false
}
```

| Champ     | Type      | Requis | Description                             |
|-----------|-----------|--------|-----------------------------------------|
| `messages`| `Array`   | ✅     | Historique [{role, content}]            |
| `model`   | `string`  | ❌     | Modèle à utiliser                       |
| `stream`  | `boolean` | ❌     | Active le streaming SSE (défaut: false) |

**Réponse normale :**
```json
{ "reply": "Bonjour ! Comment puis-je vous aider ?" }
```

**Réponse stream (SSE) :**
```
data: {"reply":"Bon"}
data: {"reply":"jour"}
data: [DONE]
```

---

#### `GET /v1/chat/models`
Liste des modèles de chat disponibles.

---

### IMAGES

#### `POST /v1/images/generations`
Génère une image à partir d'un texte.

**Body JSON :**
```json
{
  "prompt": "A photo of an astronaut riding a horse.",
  "model": "blackforestlabs/Flux-1.0",
  "negative_prompt": "dark, blurry",
  "size": "1024x1024",
  "seed": "42",
  "steps": 50,
  "response_format": "url"
}
```

| Champ             | Type     | Requis | Description                         |
|------------------|----------|--------|-------------------------------------|
| `prompt`         | `string` | ✅     | Description de l'image              |
| `model`          | `string` | ❌     | Modèle d'image                      |
| `negative_prompt`| `string` | ❌     | Ce qu'on veut éviter                |
| `size`           | `string` | ❌     | Dimensions ex: "1024x1024"          |
| `seed`           | `string` | ❌     | Graine de génération                |
| `steps`          | `number` | ❌     | Nombre d'étapes de débruitage       |
| `response_format`| `string` | ❌     | `"url"` (défaut) ou `"buffer"`      |

**Réponse (url) :**
```json
{ "url": "https://..." }
```
**Réponse (buffer) :** fichier PNG en binaire.

---

#### `GET /v1/images/models`
Liste des modèles d'image disponibles.

---

### AUDIO

#### `POST /v1/audio/speech`
Convertit du texte en audio (TTS).

**Body JSON :**
```json
{
  "input": "Hello, how are you?",
  "model": "openai/Echo",
  "format": "mp3"
}
```

| Champ    | Type     | Requis | Description                    |
|---------|----------|--------|--------------------------------|
| `input` | `string` | ✅     | Texte à lire                   |
| `model` | `string` | ❌     | Modèle TTS                     |
| `format`| `string` | ❌     | `"mp3"` (défaut), `"wav"`, `"ogg"` |

**Réponse :** fichier audio binaire avec `Content-Disposition`.

---

#### `GET /v1/audio/models`
Liste des modèles audio disponibles.

---

### RATE LIMITS

#### `GET /v1/ratelimits`
Tous les rate limits disponibles.

#### `GET /v1/ratelimits/category/:category`
Rate limits par catégorie (`chat`, `image`, `audio`).

```
GET /v1/ratelimits/category/image
```

#### `GET /v1/ratelimits/model/:model`
Rate limits pour un modèle précis (encodez le `/` en `%2F`).

```
GET /v1/ratelimits/model/openai%2FGPT-4-32k-0613
```

---

## Modèles disponibles (exemples)

### Chat
- `openai/GPT-4-32k-0613`
- `google/Gemma-3-12b-it`
- `deepseek/deepseek-r1`

### Images
- `blackforestlabs/Flux-1.0`
- `v3` (DALL-E), `lexica`, `prodia`, `simurg`, `animefy`

### Audio
- `openai/Echo`

> Utilisez `GET /v1/chat/models`, `GET /v1/images/models`, `GET /v1/audio/models` pour la liste complète et à jour.
