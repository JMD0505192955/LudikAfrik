# Déployer Ludikafrik sur le VPS LWS — guide pas à pas

Ce guide s'adresse à quelqu'un qui **n'est pas développeur**. Chaque commande
est à copier-coller, une par une. Après chaque étape, il est écrit **ce que
vous devez voir** — si vous voyez autre chose, arrêtez-vous et notez le message.

Ludikafrik s'installe **à côté d'AfriKfables**, sur le même serveur, sans y toucher.

---

## Avant de commencer — ce qu'il vous faut

- L'accès SSH à votre VPS LWS (le même que pour AfriKfables).
- Le domaine **ludikafrik.com** pointé vers l'IP du serveur (réservé chez LWS).
- Le dossier `pile/` de ce paquet, transféré sur le serveur.

**Repère essentiel** : si votre ligne de commande commence par `PS C:\` ou
`C:\Users`, vous êtes sur **votre ordinateur**. Si elle commence par `root@`,
vous êtes sur **le serveur**. Beaucoup d'erreurs viennent d'une commande serveur
tapée sur son propre PC. Les commandes ci-dessous sont **toutes** à faire sur le
serveur (après connexion SSH), sauf indication contraire.

---

## Étape 1 — Se connecter au serveur

Sur votre ordinateur (Windows : ouvrez « PowerShell ») :

```
ssh root@VOTRE_IP_SERVEUR
```

Remplacez `VOTRE_IP_SERVEUR` par l'adresse de votre VPS. Tapez le mot de passe.

**Vous devez voir** : la ligne devient `root@…:~#`. Vous êtes sur le serveur.

---

## Étape 2 — Déposer le dossier

Deux façons. La plus simple pour vous : transférer avec un logiciel comme
**WinSCP** (Windows) ou **Cyberduck** (Mac), qui se connectent en SSH et
laissent glisser-déposer les dossiers.

Déposez le dossier `pile/` dans `/opt/ludikafrik/`.
Vous devez obtenir cette arborescence sur le serveur :

```
/opt/ludikafrik/
  ├── docker-compose.yml
  ├── env.exemple
  ├── api/
  ├── web/
  └── portail/
```

**Vérifiez le chemin** (piège classique — le transfert aplatit parfois les dossiers) :

```
ls /opt/ludikafrik
```

**Vous devez voir** : `api  docker-compose.yml  env.exemple  portail  web`

---

## Étape 3 — Créer le fichier de secrets

Placez-vous dans le dossier :

```
cd /opt/ludikafrik
```

Copiez le modèle :

```
cp env.exemple .env
```

Générez deux secrets (lancez la commande **deux fois**, gardez les deux résultats) :

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Vous devez voir** : une longue suite de lettres et chiffres à chaque fois.

Ouvrez le fichier `.env` pour y coller les secrets :

```
nano .env
```

Remplacez :
- `JWT_SECRET=` par le **premier** secret généré ;
- `OTP_SEL=` par le **deuxième** ;
- `PGPASSWORD=` par un mot de passe de votre choix (lettres et chiffres, sans espace).

Enregistrez dans nano : `Ctrl+O`, `Entrée`, puis `Ctrl+X`.

---

## Étape 4 — Démarrer les services

```
docker compose up -d --build
```

Cela construit et lance les trois conteneurs. La première fois prend quelques
minutes (téléchargement des images).

**Vous devez voir**, à la fin : trois lignes `Started` pour `ludik-base`,
`ludik-api`, `ludik-web`.

Vérifiez qu'ils tournent :

```
docker compose ps
```

**Vous devez voir** : les trois services avec le statut `running` ou `Up`.

---

## Étape 5 — Créer les tables

```
docker compose exec api node scripts/migrer.js
```

**Vous devez voir** : `001_schema.sql … ok`, `002_inscription.sql … ok`,
puis `Migrations terminées.`

Si vous voyez `ÉCHEC`, notez le message et arrêtez-vous.

---

## Étape 6 — Vérifier que l'API répond

```
curl http://127.0.0.1:8090/api/sante
```

**Vous devez voir** : `{"ok":true,"service":"ludikafrik-api",...}`

Si oui, l'API et la base fonctionnent ensemble. 🎉

---


## Étape 6 bis — Créer le premier administrateur

Le back office a besoin d'un compte administrateur. On le crée une seule fois,
via une clé temporaire (celle que vous avez mise dans `.env`, `ADMIN_CLE_INIT`).

Remplacez le mot de passe et l'e-mail par les vôtres, puis lancez :

```
curl -X POST http://127.0.0.1:8090/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"nom":"Votre Nom","courriel":"admin@ludikafrik.com","motdepasse":"unMotDePasseSolide","cle":"LA_CLE_DE_VOTRE_ENV"}'
```

**Vous devez voir** : `{"ok":true,"message":"Administrateur créé..."}`

Par sécurité, une fois le compte créé, **retirez `ADMIN_CLE_INIT` du `.env`**
(ou laissez : la route refuse de toute façon un second admin).

Le back office est ensuite accessible sur **https://ludikafrik.com/admin/**.

## Étape 7 — Brancher le domaine et le HTTPS

Ludikafrik écoute en local sur le port **8090**. Le nginx **système** (celui qui
gère déjà AfriKfables) doit aiguiller `ludikafrik.com` vers ce port.

Créez le fichier de site :

```
nano /etc/nginx/sites-available/ludikafrik.com
```

Collez ceci (adaptez seulement le nom de domaine si besoin) :

```
server {
  server_name ludikafrik.com www.ludikafrik.com;
  location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enregistrez (`Ctrl+O`, `Entrée`, `Ctrl+X`). Activez le site :

```
ln -s /etc/nginx/sites-available/ludikafrik.com /etc/nginx/sites-enabled/
nginx -t
```

**Vous devez voir** : `syntax is ok` et `test is successful`.

```
systemctl reload nginx
```

Ajoutez le certificat HTTPS gratuit (Let's Encrypt) :

```
certbot --nginx -d ludikafrik.com -d www.ludikafrik.com
```

Suivez les questions (adresse e-mail, accepter les conditions, choisir la
redirection HTTPS). **Vous devez voir** : `Congratulations!`

---

## C'est en ligne

Ouvrez **https://ludikafrik.com** dans un navigateur — en **navigation privée**
(le navigateur garde tout en cache, un rafraîchissement normal ne suffit pas).

Vous devez voir l'accueil Ludikafrik.

---

## Mettre à jour plus tard

Quand une nouvelle version du code est prête :

```
cd /opt/ludikafrik
docker compose build api
docker compose up -d
docker compose restart web
```

---

## Les pièges à connaître (vécus sur AfriKfables)

- **Le port 80 déjà pris.** Ludikafrik écoute sur 8090 justement pour cohabiter.
  Si un conteneur reste bloqué sur « Starting », vérifiez qu'aucun autre service
  n'occupe le port 8090 : `docker compose logs web`.
- **403 sur des fichiers.** Après un transfert par WinSCP, les droits de lecture
  peuvent manquer. Sur le serveur : `chmod -R a+r /opt/ludikafrik/portail`.
- **Le cache du navigateur.** Toujours tester en navigation privée après une mise
  à jour.
- **La session SSH se coupe.** Si la ligne repasse à `PS C:\`, reconnectez-vous
  (étape 1) avant de continuer.
- **PowerShell n'aime pas `&&`.** Sur Windows, tapez les commandes une par une.

---

## Ce qui reste à faire (hors de ce guide)

- **La passerelle SMS** : les codes d'inscription sont simulés (ils s'affichent à
  l'écran, mention « démo ») tant qu'un opérateur n'a pas fourni ses accès. Une
  seule fonction à remplacer le jour venu — voir `api/src/lib/inscription.js`,
  fonction `envoyerSMS`.
- **Les sauvegardes** : prévoir une copie régulière de la base vers l'extérieur
  dès qu'il y a de vrais joueurs. `docker compose exec base pg_dump …`
- **Le back office** (administration des jeux, des lots, des abonnés) : à ajouter.
- **Le branchement du portail sur l'API** : aujourd'hui le portail fonctionne en
  autonomie (scores et comptes locaux au navigateur). Pour utiliser l'API réelle
  (inscription serveur, classement partagé), il faut connecter les appels — je
  peux le faire quand la pile tourne chez vous.
