# Rapport de test - cuisine centrale publique 2026

Date du test : 2026-06-30

Sources lues :

- document local de planning (non versionné)
- document local d'organisation de cuisine (non versionné)

Organisation de test creee en base locale :

- Nom : Cuisine centrale publique - test 2026
- Code : PUBLIC-KITCHEN-TEST-2026
- Type : Cuisine centrale
- Pays / secteur : France / Public
- Regime agent : Fonction publique territoriale

## Resultat d'import

L'import a ete fait dans une organisation separee afin de ne pas modifier l'organisation existante `The French Cafe`.

| Element                        | Volume importe |
| ------------------------------ | -------------: |
| Organisations de test          |              1 |
| Utilisateurs de test           |              1 |
| Sites                          |              2 |
| Services RH                    |              5 |
| Postes                         |              9 |
| Collaborateurs                 |             31 |
| Profils legaux collaborateurs  |             31 |
| Droits catalogue RH            |              9 |
| Regles de droits actives       |              9 |
| Droits collaborateurs          |            181 |
| Comptes de temps / soldes      |            181 |
| Dictionnaire de codes planning |             67 |
| Affectations planning          |           1250 |
| Statuts/commentaires jour      |            219 |
| Profil politique planning      |              1 |

Le planning contient 52 feuilles hebdomadaires. Les creneaux horaires exploitables importes couvrent la periode du 29 decembre 2025 au 25 juin 2026. Les semaines suivantes existent dans le classeur, mais ne contiennent pas de couples arrivee/depart suffisamment renseignes pour creer des affectations horaires.

## Organisation metier

Les services ont ete normalises en libelles metiers, sans exposer de noms techniques :

| Service              | Collaborateurs |
| -------------------- | -------------: |
| Cuisine centrale     |              7 |
| Entretien des locaux |              1 |
| Logistique           |              1 |
| Restauration         |             14 |
| Satellites           |              8 |

Les situations ont ete transformees en postes lisibles :

| Poste                                | Collaborateurs |
| ------------------------------------ | -------------: |
| Contractuel                          |              1 |
| Contractuel a temps complet          |              2 |
| Poste non renseigne                  |              2 |
| Stagiaire                            |              3 |
| Temps complet                        |             12 |
| Temps partiel 80 % (4 jours/semaine) |              2 |
| Titulaire                            |              2 |
| Titulaire a 80 % (4 jours/semaine)   |              1 |
| Titulaire a temps complet            |              6 |

Exemple controle : `DAVINA HACAN (FORSANS)` est bien importee en service `Restauration`, poste `Titulaire a temps complet`, contrat `Titulaire`, duree hebdomadaire `2175 minutes` soit 36 h 15, taux horaire de test `15,50 EUR`, revalorisation annuelle, responsable direct `BERENGER MARECHAL`.

## Droits et soldes

Les droits ont ete crees avec des libelles metiers. Les codes internes restent uniquement techniques en base.

| Droit                      | Collaborateurs concernes | Source                           |
| -------------------------- | -----------------------: | -------------------------------- |
| Conges statutaires         |                       29 | Solde global du classeur         |
| Conges annuels             |                       29 | Ligne CONGES ANNUELS             |
| RTT libres                 |                       28 | Ligne RTT LIBRES                 |
| Conges fractionnement      |                       28 | Ligne CONGES FRACTIONNEMENT      |
| Conges d'anciennete        |                       26 | Ligne CONGES D'ANCIENNETE        |
| RQTH                       |                        2 | Occurrences explicites RQTH      |
| Heures administratives     |                       29 | Ligne HEURES ADM.                |
| Autres conges              |                        3 | Ligne AUTRES CONGES              |
| Heures dues / recuperation |                        7 | Ligne heures dues / recuperation |

Les droits relies a la base legale existante :

- `Conges annuels` et `Conges statutaires` sont relies a `CA_PUBLIC`.
- `Conges fractionnement` est relie a `CA_FRACTIONNEMENT_PUBLIC`.
- `RTT libres` est relie a `RTT_PUBLIC`, mais la source seedee est nommee `RTT FPH`, alors que l'organisation de test est parametree en FPT. A valider juridiquement avant usage reel.

Les droits crees comme regles locales a valider :

- `Conges d'anciennete`
- `RQTH`
- `Heures administratives`
- `Autres conges`
- `Heures dues / recuperation`

## Planning

Les affectations ont ete creees quand le document contenait une arrivee et un depart numeriques. Exemple controle local : le 29 decembre 2025, `DAVINA HACAN (FORSANS)` a une affectation 07:15 - 15:15 avec 45 minutes de pause.

Les mentions telles que `ARRET`, `ABS`, `CP`, `RECUP`, `HV`, `FORMAT CNFPT`, `COS`, `ENFANT MALADE`, `GREVE` ont ete conservees comme statuts/commentaires jour et ajoutees au dictionnaire de codes planning. Elles n'ont pas ete converties automatiquement en absences RH validees, car le classeur ne donne pas toujours une categorie unique et juridiquement sure.

Top des mentions importees :

- ARRET : 30
- ABS : 22
- 1 HV : 14
- FORMAT CNFPT : 13
- CP : 12
- 1,5 RECUP : 10

## Hypotheses ajoutees pour le test

Ces informations ne viennent pas directement des classeurs. Elles ont ete ajoutees pour tester l'application plus completement :

- Responsable direct : `BERENGER MARECHAL` a ete utilise comme responsable direct de reference pour les autres agents.
- Taux horaires moyens : valeurs de test selon service/statut, par exemple 15,50 EUR pour un titulaire temps complet en restauration, 16,50 EUR pour cuisine centrale, 19,50 EUR pour chef/responsable.
- Frequence de revalorisation : annuelle, prochaine revue au 1er janvier 2027.
- Duree hebdomadaire : 36 h 15 pour temps complet, 29 h pour 80 %.
- Profil planning : reference annuelle 1817 h 15, jour type 7 h 15, pause par defaut 45 minutes.

## Informations non renseignees ou limitees

1. Le classeur contient des soldes en jours decimaux et en heures. L'application stocke les soldes de compteurs en entier. Pour ne pas perdre les quarts d'heure, les soldes ont ete importes en minutes, avec les jours/heures d'origine conserves en metadonnees. L'interface devra idealement afficher ces droits en jours + heures pour rester naturelle.

2. Le document fournit un solde global `Conges statutaires`, mais pas toujours un solde individuel separe pour chaque droit. Les droits annuels ont ete importes separement, mais la consommation exacte par sous-droit ne peut pas etre reconstruite sans regle supplementaire.

3. `RQTH` est explicite pour `STEPHANIE BOUCHTA` et `Romuald HAUDEBOURG`. Les valeurs laterales `-20` et `6` du classeur ont ete conservees en metadonnees, car leur sens exact n'est pas suffisamment clair pour les convertir automatiquement.

4. `Jade PHAM` est present dans le planning, tandis que le classeur droits contient `NGOC PHAM`. Les deux ont ete importes comme personnes distinctes pour ne pas supposer qu'il s'agit du meme agent.

5. `JEROME VESSIER` est present dans le planning, mais absent du classeur droits. Il a ete cree comme collaborateur planning, sans droits.

6. `Ayse YAVUS` dans le planning a ete rattachee a la fiche `YAVUZ`, car le prenom correspond et le nom ne differe que d'une lettre. Ce rattachement doit etre confirme.

7. Les annees de naissance sont presentes sur certaines fiches, mais l'application attend une date de naissance complete. Elles n'ont pas ete transformees en fausses dates.

8. Les postes sont uniques au niveau organisation. Pour garder des libelles simples comme `Titulaire a temps complet`, ils ont ete crees comme postes generiques. Si l'application veut demain un meme poste rattache a plusieurs services avec le meme nom, il faudra faire evoluer la modelisation.

9. Les absences du planning n'ont pas ete transformees en demandes/validations RH, seulement en statuts jour. Une conversion fiable demanderait un mapping valide entre les codes du classeur et les types RH.

## Conclusion

Le scenario de cuisine centrale publique est exploitable dans la base locale : organisation publique, services, postes, responsables, profils legaux, droits, soldes et planning ont ete importes. Les limites principales ne sont pas bloquantes pour un test, mais elles sont importantes avant une utilisation reelle : affichage des soldes fractionnaires, distinction solde global/sous-droits, validation juridique FPT des RTT/RQTH/anciennete, et mapping propre des absences planning vers le module RH.
