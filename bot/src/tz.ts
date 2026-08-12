// Force le fuseau horaire du process bot sur l'heure de Paris. Railway tourne en
// UTC par défaut ; sans ça, toute logique reposant sur l'heure locale du serveur
// (récap quotidien, fenêtre de roll call, jour de la semaine…) serait décalée.
// Importé EN PREMIER dans index.ts pour s'appliquer avant toute construction de Date.
// À doubler côté hébergeur par la variable d'environnement TZ=Europe/Paris (garanti).
process.env.TZ = process.env.TZ || "Europe/Paris";
