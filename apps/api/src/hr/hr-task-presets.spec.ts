import { defaultTaskPresets } from './hr-task-presets';

describe('defaultTaskPresets', () => {
  it('propose uniquement des tâches logistiques au magasinier', () => {
    const presets = defaultTaskPresets('Magasinier', 'Achats & Logistique');

    expect(presets.map((preset) => preset.title)).toEqual([
      'Réceptionner et contrôler une livraison',
      'Ranger et organiser le magasin',
      'Réaliser un contrôle de stock',
    ]);
    expect(presets.some((preset) => preset.requiresTechnicalSheet)).toBe(false);
  });

  it('ne transforme pas un magasinier de cuisine centrale en producteur', () => {
    const presets = defaultTaskPresets('Magasinier', 'Cuisine centrale');

    expect(presets.every((preset) => preset.category === 'LOGISTICS')).toBe(true);
    expect(presets.some((preset) => preset.requiresTechnicalSheet)).toBe(false);
  });

  it('autorise les fiches techniques pour les métiers de cuisine et de bar', () => {
    expect(defaultTaskPresets('Cuisinier', 'Cuisine').some((preset) => preset.requiresTechnicalSheet)).toBe(true);
    expect(defaultTaskPresets('Barman', 'Restaurant & Bar').some((preset) => preset.requiresTechnicalSheet)).toBe(true);
    expect(defaultTaskPresets('Barista', 'Café').some((preset) => preset.requiresTechnicalSheet)).toBe(true);
  });

  it('masque les fiches techniques pour les métiers de service', () => {
    expect(defaultTaskPresets('Chef de salle', 'Restaurant & Bar').some((preset) => preset.requiresTechnicalSheet)).toBe(false);
    expect(defaultTaskPresets('Serveur de bar', 'Restaurant & Bar').some((preset) => preset.requiresTechnicalSheet)).toBe(false);
  });
});
