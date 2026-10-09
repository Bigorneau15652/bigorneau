---
toc: true
toc-depth: 2
---
Cette note sert de contrôle visuel pour l'export (voir le fichier CLAUDE.md à la racine du dépôt). Copiez-la dans votre coffre Obsidian pour ouvrir l'aperçu de l'export. Elle contient volontairement des mots longs comme anticonstitutionnellement ou électroencéphalographiquement, des listes, une citation, un tableau, des formules, des médias, deux notes de bas de page, un titre masqué et un sujet flottant, qui ne doivent pas apparaître dans l'export. Elle a une table des matières (propriété toc), un tableau légendé, une figure légendée et des renvois : placez une image nommée plan-masse.png dans votre coffre pour voir la figure, sinon l export la signale comme introuvable. Pour tester la pagination, dupliquez plusieurs fois le chapitre Contexte : les en-têtes courants, les notes et les coupures de pages se répartissent alors sur plusieurs pages.

# Contexte
Le bâtiment a été construit en 1972, *l'office* de tourisme et la *difficile* rénovation de l'*affiche* en témoignent. Sa consommation d'énergie finale est aujourd'hui supérieure à 180 kWh/m².an, soit **près du double** de l'objectif fixé par le décret tertiaire pour 2030[^dec]. Les résultats détaillés figurent dans [[Audit énergétique#Résultats|le rapport d'audit]]^[Rapport établi par un bureau d'études indépendant, version de l'année précédente.].

Le campus a été construit par tranches successives entre 1968 et 1985. Les bâtiments les plus anciens reposent sur une ossature en béton armé avec remplissage en briques creuses, sans isolation rapportée, alors que les extensions plus récentes comportent une isolation par l'intérieur de quelques centimètres seulement. Les menuiseries d'origine, en aluminium sans rupture de pont thermique, équipent encore une large part des façades et les toitures-terrasses n'ont été reprises que ponctuellement après des infiltrations.

La production de chaleur repose sur une chaufferie collective au gaz de ville, dont les deux chaudières datent de 1994 et dont le rendement saisonnier réel, mesuré sur trois hivers, est inférieur de près de vingt points à celui annoncé par le constructeur. La régulation s'appuie sur une loi d'eau unique pour l'ensemble du réseau, ce qui conduit à surchauffer les locaux orientés au sud pendant les journées ensoleillées de février et de mars, alors que les salles du rez-de-chaussée côté nord restent en dessous de la température de consigne le lundi matin.

Les usages ne sont pas homogènes : les amphithéâtres ne sont occupés que quelques heures par semaine mais restent chauffés en permanence, les bureaux administratifs sont occupés de huit heures à dix-huit heures, tandis que la bibliothèque universitaire accueille du public jusque tard le soir et pendant une partie du week-end en période d'examens. Cette diversité complique la définition d'un scénario d'occupation unique et justifie une analyse bâtiment par bâtiment, appuyée sur un plan de comptage fiable plutôt que sur des ratios moyens.

Plusieurs leviers ont été identifiés avant toute décision de travaux lourds. Le premier concerne la gestion : abaissement des consignes de chauffage en période d'inoccupation, ralentissement de la ventilation hors des plages d'ouverture et réglage des courbes de chauffe par zone. Le deuxième porte sur l'enveloppe : isolation des toitures-terrasses, traitement des ponts thermiques les plus pénalisants et remplacement progressif des menuiseries, en commençant par les façades les plus exposées au vent dominant. Le troisième concerne les équipements : remplacement des chaudières par un système moins carboné, pilotage par une gestion technique du bâtiment et installation de sous-compteurs sur les départs principaux.

Il reste à arbitrer entre ces leviers en fonction de leur coût, de leur gain attendu et des financements mobilisables, ce qui suppose de disposer d'une simulation thermique dynamique calée sur les consommations mesurées. Les résultats détaillés de cette démarche figurent dans le chapitre suivant ; ils servent aussi à vérifier, une fois les travaux réalisés, que les économies annoncées sont bien constatées dans les factures.

Voir le chapitre [[#Résultats]], le [[#^conso]] et la [[#^plan]].

Voir aussi le site de l'[Université de Montpellier Paul-Valéry](https://www.univ-montp3.fr) ou https://exemple.fr/audit pour la ***méthode complète***.

## Constats
- Isolation des murs
  - laine de roche en 60 mm
  - aucun traitement des ponts thermiques
- Remplacement des menuiseries
- Régulation du chauffage

> L'objectif est de passer sous 90 kWh/m².an d'ici 2030, quelle que soit la trajectoire retenue.

## Hypothèses retenues
%% mmw {"hidden":true} %%
Ce chapitre est masqué : il ne doit pas apparaître dans l'export.

## Calculs
L'intensité énergétique se calcule par $E_s = \frac{Q}{S}$, avec $Q$ la consommation annuelle en kWh et $S$ la surface en m². Pour plusieurs bâtiments, la somme pondérée s'écrit :

$$E_{moy} = \frac{\sum_{i=1}^{n} E_i \, S_i}{\sum_{i=1}^{n} S_i}$$

## Médias
![Visite virtuelle du campus](https://www.youtube.com/watch?v=abcdefghijk)

<iframe width="560" height="315" src="https://player.vimeo.com/video/123456789" title="Présentation du projet"></iframe>

![[interview-gestionnaire.mp3|Interview du gestionnaire]]

# Résultats
1. Chauffage
2. Éclairage
   1. Passage en LED
   2. Détecteurs de présence
3. Ventilation

Tableau : Consommations avant et après travaux

| Poste | Avant (kWh) | Après (kWh) |
| :-- | --: | --: |
| Chauffage | 120 | 60 |
| Éclairage | 25 | 10 |

^conso

![[plan-masse.png|Plan de masse du site]] ^plan

[^dec]: Le décret tertiaire fixe des objectifs de réduction de la consommation d'énergie finale pour 2030, 2040 et 2050, par rapport à une année de référence choisie par l'exploitant. Cette note est volontairement assez longue pour tenir sur plusieurs lignes en bas de page.

%% mmw-float {"x":120,"y":40} %%
## Idée en vrac
Ce sujet flottant ne doit pas apparaître dans l'export.
