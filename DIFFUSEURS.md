# La Team Basket — refonte UI et diffuseurs FR

## Changements
- Refonte visuelle de la page d'accueil : grande zone éditoriale, scores en panneau secondaire, fil d'actualité horizontal et colonne latérale.
- Logo, navigation, pages, API BallDontLie / Highlightly et statistiques existantes conservés.
- Ajout d'une colonne « Diffusion FR » au calendrier et d'une zone « Diffusions confirmées » sur l'accueil.
- Les badges de diffusion sont affichés dans le bandeau de scores lorsqu'une rencontre correspond à une programmation confirmée.

## Logique des diffuseurs
Les programmations TV ne sont pas fournies par BallDontLie ou Highlightly. Elles sont donc maintenues dans `BROADCASTS` au début de `app.js`.
Chaque entrée est associée à une date française, une paire d'équipes et une chaîne. La date est indispensable : les franchises peuvent se rencontrer plusieurs fois dans la saison.
Aucune chaîne n'est attribuée par défaut aux autres matchs. Ils affichent « À confirmer » plutôt que d'afficher abusivement beIN SPORTS.

## Sources consultées pour les entrées intégrées
- Basket USA, programme Prime Video 2026/27 : https://www.basketusa.com/news/952020/quels-matchs-nba-seront-diffuses-sur-prime-video-cette-saison/
- Inside Basket, premières affiches Prime Video 2026/27 : https://www.insidebasket.com/actu/nba-sur-prime-video-le-programme-complet-de-la-saison-2026-2027-en-france.html
- Basket USA, programmation beIN / Prime du 8 novembre : https://www.basketusa.com/news/955742/programme-du-soir-sixers-bulls-en-prime-time-lakers-et-celtics-sur-bein-sports/
- Basket USA, programmation beIN / Prime du 15 novembre : https://www.basketusa.com/news/957642/programme-du-soir-les-sixers-defient-les-pacers-des-19h00-sur-prime-video/
- SFR Actus, panorama des droits français 2026/27 : https://actus.sfr.fr/sport/basket/nba-comment-suivre-la-saison-2026-2027_AN-202610200001.html

## À savoir
Le programme complet Prime Video annoncé compte 86 matchs, mais les articles consultés n'exposent pas tous les matchs avec une chaîne individuelle. Le programme beIN SPORTS est également annoncé comme pouvant aller jusqu'à neuf matchs par semaine. Les badges intégrés sont donc limités aux affiches explicitement identifiées dans les sources citées et doivent être complétés au fil des annonces de programmation.
