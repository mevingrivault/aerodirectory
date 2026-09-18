# Audit Navventura — Phase 1 (lecture seule)

Date : 18 septembre 2026
Commit audité : `43ba7db` (branche `main`)
Périmètre : `apps/api`, `apps/web`, `packages/*`, Dockerfiles, `docker-compose.prod.yml`, workflow GitHub Actions, schéma Prisma et migrations.

Méthode : lecture intégrale des contrôleurs, services, guards et schémas de l'API ; lecture ciblée du front (auth, upload, pages admin) ; exécution de la suite de tests API (`pnpm --filter @aerodirectory/api test` : 28 tests, 3 fichiers, tous verts) ; `pnpm audit --prod` (0 critique, 0 haute, 12 modérées, 3 faibles). Aucune modification apportée au dépôt en dehors de ce fichier.

Convention : chaque constat porte un identifiant (`C` critique, `E` élevée, `M` moyenne, `F` faible), le fichier et les lignes concernés, le risque concret et le correctif proposé.

---

## Phase 2 — état des corrections (branche `fix/audit-phase-2`)

| # | Correctif appliqué | Tests |
|---|---|---|
| C1 | Token partiel TOTP transmis en cookie `totp_pending` scopé sur `/api/v1/auth/login/totp` ; route rendue publique et throttlée (5/min) ; `POST /auth/totp/disable` (mot de passe + code) ; codes TOTP erronés comptés dans le verrouillage ; UI de désactivation dans `/profile`. | `auth.service.session.spec.ts` |
| E1 | `User.tokenVersion` (migration `20260918120000`) porté par tous les tokens et vérifié par le guard et le refresh ; refresh tokens à usage unique (rotation, `jti` en Redis via `RefreshTokenStore`, mémoire sans Redis) ; `logout` révoque ; changement/réinitialisation de mot de passe et ban incrémentent la version. Les tokens émis avant le déploiement sont refusés (reconnexion unique). | `jwt-auth.guard.spec.ts`, `refresh-token.store.spec.ts`, `auth.service.session.spec.ts` |
| E2 | `trustProxy` calculé par `resolveTrustProxy(TRUST_PROXY)` : un saut par défaut, jamais `true`. | `bootstrap-config.spec.ts` |
| E3 | Un commentaire n'est masqué qu'à partir de 3 signalants distincts (`REPORT_AUTO_FLAG_THRESHOLD`) ; chaque signalement reste dans la file admin. | `comment.service.report.spec.ts` |
| E4 | `POST /admin/comments/:id/approve` et `/reject` acceptant `PENDING` et `FLAGGED` ; `GET /admin/events` + `approve`/`reject` ; notifications à l'auteur ; filtre « En attente » dans l'admin commentaires et nouvelle page `/admin/events`. | `admin.service.moderation.spec.ts`, `admin.controller.routes.spec.ts` |
| E5 | Routes `POST /admin/corrections/:id/approve` et `/reject` ajoutées (le service existait). | `admin.controller.routes.spec.ts`, `admin.service.moderation.spec.ts` |
| E6 | Scan via `clamd` (INSTREAM TCP) avec sémaphore (`CLAMAV_MAX_CONCURRENT`, `CLAMAV_MAX_QUEUE`) et délestage en 503 ; service `clamav` (clamd + freshclam) dans le compose ; paquet ClamAV retiré de l'image API ; mode CLI conservé en option (`CLAMAV_MODE=clamscan`). | `scan.service.spec.ts` (faux clamd TCP) |
| E7 | Workflow : build local → scan Trivy → push (`:sha` puis `:latest`) ; Trivy installé par action épinglée ; service `migrate` one-shot dont `api` et `sync-worker` dépendent (M9) ; `entrypoint.sh` aligné sur `migrate.mjs`. | validé par `docker compose config` |

Non traité dans cette phase (volontairement) : codes de récupération TOTP.

## Lot 1 — points Moyens de sécurité (branche `fix/audit-lot-1`)

| # | Correctif appliqué | Tests |
|---|---|---|
| M1 | Solution ALTCHA à usage unique : la signature du challenge est marquée consommée (`ReplayStore`, Redis `SET NX EX`, mémoire sans Redis). Rejouer une solution échoue. | `altcha.service.spec.ts`, `replay-store.spec.ts` |
| M2 | Fenêtre TOTP par défaut à ±1 pas (`TOTP_WINDOW=1`) ; un code accepté ne peut plus être réutilisé pendant sa durée de validité. | `auth.service.session.spec.ts` |
| M3 | Endpoint `POST /auth/check-email` supprimé, ainsi que la vérification en direct sur la page d'inscription. Le doublon est signalé à la soumission (409), derrière le captcha à usage unique. | `admin.controller.routes.spec.ts` (routes), typecheck |
| M4 | Verrouillage en deux niveaux : 5 échecs par couple (compte, IP) bloquent cette IP 15 min ; le compte entier n'est verrouillé qu'après 25 échecs répartis sur plusieurs IP. Un attaquant seul ne peut plus bloquer une victime. | `auth.service.lockout.spec.ts` |
| M5 | Tokens de vérification et de réinitialisation stockés hachés (SHA-256) ; migration `20260919090000` hache les tokens encore valides. | `auth.service.session.spec.ts` |
| M6 | Content-Security-Policy posée par Next sur toutes les pages (scripts et connexions limités à l'origine et aux fournisseurs de tuiles, `object-src 'none'`, `frame-ancestors 'none'`, workers en `blob:`). Limite : `script-src` garde `'unsafe-inline'` car les pages sont prérendues sans nonce. HSTS est déjà posé par le reverse proxy. | build Next |
| M7 | `AccountDeletionService` partagé entre l'auto-suppression et la suppression admin : anonymisation des logs, suppression des photos **et de l'avatar** en S3, puis de la ligne ; abandon si un objet ne peut pas être supprimé. | `account-deletion.service.spec.ts`, `admin.service.moderation.spec.ts` |

Reste après le lot 1 : points Moyens fonctionnels (M11, M15, M16, M17, M18), dette (M12, M13, M14, M19), performance (P1 à P7) et Faibles.

---

## 0. Synthèse

**Verdict initial (avant Phase 2) : NON prêt pour la production.**

Le socle est sérieux (Argon2id bien paramétré, secret TOTP chiffré AES-GCM, cookies httpOnly/SameSite=Strict, pipeline photo validé par `file-type` + `sharp` + ClamAV, objets S3 jamais servis en direct, audit trail, journal RGPD). Mais plusieurs fonctionnalités de sécurité ou de modération sont **cassées à l'exécution**, et la gestion des sessions ne permet aucune révocation. Huit points bloquent la mise en ligne :

| # | Bloquant | Effet concret |
|---|---|---|
| C1 | Connexion avec TOTP impossible | Tout utilisateur qui active la 2FA est définitivement verrouillé hors de son compte (aucun endpoint de désactivation). |
| E1 | Refresh tokens non révocables | Un token volé reste valable 7 jours même après changement/réinitialisation du mot de passe ou logout. |
| E2 | `trustProxy: true` | Le rate limiting et le verrouillage de compte se contournent en forgeant `X-Forwarded-For`. |
| E3 | Signalement = retrait immédiat | N'importe quel membre fait disparaître n'importe quel commentaire en un clic. |
| E4 | Contenus des comptes < 7 jours jamais publiables | Commentaires et événements des nouveaux membres restent `PENDING` sans aucun moyen de les approuver. |
| E5 | Modération des corrections inaccessible | Le front appelle des routes admin qui n'existent pas (404). |
| E6 | ClamAV en mode `clamscan` par upload | ~1 Go de RAM et 10 à 30 s par fichier, sans limite de concurrence : DoS mémoire trivial et timeouts probables. |
| E7 | Image Docker publiée avant le scan Trivy | Une image vulnérable est poussée sur `:latest` même si le scan échoue ensuite. |

La règle métier « la couche communautaire ne modifie jamais les données sources » est **respectée** dans le code applicatif (voir §2), avec deux réserves à arbitrer (M16, M18).

---

## 1. Sécurité

### 1.1 Authentification et sessions

**C1 — Connexion avec TOTP impossible, verrouillage définitif des comptes 2FA**
Sévérité : **Critique**
Fichiers : `apps/api/src/auth/auth.controller.ts:124-134` et `:136-154`, `apps/api/src/auth/auth.service.ts:240-250`, `apps/api/src/auth/guards/jwt-auth.guard.ts:30-35`, `apps/web/src/lib/auth-context.tsx:103-106`
Constat : quand `totpEnabled` est vrai, le service génère un JWT partiel (`totpPending: true`) mais le contrôleur ne le renvoie ni en cookie ni dans le corps (`return ok({ requireTotp })`). Le front appelle ensuite `POST /auth/login/totp` sans aucun token. Cette route n'est pas `@Public()` : `JwtAuthGuard` répond 401 « Missing authentication token ». Il n'existe par ailleurs aucun endpoint `totp/disable` (l'action d'audit `TOTP_DISABLE` existe dans le schéma mais rien ne l'utilise), et la réinitialisation du mot de passe ne désactive pas la 2FA.
Risque : tout membre (y compris un admin) qui active la 2FA depuis `/profile` perd l'accès à son compte sans recours. Aucun test ne couvre ce flux.
Correctif : poser un cookie dédié de courte durée (`totp_pending`, 5 min, httpOnly) contenant le token partiel dans `login()`, le lire explicitement dans `loginTotp()` (ou rendre la route publique et vérifier le token partiel à la main), puis l'effacer. Ajouter `POST /auth/totp/disable` (mot de passe + code TOTP requis), des codes de récupération, et un test d'intégration login → TOTP → profil.

**E1 — Refresh tokens sans rotation ni révocation**
Sévérité : **Élevée**
Fichiers : `apps/api/src/auth/auth.service.ts:512-538`, `apps/api/src/auth/auth.controller.ts:156-173`
Constat : le refresh token est un JWT stateless de 7 jours, sans `jti`, sans stockage, sans rotation. `logout` se contente d'effacer les cookies. `changePassword`, `resetPassword` et le bannissement n'invalident aucun token (le bannissement est tout de même bloqué par le guard qui relit `status` en base à chaque requête). `refreshTokens()` ne vérifie même pas que l'utilisateur existe encore ou n'est pas banni avant de re-signer.
Risque : un refresh token exfiltré (XSS sur un sous-domaine, appareil partagé, cookie « rester connecté ») donne 7 jours d'accès que la victime ne peut pas couper, même en changeant son mot de passe.
Correctif : ajouter `tokenVersion Int @default(0)` (ou `sessionsInvalidatedAt`) sur `User`, l'inclure dans les payloads, l'incrémenter sur changement/réinitialisation de mot de passe, logout et ban, et le comparer dans `JwtAuthGuard` et `refreshTokens()`. Idéalement stocker les `jti` de refresh dans Redis avec rotation à chaque refresh (détection de réutilisation).

**E2 — `trustProxy: true` : rate limiting et lockout contournables**
Sévérité : **Élevée**
Fichier : `apps/api/src/main.ts:18`
Constat : Fastify fait confiance à toute la chaîne `X-Forwarded-For`. Derrière Nginx Proxy Manager (qui utilise `$proxy_add_x_forwarded_for`, donc *ajoute* l'IP réelle à la fin d'un en-tête fourni par le client), `req.ip` devient la première valeur, c'est-à-dire celle choisie par l'attaquant. `ThrottlerGuard`, les audit logs et l'alerte ALTCHA s'appuient sur cette IP.
Risque : les limites `3/min` sur register, `5/min` sur login, `3/5min` sur forgot-password deviennent inopérantes ; couplé à M1 (captcha rejouable), un brute force en ligne redevient possible et le verrouillage de compte (M4) devient une arme de DoS sans trace fiable.
Correctif : `trustProxy: 1` (un seul saut) ou la liste CIDR du réseau `proxy`, et vérifier la configuration NPM. Ajouter un test qui envoie un `X-Forwarded-For` forgé et vérifie l'IP retenue.

**M1 — Solutions ALTCHA rejouables pendant 10 minutes**
Sévérité : Moyenne
Fichiers : `apps/api/src/altcha/altcha.service.ts:30-51`, `apps/api/src/altcha/altcha.guard.ts:49`
Constat : `verifySolution(payload, hmacKey, true)` vérifie la signature et l'expiration, mais aucune solution consommée n'est mémorisée. Une solution calculée une fois est réutilisable jusqu'à expiration (10 min) sur toutes les routes gardées.
Risque : le coût du proof-of-work n'est payé qu'une fois par fenêtre de 10 min ; le captcha ne protège pratiquement que contre les bots les plus naïfs.
Correctif : stocker un hash du challenge (`challenge`/`signature`) dans Redis avec `SET NX EX 600` lors de la vérification ; refuser si déjà présent. Réduire `expires` à 2-3 min.

**M2 — Force brute sur le code TOTP**
Sévérité : Moyenne
Fichiers : `apps/api/src/auth/auth.service.ts:64-73` et `:324-354`, `apps/api/src/auth/auth.controller.ts:136`
Constat : fenêtre `±2` pas (5 codes valides simultanément), pas de compteur d'échecs sur `verifyTotpLogin`, seul le throttler global (10/s, 200/min) s'applique. Le token partiel vaut 5 minutes.
Risque : ~1 000 essais par session partielle contre 5 codes valides sur 10⁶ : probabilité faible mais non négligeable, et répétable à chaque login.
Correctif : `@Throttle` dédié (5/min) sur `login/totp`, compteur d'échecs TOTP avec verrouillage, fenêtre `1` par défaut, et rejet du dernier code accepté (anti-rejeu).

**M3 — Énumération d'adresses e-mail**
Sévérité : Moyenne
Fichier : `apps/api/src/auth/auth.controller.ts:109-117`
Constat : `POST /auth/check-email` est public, sans captcha ni throttle dédié, et répond `{ available: boolean }`. `register` renvoie aussi un 409 explicite.
Risque : constitution d'une liste de membres (pilotes identifiables), phishing ciblé.
Correctif : throttle strict (par IP et global), `AltchaGuard`, ou supprimer l'endpoint et n'indiquer le conflit qu'après vérification e-mail.

**M4 — Verrouillage de compte utilisable comme DoS ciblé**
Sévérité : Moyenne
Fichier : `apps/api/src/auth/auth.service.ts:155-221`
Constat : 5 échecs verrouillent le compte 15 min, sans distinction d'origine.
Risque : n'importe qui peut empêcher une victime connue de se connecter indéfiniment (aggravé par E2 et M1).
Correctif : combiner verrouillage par couple (compte, IP/empreinte) et backoff progressif plutôt qu'un verrou global du compte ; notifier l'utilisateur.

**M5 — Tokens de vérification/réinitialisation stockés en clair**
Sévérité : Moyenne
Fichiers : `packages/database/prisma/schema.prisma:276-290`, `apps/api/src/auth/auth.service.ts:122-130`, `:445-453`
Risque : une fuite de dump SQL permet de réinitialiser n'importe quel mot de passe pendant 1 h après une demande.
Correctif : stocker `sha256(token)` et comparer le hash ; le token brut ne transite que dans l'e-mail.

**F1 — Secrets : réutilisation et absence de garde-fous**
Sévérité : Faible
Fichiers : `apps/api/src/main.ts:48-50`, `apps/api/src/auth/auth.service.ts:531-533`
Constat : `JWT_SECRET` sert aussi de secret de signature des cookies. Rien ne vérifie au démarrage que `JWT_SECRET ≠ JWT_REFRESH_SECRET` ni leur longueur. Si un opérateur met la même valeur, le token partiel TOTP (`totpPending`) est accepté par `refreshTokens()` et donne des tokens complets sans second facteur.
Correctif : valider la configuration au boot (Zod sur `process.env`, longueur ≥ 32, secrets distincts), secret cookie dédié.

**F2 — `GET /auth/verify-email` sans validation du paramètre**
Sévérité : Faible
Fichier : `apps/api/src/auth/auth.controller.ts:175-180`
Constat : `token` peut être `undefined` → `findUnique({ where: { token: undefined } })` lève une erreur Prisma → 500.
Correctif : `ZodValidationPipe` sur la query.

**F3 — Course sur l'unicité du `displayName`**
Sévérité : Faible
Fichier : `apps/api/src/auth/auth.service.ts:90-119`
Constat : vérification puis insertion ; la contrainte unique en base lève `P2002` non capturée → 500 au lieu de 409.
Correctif : capturer `PrismaClientKnownRequestError` code `P2002`.

### 1.2 Contrôle d'accès et IDOR

Points vérifiés et corrects : suppression de commentaire/événement/photo (propriétaire ou ADMIN/MODERATOR), profils avion, listes, recherches sauvegardées, notifications (toujours filtrés par `userId`), photos servies uniquement si `READY` et `showCommunityPhotos`, avatars servis via endpoint avec contrôle de visibilité, routes admin sous `@Roles("ADMIN")` au niveau classe, admin ne pouvant ni se bannir ni bannir/supprimer un autre admin, suppression d'utilisateur par admin exigeant son mot de passe.

**M16 — Rôle `MODERATOR` fantôme et écriture des données sources par l'API**
Sévérité : Moyenne
Fichiers : `apps/api/src/aerodrome/aerodrome.controller.ts:109-135`, `apps/api/src/aerodrome/aerodrome.service.ts:159-218`, `apps/api/src/comment/comment.service.ts:238-244`
Constat : `PUT /aerodromes/:id`, `POST /aerodromes` et `DELETE /aerodromes/:id` permettent à ADMIN/MODERATOR de créer, réécrire (pistes, fréquences, carburants remplacés en bloc) ou supprimer un aérodrome. Aucun écran ni endpoint n'attribue le rôle MODERATOR (seul `scripts/promote-admin.ts` existe). Toute modification manuelle est écrasée au prochain sync openAIP si le hash source change.
Risque : ambiguïté avec la règle métier ; un admin peut modifier les données sources depuis l'API, et un `DELETE` supprime en cascade visites, commentaires, photos, listes de tous les membres sur cet aérodrome.
Correctif : décider explicitement. Recommandation : retirer `PUT`/`DELETE` (ou les restreindre aux aérodromes `source: "manual"`), journaliser `ADMIN_ACTION` sur ces routes, supprimer le rôle MODERATOR du code tant qu'il n'est pas géré.

**F4 — Fuites mineures dans les réponses publiques**
Sévérité : Faible
Fichiers : `apps/api/src/comment/comment.service.ts:194-201`, `apps/api/src/photo/photo.service.ts:164-195`
Constat : `...comment` renvoie `userId`, `deletedById`, `contentStatus`, etc. ; `listForAerodrome` renvoie `storedKey` (clé S3 interne). L'`id` d'auteur est renvoyé même quand le profil est privé.
Correctif : DTO explicites (`select`) pour les réponses publiques.

### 1.3 Fonctions admin et modération

**E3 — Un signalement retire immédiatement le commentaire**
Sévérité : **Élevée**
Fichier : `apps/api/src/comment/comment.service.ts:570-575`, listing : `:144-155`
Constat : `createReport` passe le commentaire en `FLAGGED` sans attendre de décision ; `getComments` ne renvoie que `APPROVED`. Limite : 5 signalements/min et 15/h par IP (contournable via E2).
Risque : censure à un clic par n'importe quel membre (comptes jetables, concurrence, règlement de comptes) ; les admins doivent restaurer manuellement chaque commentaire.
Correctif : conserver le commentaire visible jusqu'à décision admin, ou ne masquer qu'au-delà d'un seuil (ex. 3 signalements distincts, ou 1 signalement d'un compte de confiance). Ajouter un test.

**E4 — Contenus `PENDING` des nouveaux comptes non publiables**
Sévérité : **Élevée**
Fichiers : `apps/api/src/comment/comment.service.ts:74-75` et `:374-375`, `apps/api/src/admin/admin.service.ts:750-806`, `apps/api/src/admin/admin.controller.ts` (aucune route événements)
Constat : les commentaires et événements des comptes de moins de 7 jours sont créés en `PENDING`. Le seul endpoint capable de changer un statut de commentaire est `restoreComment`, qui refuse tout ce qui n'est pas `FLAGGED` (« Ce commentaire n'est pas en attente de modération »). Aucun endpoint n'existe pour les événements. Ces contenus apparaissent dans la liste admin « active » mais sans action possible.
Risque : les premières contributions de chaque nouveau membre disparaissent silencieusement ; expérience désastreuse pour l'onboarding et perte de contenu.
Correctif : endpoint `POST /admin/comments/:id/approve` (et `reject`) acceptant `PENDING`, file de modération dédiée dans l'admin, équivalent pour les événements. Ou informer l'auteur que son contenu est en attente.

**E5 — Approbation/rejet des corrections : routes absentes**
Sévérité : **Élevée**
Fichiers : `apps/web/src/app/admin/corrections/page.tsx:83` et `:100`, `apps/api/src/admin/admin.service.ts:557-693` (méthodes jamais appelées), `apps/api/src/admin/admin.controller.ts` (aucune route `corrections/:id/approve|reject`)
Constat : le front appelle `POST /admin/corrections/:id/approve` et `/reject` ; le contrôleur n'expose que `GET /admin/corrections`. Les méthodes `approveCorrection`/`rejectCorrection` sont du code mort.
Risque : les corrections proposées par la communauté ne peuvent jamais être publiées ni refusées ; les signalements sur corrections (qui les passent en `FLAGGED`) restent aussi bloqués.
Correctif : ajouter les deux routes (`@Post("corrections/:correctionId/approve")` / `reject`) avec `ReviewAdminCorrectionSchema`, et un test.

**M7 — Suppression d'utilisateur par l'admin sans purge du stockage**
Sévérité : Moyenne
Fichier : `apps/api/src/admin/admin.service.ts:285-341` (à comparer avec `auth.service.ts:627-692`)
Constat : `deleteUser` fait un `user.delete` direct ; la cascade supprime les lignes `Photo` mais pas les objets S3 (photos + avatar). L'auto-suppression, elle, nettoie S3 et anonymise les logs.
Risque : objets orphelins contenant des données personnelles (RGPD art. 17), incohérence entre les deux chemins.
Correctif : factoriser une méthode `AccountDeletionService.purge(userId)` utilisée par les deux chemins.

**M8 — Journalisation des échecs captcha alimentée par des anonymes**
Sévérité : Moyenne
Fichier : `apps/api/src/altcha/altcha.guard.ts:71-103`
Constat : chaque échec (y compris « payload manquant ») écrit une ligne `audit_logs` puis exécute un `COUNT` avec filtre JSONB (`metadata->>'type'`) non indexé sur 10 minutes.
Risque : amplification : une rafale de requêtes sans captcha remplit la table et coûte un scan par requête.
Correctif : compteur Redis (`INCR` + `EXPIRE`) pour l'alerte, journalisation échantillonnée, index GIN ou colonne dédiée si le JSONB reste interrogé.

**M17 — Bouton « Signaler cette fiche » inopérant**
Sévérité : Moyenne (fonctionnel)
Fichiers : `apps/web/src/app/aerodrome/[id]/page.tsx:1590`, `packages/shared/src/schemas/comment.schema.ts:15-19`
Constat : le front envoie `targetType: "aerodrome"`, refusé par `ReportCreateSchema` (`comment | correction | photo`) ; l'erreur est avalée (`catch { /* ignore */ }`).
Correctif : soit ajouter le type `aerodrome` côté API et admin, soit retirer le bouton.

### 1.4 Pipeline d'upload photo

Points corrects : champ unique, taille limitée en streaming (`fileSize` + `truncated`), fichier temporaire dans un dossier UUID, détection du type réel par `file-type` (magic bytes), `limitInputPixels` contre les bombes de décompression, `failOn: "error"`, réencodage systématique (JPEG/WebP, métadonnées EXIF supprimées, orientation appliquée), nom de stockage UUID, scan antivirus avant réencodage, nettoyage en `finally`, objets servis uniquement via l'API.

**E6 — ClamAV en mode `clamscan` (CLI) par upload, sans limite de concurrence**
Sévérité : **Élevée**
Fichiers : `apps/api/src/photo/scan.service.ts:39-59`, `apps/api/Dockerfile:40`, `docker-compose.prod.yml:108-122` et `:172-176`
Constat : chaque upload lance un processus `clamscan` qui recharge l'intégralité de la base de signatures (≈ 300 Mo sur disque, ≈ 1 Go en RAM, 10 à 30 s de démarrage à froid). Aucun sémaphore ; le timeout est de 20 s. Le conteneur `clamav-updater` ne fait tourner que `freshclam`, pas `clamd`.
Risque : (a) déni de service mémoire : 5 uploads/min/IP × plusieurs IP suffisent à faire tuer le conteneur API par l'OOM killer ; (b) sur un VPS modeste, le scan dépasse probablement les 20 s → tous les uploads sont rejetés (`503 L'analyse antivirus a expiré`) et laissent des lignes `Photo` en `REJECTED`.
Correctif : faire tourner `clamd` dans le conteneur ClamAV (image officielle, `clamd` écoute sur 3310) et utiliser le protocole `INSTREAM` (le paquet `clamscan` npm déjà présent le supporte, ou un client TCP minimal), avec un sémaphore (`p-limit`, 2 scans simultanés) et une file. Supprimer le paquet Debian `clamav` de l'image API.

**M11 — HEIC/HEIF acceptés mais probablement non décodables**
Sévérité : Moyenne (fonctionnel)
Fichiers : `apps/api/src/photo/photo.constants.ts:8-23`, `apps/api/src/photo/image.service.ts:93-96`, `apps/web/src/components/ui/photo-upload.tsx:22-23`
Constat : `file-type` reconnaît HEIC/HEIF, mais les binaires `sharp` pré-compilés n'embarquent pas le décodeur HEVC (brevets) ; `sharp.metadata()` échoue → « Impossible de traiter cette image ». Le front annonce pourtant le format (photos iPhone).
Correctif : vérifier `sharp.format.heif.input` au démarrage et retirer HEIC de la liste si absent ; ou convertir côté client (`heic2any`) ; ou construire libvips avec libheif.

**F5 — Lignes `Photo` fantômes**
Sévérité : Faible
Fichier : `apps/api/src/photo/photo.service.ts:43-54` et `:125-133`
Constat : une ligne est créée avant validation avec `storedKey: ""`, et passée en `REJECTED` avec le message d'erreur en cas d'échec. Elles polluent la liste admin « rejetées ».
Correctif : ne créer la ligne qu'après validation/scan, ou purger les `REJECTED` sans `storedKey` dans le job RGPD.

### 1.5 Overpass et sources externes

Constat positif : **Overpass n'est pas appelé à l'exécution**. Les POI viennent d'un import local (Geofabrik → osmium → table `osm.pois`) et les requêtes « à proximité » sont des bbox Prisma. Le client `services/overpass/overpass.client.ts` n'est référencé par aucun module de l'API (code mort côté API, utilisé uniquement par `scripts/import-osm.ts`) ; ses endpoints sont des constantes, sans entrée utilisateur : pas de SSRF. CheckWX (`metar.service.ts`) : clé en en-tête, cache Redis avec TTL calculé, mais `fetch` sans timeout. Nominatim (`regions-sync.task.ts`) : `User-Agent` défini et cadence 1,1 s respectée.

**M18 — Sync régions : écrasement des champs `city`/`region` par `null`**
Sévérité : Moyenne (intégrité)
Fichier : `apps/api/src/sync/tasks/regions-sync.task.ts:63-65` et `:122-125`
Constat : si Nominatim renvoie `{ error }` ou une réponse sans `address`, la tâche retourne `{ city: null, region: null }` et **écrit ces null** en base. Le run mensuel `full` réécrit tous les aérodromes.
Risque : perte silencieuse de données géographiques, et un `city: null` réenclenche le mode `missing_only` en boucle.
Correctif : ne mettre à jour que si une valeur non nulle est obtenue ; compter les « inconnus » séparément.

**F6 — `fetch` sans timeout vers CheckWX et Geofabrik**
Sévérité : Faible
Fichiers : `apps/api/src/metar/metar.service.ts:187`, `:202`, `:217` ; `apps/api/src/sync/tasks/osm-sync.task.ts:103`
Correctif : `AbortSignal.timeout(8000)` sur les appels météo (requête utilisateur), timeout long sur le téléchargement PBF.

### 1.6 Rate limiting, validation, en-têtes

**M6 — Pas de CSP ni HSTS sur le front ; CSP posée sur la mauvaise application**
Sévérité : Moyenne
Fichiers : `apps/web/next.config.ts:7-22`, `apps/api/src/main.ts:30-46`, `apps/api/package.json:21`
Constat : la CSP détaillée est enregistrée par `@fastify/helmet` sur l'API JSON, où elle n'a aucun effet utile ; Next.js ne pose que `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Pas de `Strict-Transport-Security` (à confirmer côté reverse proxy). `@fastify/csrf-protection` est installé et jamais enregistré ; le CSRF est aujourd'hui couvert uniquement par `SameSite=Strict` (acceptable pour les navigateurs modernes, mais à documenter).
Correctif : CSP nonce-based dans `next.config.ts` (ou middleware), HSTS au proxy, retirer la dépendance inutilisée ou l'activer.

**M15 — `z.coerce.boolean()` : `"false"` devient `true`**
Sévérité : Moyenne (latent)
Fichiers : `packages/shared/src/schemas/search.schema.ts:22-30` et `:50`, `packages/shared/src/schemas/notification.schema.ts:6`
Constat : `Boolean("false") === true`. `?hasRestaurant=false` filtre sur `true`, `?unreadOnly=0` renvoie les non lus. Le front n'envoie aujourd'hui que `"true"`, donc aucun bug visible, mais l'API est fausse pour tout autre client.
Correctif : `z.enum(["true","false"]).transform(v => v === "true")` ou `z.stringbool()` (Zod 4).

**F7 — Requêtes non validées par Zod**
Sévérité : Faible
Fichiers : `apps/api/src/aerodrome/aerodrome.controller.ts:61`, `:141`, `:155`, `:171` ; `apps/api/src/airspace/airspace.controller.ts:20-27` ; `apps/api/src/restaurant/restaurant.controller.ts:15-20`
Constat : `parseInt`/`parseFloat` manuels, bornes appliquées à la main, `q` libre sur la carte. Aucune injection possible (Prisma paramétré), mais incohérent avec le reste.
Correctif : schémas Zod dédiés.

### 1.7 Secrets et variables d'environnement

Points corrects : aucun secret réel dans le dépôt (`.env.development` ne contient que des valeurs de dev explicitement marquées), `.env`/`.env.local` ignorés, secrets injectés par Portainer, `TOTP_ENCRYPTION_KEY` obligatoire (`CryptoService` refuse de démarrer sans), `ALTCHA_HMAC_KEY` obligatoire si activé, Redis avec mot de passe, Postgres non exposé.

**F8 — `.dockerignore` n'exclut pas `.env*`**
Sévérité : Faible
Fichiers : `.dockerignore`, `apps/api/Dockerfile:19`, `apps/web/Dockerfile:28`
Constat : `COPY . .` dans l'étage `builder` embarque `.env`/`.env.local` s'ils existent sur la machine qui construit (pas le cas en CI). L'étage `runner` ne les copie pas.
Correctif : ajouter `.env*` et `!.env.development` au `.dockerignore`.

**F9 — Valeurs d'exemple dangereuses**
Sévérité : Faible
Fichier : `.env.prod.example:23-24`
Constat : `S3_ACCESS_KEY=any_value` / `S3_SECRET_KEY=any_value` invitent à laisser des identifiants triviaux sur le S3 SeaweedFS (réseau interne uniquement, ce qui limite l'impact).
Correctif : `change_me_...` comme pour les autres secrets, et validation au boot.

### 1.8 Dépendances

`pnpm audit --prod` : 12 modérées, 3 faibles, aucune haute/critique. Détail utile :

| Paquet | Version | Chemin | Note |
|---|---|---|---|
| `hono` | 4.12.27 | `altcha-lib > hono` | **figé à une version vulnérable par l'override `"hono": "4.12.27"`** (`package.json:38`) ; 6 avis (ReDoS CORS, `parseBody` mémoire, etc.). Non utilisé à l'exécution par le chemin `altcha-lib/v1`, mais l'override empêche toute remédiation et le `.trivyignore` attribue ces CVE à `@prisma/dev` (justification inexacte). |
| `nodemailer` | 9.1.0 | `apps/api` | contournement `disableFileAccess` (modéré) : passer à ≥ 9.1.1. |
| `fast-xml-parser` | 5.5.8 | `@aws-sdk/client-s3` | mettre à jour le SDK. |
| `@hono/node-server`, `valibot` | — | `prisma > @prisma/dev` | outillage Prisma, présent dans l'image runtime (voir F10). |

**M10 — Chaîne CI/CD : ordre push/scan, installation de Trivy, overrides**
Sévérité : voir E7 ci-dessous pour l'ordre ; le reste Moyenne
Fichiers : `.github/workflows/docker-publish.yml:123-124`, `:184-185`, `package.json:23-41`, `.trivyignore`
Constat : Trivy est installé par `curl … /main/contrib/install.sh | sh` (script non épinglé, branche `main`) ; les actions sont épinglées par tag majeur et non par SHA ; 18 overrides pnpm forcent des versions (dont `hono` et `undici`) sans commentaire de justification ni date de revue ; `.trivyignore` contient 17 entrées justifiées « bundled npm », ce qui est plausible mais non vérifié automatiquement.
Correctif : `aquasecurity/trivy-action@<sha>` ; épingler les actions par SHA ; documenter chaque override (raison, date, ticket) ; revoir `.trivyignore` à chaque bump de base image.

### 1.9 Dockerfiles, compose et workflow

Points corrects : builds multi-étages, utilisateur non-root (`apiuser`, `nextjs`), `npm`/`corepack` retirés de l'image API, `output: "standalone"` pour Next, réseau `internal` isolé (Postgres, Redis, SeaweedFS jamais exposés au proxy), healthchecks, base ClamAV montée en lecture seule, worker de sync séparé avec lock advisory Postgres, migrations idempotentes via `_prisma_migrations`.

**E7 — Image publiée sur GHCR avant le scan Trivy**
Sévérité : **Élevée**
Fichier : `.github/workflows/docker-publish.yml:126-147` et `:187-212`
Constat : `docker/build-push-action` avec `push: true` et tags `:latest` + `:sha`, **puis** `trivy image --exit-code 1`. Si le scan échoue, le job est rouge mais l'image est déjà sur le registre sous `latest`, tag que `docker-compose.prod.yml` consomme par défaut (`IMAGE_TAG:-latest`).
Risque : un déploiement Portainer (pull ou webhook) récupère une image que la CI vient de refuser ; aucun mécanisme n'empêche `latest` d'avancer.
Correctif : construire avec `load: true` / `push: false` et tag `:sha`, scanner, puis pousser (`docker push`) et ne retagger `latest` qu'après succès ; déployer par `IMAGE_TAG=<sha>` plutôt que `latest` pour permettre le rollback.

**M9 — Migrations jamais appliquées automatiquement, et deux mécanismes contradictoires**
Sévérité : Moyenne (exploitation)
Fichiers : `docker-compose.prod.yml:127-133`, `:193`, `:269` ; `apps/api/docker/entrypoint.sh:11-16` ; `apps/api/docker/migrate.mjs`
Constat : le compose écrase `entrypoint`/`command` (l'`entrypoint.sh` de l'image n'est donc jamais exécuté) et fixe `RUN_MIGRATIONS: "false"` pour les deux services. `entrypoint.sh` appelle `prisma migrate deploy`, alors que `migrate.mjs` explique que cette commande ne fonctionne pas avec Prisma 7 + adapter ; `migrate.mjs` est copié dans l'image mais rien ne l'appelle. `README.md` ne documente ni Portainer ni la procédure de migration.
Risque : un déploiement contenant une migration démarre une API dont le schéma ne correspond pas à la base (erreurs 500 sur les nouvelles colonnes) ; procédure manuelle non documentée et dépendante d'une personne.
Correctif : service `migrate` one-shot dans le compose (`node apps/api/docker/migrate.mjs`, `restart: "no"`, dont `api` dépend avec `condition: service_completed_successfully`), supprimer le chemin `prisma migrate deploy`, documenter.

**F10 — Image API surdimensionnée**
Sévérité : Faible
Fichier : `apps/api/Dockerfile:43-46`
Constat : l'intégralité des `node_modules` du workspace (Nest CLI, TypeScript, Vitest, `@prisma/dev`, `tsx`) est copiée dans l'image runtime.
Correctif : `pnpm deploy --prod --filter @aerodirectory/api` vers un dossier isolé, puis copier ce dossier.

**F11 — Images tierces non épinglées**
Sévérité : Faible
Fichier : `docker-compose.prod.yml:34`, `:49`, `:61`, `:81`, `:109`
Constat : `chrislusf/seaweedfs:latest` (×4) et `clamav/clamav:stable` ; un `pull` change la version sans revue.
Correctif : tags de version explicites (ou digests) et mise à jour via PR.

---

## 2. Intégrité des données sources

Règle auditée : *la couche communautaire ne peut en aucun cas modifier les données importées* (`Aerodrome`, `Runway`, `Frequency`, `Fuel`, `Airspace`, `osm.pois`).

Vérification exhaustive des écritures sur ces tables (`grep` de tous les `create/update/upsert/delete/$executeRaw`) :

| Écriture | Fichier | Déclencheur | Conforme ? |
|---|---|---|---|
| Upsert aérodromes + enfants | `services/importers/openaip/openaip.importer.ts:127-196` | sync openAIP (worker) | Oui (source) |
| `hasRestaurant/hasBikes/hasTransport/hasAccommodation` | `sync/tasks/flags-sync.task.ts:64-72` | sync OSM (worker) | Oui (dérivé de source OSM) |
| `city`, `region`, `lastSyncedAt` | `sync/tasks/regions-sync.task.ts:122-125` | sync régions (worker) | Oui, mais voir M18 (écrasement par null) |
| `osm.pois` | `sync/tasks/osm-sync.task.ts:218-227` | sync OSM (worker) | Oui |
| `Airspace` upsert/deleteMany | `admin/admin.service.ts:1568-1595`, `openaip-airspaces.importer.ts` | admin / worker | Oui (admin, journalisé) |
| `aerodrome.create/update/delete` | `aerodrome/aerodrome.service.ts:159-218` | **API, rôle ADMIN/MODERATOR** | À arbitrer (M16) |

Chemins communautaires vérifiés : `Comment`, `Correction`, `Report`, `AerodromeEvent`, `Visit`, `Photo`, `Follow`, `SavedSearch`, `AerodromeList(+Item)`, `AircraftProfile`, `Notification`. Aucun ne touche les tables sources. En particulier, l'**approbation d'une correction ne modifie pas l'aérodrome** (`admin.service.ts:584-591`) : elle reste une couche affichée séparément (`aerodrome.service.ts:20-35`, `:56-66`). La valeur `currentValue` est figée au moment de la proposition (`comment.service.ts:307`).

Conclusion : **règle respectée** dans le code. Deux réserves : les routes admin d'écriture directe (M16) et la tâche régions (M18). Recommandation complémentaire : matérialiser la règle par un test (« aucun module hors `sync/` et `services/importers/` n'importe une écriture sur `aerodrome` ») et, à terme, par des droits Postgres distincts (rôle applicatif sans `UPDATE` sur les tables sources, rôle worker avec).

---

## 3. Qualité de code

**M12 — Copies obsolètes de l'API versionnées dans le dépôt**
Sévérité : Moyenne
Fichiers : `tmp-api-deploy/` (75 fichiers), `tmp-api-deploy2/` (77 fichiers), `apps/web/src/app/aerodrome/aerodrome.html` (18 Ko), `apps/web/tsconfig.tsbuildinfo`
Constat : deux snapshots complets et divergents de `apps/api/src` (vérifié par `diff -rq`) sont suivis par git ; `.dockerignore` les exclut mais pas `.gitignore`. Ils doublent la surface de revue, trompent les outils (grep, IDE, scanners) et contiennent d'anciennes versions des guards.
Correctif : supprimer et ignorer ; conserver l'historique via git si besoin.

**M13 — Cinq clients Redis indépendants, pas de module partagé**
Sévérité : Moyenne
Fichiers : `restaurant.service.ts:91-111`, `transport.service.ts`, `accommodation.service.ts`, `metar.service.ts:96-113`, `sync.service.ts:82-83` ; `sync-lock.service.ts:11-13` (second pool `pg`)
Constat : même bloc constructeur copié 4 fois (connexion, `on("error")`, fallback mémoire), chacun avec sa propre connexion ; `ThrottlerModule` reste en mémoire (perte des compteurs à chaque redémarrage, non partagé entre `api` et `sync-worker` qui exposent tous deux l'API HTTP).
Correctif : `RedisModule` global exposant un client unique + un `CacheService` (`getOrSet(key, ttl, fn)`), `ThrottlerStorageRedisService`, réutiliser le pool Prisma pour le lock.

**M14 — Duplication de logique métier**
Sévérité : Moyenne
Fichiers : `haversine*` défini 5 fois (`aerodrome.service.ts:304`, `search.service.ts:393`, `planner.service.ts:225`, `visit.service.ts:133`, `auth.service.ts:1173`, `restaurant.service.ts:466`) ; paramètres Argon2 répétés 4 fois (`auth.service.ts:105`, `169` sans paramètres, `484`, `607`) ; `findById`/`findByIcao` identiques à la clause `where` près (`aerodrome.service.ts:13-123`) ; calcul des stats Aerodex dupliqué entre `visit.service.ts:54-130` et `auth.service.ts:840-899` ; blocs `Promise.all` de résolution d'auteurs répétés dans `admin.service.ts`.
Correctif : `packages/shared/src/geo.ts`, `PasswordService.hash()`, une seule requête aérodrome paramétrée, un `AerodexStatsService`.

**M19 — Services monolithiques**
Sévérité : Moyenne
Fichiers : `admin.service.ts` (2 087 lignes), `auth.service.ts` (1 301), `aerodrome/[id]/page.tsx` (2 016), `planner/page.tsx` (2 166), `map/page.tsx` (966)
Constat : `AuthService` gère inscription, login, TOTP, tokens, profil, avatar, communauté, follow, export RGPD ; `AdminService` gère utilisateurs, commentaires, corrections, photos, signalements, mails, diagnostics, import OpenAir. Les pages front mélangent fetch, état, cartes et rendu inline (styles en objets JS sur des lignes de 400+ caractères).
Correctif : découper par domaine (`SessionService`, `TotpService`, `CommunityService`, `ModerationService`, `MailAdminService`), extraire les composants de page.

**F12 — Nommage : restes « aerodirectory »**
Sévérité : Faible
Occurrences : `package.json:2` (`"name": "aerodirectory"`), tous les packages `@aerodirectory/*` (imports dans ~60 fichiers), `IMAGE_PREFIX: ghcr.io/…/aerodirectory` et images `aerodirectory-api`/`-web` (`docker-publish.yml:13`, `docker-compose.prod.yml:125`, `:201`, `:277`), `S3_BUCKET` par défaut `"aerodirectory"` (`storage.service.ts:26`), base de données `aerodirectory` (`.env.development:2`, `docker-compose.yml:7`), `README.md`, `.env.prod.example:1-3`, `pgadmin` `admin@aerodirectory.fr`, dossier du dépôt. Le produit, les logs, les mails et le domaine disent « Navventura ».
Correctif : renommage coordonné (packages, images GHCR, bucket) en une PR dédiée ; le nom de la base peut rester si documenté.

**F13 — Code mort et incohérences mineures**
Sévérité : Faible
- `services/overpass/overpass.client.ts` : non utilisé par l'API (uniquement par `scripts/`).
- `admin.service.ts:557-693` : `approveCorrection`/`rejectCorrection` jamais routés (voir E5).
- `AuditService.purgeExpiredLogs` (`audit.service.ts:70-85`) et `SyncService.runRgpdCleanup` (`sync.service.ts:315-328`) font le même travail, l'un sur `api`, l'autre sur `sync-worker`.
- `getDashboardStats` renvoie `deletedComments: 0` en dur (`admin.service.ts:98`) alors que le schéma prévoit `deletedAt/deletedReason/deletedById` jamais renseignés : la suppression est physique, le soft-delete est mort.
- `apps/api/package.json:21` `@fastify/csrf-protection` et `:38` `class-transformer` : non importés.
- `MailService.sendSyncSummary` interpole `errorMessage`/`summary` non échappés dans du HTML (`mail.service.ts:300-304`) ; `sendAdminTestEmail` interpole `displayName` (`:182`).
- `.env.development` est chargé par `scripts/setup.mjs` (copie) mais `ConfigModule` ne lit que `.env.local`/`.env` : documentation implicite.
- Toutes les erreurs Prisma non capturées remontent en 500 générique (pas de filtre d'exception global) : acceptable, mais aucune corrélation (`requestId`) dans les logs.

Typage : `strict` respecté, `noUncheckedIndexedAccess` visiblement actif (usage de `!`). Points faibles : `as never` pour passer `PrismaService` aux tâches de sync (`sync.service.ts:456`, `505`, `545`, `609`, `617`), `any` explicites dans `metar.service.ts` (réponse CheckWX non typée), `params as Record<string,string>` sur les JSON de recherches sauvegardées.

---

## 4. Performance

Volumétrie estimée : ~3 000 aérodromes, quelques centaines d'espaces aériens (géométries lourdes), plusieurs centaines de milliers de POI OSM. PostGIS est installé (`postgis/postgis:16-3.4`) mais **aucune colonne géométrique, aucun index spatial et aucune fonction `ST_*` ne sont utilisés** : toute la géographie est faite en bbox lat/lon + Haversine en mémoire.

**P1 — Espaces aériens : table entière chargée à chaque déplacement de carte**
Sévérité : Moyenne
Fichier : `apps/api/src/airspace/airspace.service.ts:20-45`
Constat : `findByBbox` lit toutes les lignes `FR` avec `geometry` (JSON complet), puis filtre en JS. Requête publique, sans `Cache-Control`, sans cache Redis, déclenchée à chaque `moveend` de la carte.
Correctif : colonne `bbox` (minLat/minLng/maxLat/maxLng) indexée ou `geometry` PostGIS + index GiST + `ST_Intersects` ; cache Redis par tuile/bbox arrondie ; `Cache-Control: public, max-age=3600` (données quotidiennes).

**P2 — Carte : dump complet des aérodromes sans cache**
Sévérité : Moyenne
Fichier : `apps/api/src/aerodrome/aerodrome.service.ts:220-253`
Constat : `GET /aerodromes/map` renvoie tous les aérodromes avec pistes et carburants ; aucune mise en cache alors que les données changent une fois par nuit.
Correctif : cache Redis (TTL 1 h, invalidé par le sync) + `ETag`/`Cache-Control`.

**P3 — Recherche triée par distance : pagination en mémoire**
Sévérité : Moyenne
Fichier : `apps/api/src/search/search.service.ts:347-386`
Constat : `sortBy=distance` charge **toutes** les lignes filtrées (`take: undefined`) avec `runways`, `fuels`, `_count`, puis trie et découpe en JS.
Correctif : `ORDER BY` par distance en SQL (`ST_Distance` ou formule Haversine en `$queryRaw`) avec `LIMIT/OFFSET`.

**P4 — Planificateur : scan complet à chaque calcul**
Sévérité : Faible
Fichier : `apps/api/src/planner/planner.service.ts:105-131`
Constat : tous les aérodromes `OPEN` (avec pistes et carburants) sont chargés puis filtrés par distance en JS. Acceptable à 3 000 lignes, mais chaque clic = requête lourde.
Correctif : pré-filtre bbox à partir de `maxOneWayNm`.

**P5 — Index manquants**
Sévérité : Faible
Fichier : `packages/database/prisma/schema.prisma:349-355`, `:457-459`, `:620-635`
Constat : pas d'index `(latitude, longitude)` sur `aerodromes` (toutes les bbox font un scan) ; `comments` sans index composite `(aerodromeId, parentId, contentStatus, deletedAt)` ; `audit_logs.metadata` interrogé par chemin JSON (`type`, `status`, `category`) sans index GIN ; `photos(status)` correct.
Correctif : `@@index([latitude, longitude])`, index composite commentaires, colonne `type` extraite du JSON ou index GIN `jsonb_path_ops`.

**P6 — Une requête utilisateur par appel authentifié**
Sévérité : Faible
Fichier : `apps/api/src/auth/guards/jwt-auth.guard.ts:39-42`
Constat : le guard relit `User` à chaque requête (nécessaire pour le ban, bon choix), sans cache.
Correctif : cache Redis 30-60 s par `userId`, invalidé au ban (cohérent avec E1).

**P7 — Bundles Next.js**
Non mesuré (build non exécuté). Points positifs constatés : `maplibre-gl` chargé par `import()` dynamique sur les trois pages carte ; `output: "standalone"`. Points d'attention : pages de 2 000 lignes avec styles inline (pas de code splitting interne), `lucide-react` importé par icônes nommées (tree-shaking OK). Recommandation : `@next/bundle-analyzer` en CI et budget par route.

---

## 5. Tests

État réel :

| Zone | Fichiers | Tests | Ce qui est couvert |
|---|---|---|---|
| `apps/api` | 3 | 28 | verrouillage login (7), visibilité avatar (11), `RolesGuard` (10) |
| `apps/web` | 0 | 0 | `"test": "echo 'No tests yet'"` |
| `packages/shared` | 0 | 0 | — |
| Intégration / E2E | 0 | 0 | — |

Tous les tests existants sont unitaires avec Prisma mocké ; aucun ne traverse un contrôleur, un guard global ou une requête réelle. CI : `pnpm --filter @aerodirectory/api test` est exécuté (bien), `lint` = `tsc --noEmit` uniquement (pas d'ESLint).

**T1 — Parties critiques sans aucun test**
Sévérité : **Élevée** (c'est ce qui a laissé passer C1, E4, E5)
- `JwtAuthGuard` : extraction cookie/bearer, `totpPending`, ban.
- Flux TOTP complet (setup → verify → login/totp), refresh, logout.
- Vérification e-mail, réinitialisation de mot de passe (token expiré/réutilisé).
- `AltchaGuard` (payload manquant/invalide/rejoué).
- Pipeline photo : `ImageService.validateSource` (type réel ≠ extension, bombe de pixels, HEIC), `PhotoUploadMiddleware` (troncature), `ScanService` (codes retour clamscan), `PhotoService.upload` (rollback S3 en cas d'échec).
- Modération : `createReport` → statut, `restoreComment`, `approveReport`/`rejectReport` par type de cible, corrections (routes absentes), suppression admin (S3).
- Règle métier « pas d'écriture sur les données sources » (test architectural).
- Schémas Zod partagés (`z.coerce.boolean`, `PaginationSchema`, `ReportCreateSchema`).
- `openair-parser`, `openaip.normalizer`, `regions-sync` (cas `error` Nominatim), `flags-sync` (SQL).
- Front : rien, y compris le `login/page.tsx` et `auth-context.tsx`.

Correctif : (1) tests d'intégration Nest (`@nestjs/testing` + Fastify inject) sur les contrôleurs auth/admin/comment/photo avec une base Postgres de test (Testcontainers ou service CI) ; (2) tests unitaires purs sur les parsers/normalizers/schemas ; (3) un test architectural pour §2 ; (4) seuil de couverture sur `auth/`, `photo/`, `admin/`, `comment/` ; (5) ESLint dans `lint`.

---

## 6. Tableau récapitulatif

| ID | Sévérité | Domaine | Constat | Fichier principal |
|---|---|---|---|---|
| C1 | **Critique** | Auth | Login TOTP impossible, pas de désactivation : comptes 2FA verrouillés | `auth.controller.ts:124-154` |
| E1 | Élevée | Auth | Refresh tokens non révocables, pas de rotation | `auth.service.ts:512-538` |
| E2 | Élevée | Rate limiting | `trustProxy: true` → IP forgeable, throttling/lockout contournés | `main.ts:18` |
| E3 | Élevée | Modération | Un signalement masque immédiatement un commentaire | `comment.service.ts:570-575` |
| E4 | Élevée | Modération | Contenus `PENDING` (< 7 jours) jamais publiables | `admin.service.ts:770-772` |
| E5 | Élevée | Modération | Routes approve/reject corrections absentes (404) | `admin.controller.ts` |
| E6 | Élevée | Upload | `clamscan` CLI par upload : DoS mémoire, timeouts | `scan.service.ts:51` |
| E7 | Élevée | CI/CD | Image poussée sur `latest` avant le scan Trivy | `docker-publish.yml:126-147` |
| T1 | Élevée | Tests | Aucune couverture des chemins critiques | `apps/api/src/**` |
| M1 | Moyenne | Captcha | Solutions ALTCHA rejouables 10 min | `altcha.service.ts:42` |
| M2 | Moyenne | Auth | Brute force TOTP (fenêtre ±2, pas de compteur) | `auth.service.ts:64-73` |
| M3 | Moyenne | Auth | Énumération d'e-mails via `check-email` | `auth.controller.ts:109-117` |
| M4 | Moyenne | Auth | Lockout par compte = DoS ciblé | `auth.service.ts:184-221` |
| M5 | Moyenne | Auth | Tokens e-mail/reset en clair en base | `schema.prisma:276-290` |
| M6 | Moyenne | Headers | Pas de CSP/HSTS front ; CSRF dépendant de SameSite seul | `next.config.ts` |
| M7 | Moyenne | Admin/RGPD | Suppression admin sans purge S3 | `admin.service.ts:324` |
| M8 | Moyenne | DoS | Audit log + COUNT JSONB par échec captcha anonyme | `altcha.guard.ts:75-96` |
| M9 | Moyenne | Exploitation | Migrations manuelles, deux mécanismes contradictoires | `docker-compose.prod.yml:193` |
| M10 | Moyenne | Dépendances | Override `hono` figé vulnérable, Trivy via `curl \| sh`, actions non épinglées | `package.json:38` |
| M11 | Moyenne | Upload | HEIC/HEIF annoncés mais probablement non décodables | `image.service.ts:93` |
| M12 | Moyenne | Qualité | `tmp-api-deploy*/` versionnés (152 fichiers obsolètes) | racine |
| M13 | Moyenne | Qualité/Redis | 5 clients Redis, throttler en mémoire | `restaurant.service.ts:91` |
| M14 | Moyenne | Qualité | Duplications (haversine ×6, Argon2 ×4, stats Aerodex ×2) | divers |
| M15 | Moyenne | Validation | `z.coerce.boolean()` : `"false"` → `true` | `search.schema.ts:22-30` |
| M16 | Moyenne | Intégrité | `PUT/DELETE /aerodromes/:id` + rôle MODERATOR non géré | `aerodrome.controller.ts:109-135` |
| M17 | Moyenne | Fonctionnel | « Signaler la fiche » envoie un type refusé, erreur avalée | `aerodrome/[id]/page.tsx:1590` |
| M18 | Moyenne | Intégrité | Sync régions écrit `null` sur erreur Nominatim | `regions-sync.task.ts:63-65` |
| M19 | Moyenne | Qualité | Services/pages monolithiques (2 000+ lignes) | `admin.service.ts` |
| P1 | Moyenne | Perf | Espaces aériens : table entière par déplacement de carte | `airspace.service.ts:20-45` |
| P2 | Moyenne | Perf | Dump carte sans cache | `aerodrome.service.ts:220-253` |
| P3 | Moyenne | Perf | Tri distance : pagination en mémoire | `search.service.ts:347-386` |
| F1 | Faible | Secrets | Secret cookie = JWT_SECRET ; secrets non validés au boot | `main.ts:49` |
| F2 | Faible | Validation | `verify-email` sans token → 500 | `auth.controller.ts:177` |
| F3 | Faible | Auth | Course `displayName` → 500 au lieu de 409 | `auth.service.ts:90-119` |
| F4 | Faible | Fuite | `...comment`, `storedKey` dans les réponses publiques | `comment.service.ts:194` |
| F5 | Faible | Upload | Lignes `Photo` fantômes `REJECTED` | `photo.service.ts:43-54` |
| F6 | Faible | Externe | `fetch` sans timeout (CheckWX, Geofabrik) | `metar.service.ts:187` |
| F7 | Faible | Validation | Query params parsés à la main | `aerodrome.controller.ts:141` |
| F8 | Faible | Docker | `.dockerignore` n'exclut pas `.env*` | `.dockerignore` |
| F9 | Faible | Secrets | `S3_*_KEY=any_value` dans l'exemple prod | `.env.prod.example:23` |
| F10 | Faible | Docker | devDependencies dans l'image runtime | `apps/api/Dockerfile:43` |
| F11 | Faible | Docker | Images `latest`/`stable` non épinglées | `docker-compose.prod.yml:34` |
| F12 | Faible | Nommage | Restes « aerodirectory » (packages, images, bucket, DB) | `package.json:2` |
| F13 | Faible | Qualité | Code mort, soft-delete inutilisé, HTML mail non échappé | divers |
| P4-P7 | Faible | Perf | Planner scan complet, index manquants, guard sans cache, bundles non mesurés | divers |

---

## 7. Verdict et plan

**Non prêt pour la production.** Ce qui bloque, dans l'ordre de traitement recommandé pour la Phase 2 :

1. **C1** — rétablir le login TOTP (cookie partiel), ajouter `totp/disable` + codes de récupération, test d'intégration du flux.
2. **E2** — `trustProxy: 1` + test d'IP.
3. **E1** — `tokenVersion` sur `User`, invalidation sur changement/reset de mot de passe, logout, ban ; contrôle dans le guard et le refresh ; tests.
4. **E5 / E4** — routes `corrections/:id/approve|reject`, `comments/:id/approve|reject` acceptant `PENDING`, équivalent événements ; tests.
5. **E3** — signalement sans retrait immédiat (seuil ou décision admin) ; test.
6. **E6** — `clamd` + `INSTREAM` + sémaphore ; test avec le fichier EICAR.
7. **E7 / M9** — réordonner build → scan → push, `IMAGE_TAG=<sha>`, service `migrate` one-shot.
8. **T1** — harnais d'intégration (Postgres de test) livré avec les correctifs ci-dessus.

Les points Moyens à traiter avant ouverture publique (mais non bloquants pour une bêta fermée) : M1, M2, M3, M4, M5, M7, M11, M15, M16, M18, P1, P2. Le reste peut suivre au fil de l'eau.

Estimation Phase 2 (Critique + Élevé, avec tests) : une branche `fix/audit-phase-2`, 8 commits thématiques, en modifiant principalement `auth.*`, `admin.controller.ts`, `comment.service.ts`, `scan.service.ts`, `main.ts`, le workflow et le compose, plus une migration Prisma (`tokenVersion`).
