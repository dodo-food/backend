# 🚂 FoodBF Backend — Déploiement Railway

## Ce que tu dois pousser sur GitHub

Tous ces fichiers sont déjà dans ton repo. Un seul `git push` suffit.

### Fichiers ajoutés / modifiés

```
railway.toml                                         ← NOUVEAU (racine du repo)
backend/
├── Dockerfile                                       ← multi-stage (target: production)
├── package.json
└── deploy/
    └── RAILWAY_DEPLOY.md                            ← ce fichier
```

---

## Étape 1 — Pousser sur GitHub

```bash
git add -A
git commit -m "Deploy: add Railway configuration (railway.toml)"
git push origin main
```

---

## Étape 2 — Créer le projet sur Railway

1. Va sur **[railway.app](https://railway.app)** → **New Project**
2. Choisis **Deploy from GitHub repo**
3. Connecte ton compte GitHub et sélectionne ton repo `FoodBF` / `Dodo`
4. Railway détecte `railway.toml` à la racine et lance le build Docker automatiquement

---

## Étape 3 — Ajouter PostgreSQL

1. Dans ton projet Railway → **+ New** → **Database** → **Add PostgreSQL**
2. Railway crée une instance PostgreSQL et expose automatiquement la variable :
   - `DATABASE_URL` (format : `postgresql://user:pass@host:port/db`)
3. Dans le service **backend** → **Variables** → ajouter :
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```
   *(Railway permet de référencer les variables d'un autre service avec `${{NomService.VARIABLE}}`)*

---

## Étape 4 — Ajouter Redis (optionnel — pour BullMQ)

Sans Redis : cache mémoire + BullMQ désactivé. L'app fonctionne mais sans jobs asynchrones.

**Option A — Plugin Railway Redis :**
1. Dans ton projet Railway → **+ New** → **Database** → **Add Redis**
2. Dans le service **backend** → **Variables** → ajouter :
   ```
   REDIS_URL = ${{Redis.REDIS_URL}}
   ```

**Option B — Upstash Redis (plan gratuit, recommandé) :**
1. Va sur **[upstash.com](https://upstash.com)** → **Create Database** (gratuit)
2. Région : **EU-West** (plus proche de l'Afrique de l'Ouest)
3. Copie l'URL format ioredis : `redis://:password@host:port`
4. Dans le service **backend** → **Variables** → coller sous `REDIS_URL`

---

## Étape 5 — Variables à saisir manuellement

Dans **Railway Dashboard → backend → Variables** :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NODE_ENV` | Environnement | `production` |
| `FIREBASE_PROJECT_ID` | ID de ton projet Firebase | `mon-projet-firebase` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Clé Firebase **sur une seule ligne** | `{"type":"service_account",...}` |
| `CORS_ORIGIN` | Origines autorisées (séparées par virgule) | `*` (test) ou `https://monapp.com` |
| `BACKEND_PUBLIC_URL` | URL publique du service Railway | `https://foodbf-backend.up.railway.app` |
| `BREVO_API_KEY` | Clé API Brevo (emails OTP) | `xkeysib-...` |
| `BREVO_SENDER` | Email expéditeur Brevo | `noreply@foodbf.com` |
| `CLOUDINARY_CLOUD_NAME` | Cloud name Cloudinary | `mon-cloud` |
| `CLOUDINARY_API_KEY` | Clé API Cloudinary | `123456789` |
| `CLOUDINARY_API_SECRET` | Secret Cloudinary | `abc123...` |
| `CLOUDINARY_UPLOAD_PRESET` | Preset Cloudinary signé | `foodbf_signed` |
| `EXPO_PUBLIC_YENGAPAY_BASE_URL` | URL base YengaPay | `https://api.yengapay.com/v1` |
| `EXPO_PUBLIC_YENGAPAY_API_KEY` | Clé API YengaPay | `ypk_...` |
| `EXPO_PUBLIC_YENGAPAY_MERCHANT_ID` | ID marchand YengaPay | `merchant_...` |
| `YENGAPAY_WEBHOOK_SECRET` | Secret webhook HMAC | `whsec_...` |
| `TZ` | Fuseau horaire | `Africa/Ouagadougou` |
| `OSRM_URL` | URL moteur de routage | `http://router.project-osrm.org` |
| `NOMINATIM_URL` | URL géocodage Nominatim | `https://nominatim.openstreetmap.org` |

> **Variables injectées automatiquement par Railway — ne pas définir manuellement :**
> | Variable | Source |
> |----------|--------|
> | `PORT` | Railway runtime |
> | `DATABASE_URL` | Plugin PostgreSQL lié |
> | `REDIS_URL` | Plugin Redis lié (si utilisé) |

---

### Comment minifier FIREBASE_SERVICE_ACCOUNT_JSON

```bash
# Sur ton ordinateur, dans le dossier où se trouve le fichier JSON :
cat service-account.json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)))"
# Copier le résultat (une seule ligne) → coller dans Railway Variables
```

---

## Étape 6 — Vérifier le déploiement

Railway affiche les logs en temps réel dans l'onglet **Deployments**. Une fois déployé :

```
# Ping — doit retourner 200
https://<ton-projet>.up.railway.app/api/v1/ping
→ { "ok": true, "ts": "2026-05-27T..." }

# Health complet — PostgreSQL + Redis + Firebase + BullMQ
https://<ton-projet>.up.railway.app/api/v1/health
→ { "status": "ok", "services": { "postgres": {"status":"ok"}, ... } }
```

---

## Étape 7 — Mettre à jour les URLs dans l'app mobile

Dans le fichier `.env` ou `.env.production` de ton app Expo :

```env
EXPO_PUBLIC_API_URL=https://<ton-projet>.up.railway.app/api/v1
EXPO_PUBLIC_WS_URL=wss://<ton-projet>.up.railway.app
```

---

## Étape 8 — Domaine personnalisé (optionnel)

1. Railway Dashboard → backend → **Settings** → **Domains**
2. **Add Custom Domain** → entrer `api.foodbf.com` (ou ton domaine)
3. Ajouter l'enregistrement CNAME chez ton registraire DNS
4. Mettre à jour `BACKEND_PUBLIC_URL` et `CORS_ORIGIN` dans les variables Railway

---

## Résumé des services Railway nécessaires

```
Projet Railway
├── backend          ← Service web (ce Dockerfile)
├── Postgres         ← Plugin PostgreSQL 16
└── Redis            ← Plugin Redis (optionnel)
```
