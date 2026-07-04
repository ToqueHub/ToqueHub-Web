# ToqueHub - Workflow de release et mise a jour

Ce document explique comment sauvegarder le code, publier une version stable et rendre une mise a jour visible pour les utilisateurs ToqueHub.

## Idee simple

```text
main = branche de travail / sauvegarde / preparation
tag vX.Y.Z = publication d'une version stable pour les utilisateurs
latest = derniere version stable publiee en Docker
```

`latest` ne recupere pas automatiquement le dernier commit de `main`.

`latest` est mis a jour uniquement quand une release stable est publiee avec un tag Git du type `v1.0.0`.

## Workflow recommande

### 1. Sauvegarder le travail sur main

Quand tu as fini une serie de changements:

```bash
git add .
git commit -m "Prepare version 1.0.0"
git push origin main
```

A ce moment-la:

```text
main est sauvegarde sur GitHub
rien n'est publie pour les utilisateurs
aucune mise a jour n'apparait dans ToqueHub
```

Tu peux pousser plusieurs fois sur `main` sans impacter les utilisateurs.

## 2. Publier une version stable

Quand tu decides que le code de `main` est pret pour les utilisateurs:

```bash
git tag v1.0.0
git push origin v1.0.0
```

A ce moment-la:

```text
GitHub Actions se lance
les images Docker multi-arch sont construites
la release GitHub v1.0.0 est publiee
latest pointe vers v1.0.0
les utilisateurs voient la mise a jour dans ToqueHub
```

Important:

```text
workflow manuel GitHub Actions = peut construire des images de test
tag v1.0.0 = version stable visible comme mise a jour
```

Si les images Docker existent mais qu'aucun tag `vX.Y.Z` ou aucune GitHub Release stable n'existe, l'onglet de mise a jour peut afficher qu'aucune version stable n'est disponible.

Images publiees:

```text
ghcr.io/powarthy/toquehub-api:1.0.0
ghcr.io/powarthy/toquehub-web:1.0.0
ghcr.io/powarthy/toquehub-updater:1.0.0

ghcr.io/powarthy/toquehub-api:latest
ghcr.io/powarthy/toquehub-web:latest
ghcr.io/powarthy/toquehub-updater:latest
```

## Ce que voient les utilisateurs

Dans ToqueHub:

```text
Organisation > General > Version et mise a jour
```

L'application compare:

```text
version installee
derniere release GitHub stable
```

Si `v1.0.0` est plus recente que la version installee, le bouton `Mettre a jour` devient disponible pour les administrateurs.

## Branche stable ou pas ?

Pour l'instant, tu n'as pas besoin d'une branche `stable`.

Le workflow conseille est:

```text
main + tags vX.Y.Z
```

Une branche `stable` deviendra utile plus tard si tu veux maintenir plusieurs lignes de versions, par exemple:

```text
main = developpement actif
stable = derniere version validee
v1.0.3 = release stable publiee
```

Mais pour ToqueHub maintenant, le plus simple et solide est:

```bash
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

## Exemple complet

Preparation:

```bash
git status
git add .
git commit -m "Prepare version 1.0.0"
git push origin main
```

Publication:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Verification:

```bash
git tag --list
git log --oneline --decorate -5
```

Puis verifier sur GitHub:

```text
Actions > Publish Docker images
Releases > v1.0.0
Packages > toquehub-api / toquehub-web / toquehub-updater
```

## Raspberry Pi

Le Raspberry Pi ne doit pas recevoir une nouvelle image SD a chaque petite mise a jour applicative.

Les mises a jour normales passent par Docker:

```text
toquehub-api:1.0.0
toquehub-web:1.0.0
toquehub-updater:1.0.0
```

L'image SD Raspberry sert surtout pour:

- nouvelle installation;
- changement du systeme de premier demarrage;
- changement Docker/systemd;
- changement OS;
- gros changement de structure appliance.

Sur un Raspberry deja installe, la mise a jour normale se fait via:

```bash
toquehub update
```

ou depuis l'interface:

```text
Organisation > General > Version et mise a jour
```

## Regle a retenir

```text
push main = sauvegarde / preparation
push tag vX.Y.Z = publication utilisateurs
```
