# Diffusions françaises (beIN SPORTS / Prime Video)

Aucune API gratuite ne donne les chaînes match par match. Elles sont dans `diffusions.json`.
Format d'une ligne : ["coup d'envoi en UTC", "équipe", "équipe", "chaîne"] avec chaîne = bein1, bein2 ou prime.
Exemple : ["2026-11-28T22:00Z","WAS","ORL","bein1"]  (= 23h00 à Paris en hiver, 22h00 en UTC ; 1h de moins qu'à Paris, 2h en été).
beIN SPORTS annonce ses matchs environ une semaine à l'avance : ajoute les nouvelles lignes régulièrement.
Sources : agendatv-basket.com, nba.com (liste Prime Video), basketusa.com.
