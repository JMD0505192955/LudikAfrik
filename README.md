# Ludikafrik — pile complète

Plateforme de jeux mobiles pour l'Afrique de l'Ouest. Portail HTML/JS sans
framework, API Node/Express, base PostgreSQL 16, le tout en conteneurs Docker.
Conçue pour cohabiter avec AfriKfables sur le même serveur.

## Pour déployer

Lisez **DEPLOIEMENT.md** — guide pas à pas, pensé pour non-développeur.

## Structure

    docker-compose.yml     les trois services (web, api, base)
    env.exemple            modèle des secrets → à copier en .env
    DEPLOIEMENT.md         le guide d'installation
    api/                   l'API Node/Express
      src/serveur.js       point d'entrée
      src/lib/             bd, auth, inscription
      src/routes/          inscription, scores/classement
      sql/                 migrations (001 schéma, 002 inscription)
      scripts/migrer.js    applique les migrations
    web/                   nginx qui sert le portail et relaie /api
    portail/               les 40 jeux + l'accueil (index.html, accueil.html)

## État

- Portail : fonctionnel, autonome (40 jeux, accueil clair).
- API : inscription par SMS (simulée tant qu'aucune passerelle),
  scores et classement hebdomadaire.
- À venir : back office, branchement portail↔API, passerelle SMS.
