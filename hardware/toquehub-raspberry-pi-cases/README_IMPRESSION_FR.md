# Boîtiers ToqueHub pour Raspberry Pi 4 et Raspberry Pi 5

Ce dossier contient deux boîtiers distincts, adaptés au **Raspberry Pi 4 Model B** et au **Raspberry Pi 5**. Chaque boîtier est composé d'une base et d'un capot vissé. Le pictogramme ToqueHub, le nom **TOQUEHUB** et la version de la carte sont imprimés en relief sur le capot.

## Fichiers à imprimer

### Raspberry Pi 4 Model B

- `STL/Raspberry_Pi_4/ToqueHub_RPi4_Base.stl`
- `STL/Raspberry_Pi_4/ToqueHub_RPi4_Capot.stl`

### Raspberry Pi 5

- `STL/Raspberry_Pi_5/ToqueHub_RPi5_Base.stl`
- `STL/Raspberry_Pi_5/ToqueHub_RPi5_Capot.stl`

Les fichiers sont en millimètres et les maillages STL sont fermés et étanches.

## Caractéristiques

- Encombrement extérieur assemblé : **100 × 71 × 30,4 mm**.
- Carte sur quatre entretoises correspondant à l'entraxe officiel **58 × 49 mm**.
- Ouvertures séparées pour alimentation, micro-HDMI, USB, Ethernet et micro-SD.
- Ouverture dédiée au bouton d'alimentation sur la version Pi 5.
- Ouvertures supérieures et arrière pour la circulation de l'air.
- Angles supérieurs des ouvertures chanfreinés à 45° pour limiter les ponts et permettre une impression sans support.
- Capot fixé par quatre vis, avec logements de tête encastrés.

Ce modèle est prévu comme boîtier fermé pour un serveur ToqueHub. Il n'a pas d'ouverture supérieure pour un HAT ou une nappe GPIO/CSI/DSI. Le refroidisseur actif officiel du Pi 5 tient sous le capot ; son utilisation est fortement recommandée pour un Pi 5 soumis à une charge durable.

## Visserie

- 4 × vis **M2.5 × 6 mm** pour fixer la carte sur les entretoises.
- 4 × vis **M3 × 10 mm**, tête de diamètre maximal 6,4 mm, pour fixer le capot.

Les trous sont dimensionnés comme avant-trous pour un vissage direct dans du PETG ou du PLA. Visser progressivement et sans forcer afin de ne pas fendre les plots.

## Réglages d'impression conseillés

- Matière : **PETG recommandé** ; PLA acceptable pour un prototype ou un environnement frais.
- Buse : 0,4 mm.
- Hauteur de couche : 0,20 mm.
- Parois : 3 à 4 périmètres.
- Dessus/dessous : 5 couches au minimum.
- Remplissage : 20 à 30 %.
- Supports : aucun.
- Bordure : facultative, utile si l'adhérence du plateau est faible.

Orientation :

- imprimer la **base avec son fond posé sur le plateau** ;
- imprimer le **capot à plat, face intérieure contre le plateau et logo vers le haut**.

## Montage

1. Ébarber légèrement les ouvertures et vérifier les quatre avant-trous M2.5.
2. Poser le Raspberry Pi sur les quatre entretoises, connecteurs en face des ouvertures.
3. Fixer la carte avec les quatre vis M2.5 × 6 mm.
4. Sur le Pi 5, monter et brancher le refroidisseur actif avant de fermer le boîtier.
5. Poser le capot en alignant les quatre trous.
6. Fixer le capot avec les quatre vis M3 × 10 mm, sans serrage excessif.
7. Vérifier l'insertion des câbles et de la carte micro-SD avant une utilisation continue.

## Vérification recommandée avant la série

Les dimensions suivent les dessins mécaniques officiels Raspberry Pi, mais les connecteurs, câbles et tolérances d'impression peuvent varier. Imprimer d'abord un exemplaire de validation. Si nécessaire, modifier les paramètres situés en tête de `source/generate_cases.py`, puis régénérer les STL.

## Régénérer les STL

Depuis ce dossier :

```bash
python3 -m venv .venv
.venv/bin/pip install -r source/requirements.txt
.venv/bin/python source/generate_cases.py
```

Les nouveaux fichiers seront créés dans `STL/Raspberry_Pi_4` et `STL/Raspberry_Pi_5`.

## Références mécaniques

- [Documentation matérielle Raspberry Pi](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#schematics-and-mechanical-drawings)
- [Dessin mécanique officiel Raspberry Pi 4 Model B](https://pip.raspberrypi.com/documents/RP-008343-DS)
- [Dessin mécanique officiel Raspberry Pi 5](https://pip.raspberrypi.com/documents/RP-008347-DS)
