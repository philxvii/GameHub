# Règles Realtime Database

Règles de sécurité de la base partagée par les jeux, et leurs tests.

- `build-rules.js` génère les fichiers de règles ; ne pas les modifier à la main.
- `tests/` : tests des règles et des vrais clients, exécutés dans les émulateurs
  Firebase, sans toucher à la production.

## Tester

Java 11+ requis (les émulateurs sont des JAR).

```bash
cd firebase && npm install
npm test
```
