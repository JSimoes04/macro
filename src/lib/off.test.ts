import { describe, expect, it } from 'vitest';
import { NAME_RULES_VERSION, normalizeProduct, productName } from './off';

// Respostas reais (reduzidas) da API v2 do Open Food Facts.
const nutella = {
  brands: 'Nutella, Ferrero',
  code: '3017620422003',
  image_front_small_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg',
  nutriments: {
    'energy-kcal_100g': 539,
    energy_100g: 2252,
    fat_100g: 30.9,
    'saturated-fat_100g': 10.6,
    carbohydrates_100g: 57.5,
    sugars_100g: 56.3,
    fiber_100g: 0,
    proteins_100g: 6.3,
    salt_100g: 0.107,
  },
  product_name: 'Nutella',
  product_name_pt: '',
  product_quantity: 400,
  product_quantity_unit: 'g',
};

const skyr = {
  brands: 'Mimosa',
  code: '5603722519000',
  nutriments: {
    'energy-kcal_100g': 75,
    proteins_100g: 9.3,
    fat_100g: 0.4,
    carbohydrates_100g: 7.3,
    sugars_100g: 5.2,
  },
  product_name: 'Skyr',
  product_name_pt: 'Skyr Natural',
  product_quantity: 250,
  product_quantity_unit: 'g',
  serving_quantity: 125,
  serving_size: '125 g',
};

const cola = {
  brands: 'COCA-COLA SERVICES SA/NV',
  nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, fat_100g: 0, carbohydrates_100g: 10.6 },
  product_name: 'Coca-Cola Original',
  product_quantity: 330,
  product_quantity_unit: 'ml',
  serving_quantity: 330,
  serving_quantity_unit: 'ml',
  serving_size: '1 portion (330 ml)',
};

describe('productName (português › inglês › língua original)', () => {
  // Campos reais de produtos franceses no Open Food Facts.
  const prince = {
    lang: 'fr',
    product_name: 'Prince',
    product_name_fr: 'Prince',
    product_name_en: 'Prince Goût Chocolat au Blé Complet',
    generic_name: 'BISCUITS FOURRÉS (35%) PARFUM CHOCOLAT',
  };
  const nutellaBiscuits = {
    lang: 'fr',
    product_name: 'Biscuits NUTELLA Biscuits Noisettes et Cacao x22 - 304g',
    product_name_en: 'Nutella B-ready',
    product_name_pt: 'Crocantes bolachas com um coração cremoso de Nutella®',
  };

  it('prefere português', () => {
    expect(productName(nutellaBiscuits)).toBe('Crocantes bolachas com um coração cremoso de Nutella®');
  });

  it('sem português, usa inglês em vez da língua da embalagem', () => {
    expect(productName(prince)).toBe('Prince Goût Chocolat au Blé Complet');
  });

  it('o nome principal conta como português ou inglês se for essa a língua do produto', () => {
    expect(productName({ lang: 'pt', product_name: 'Leite meio-gordo', product_name_en: 'Semi-skimmed milk' })).toBe(
      'Leite meio-gordo',
    );
    expect(productName({ lang: 'en', product_name: 'Peanut butter', product_name_fr: 'Beurre de cacahuète' })).toBe(
      'Peanut butter',
    );
  });

  it('a descrição em português ganha ao nome em francês', () => {
    expect(productName({ lang: 'fr', product_name: 'Petit Écolier', generic_name_pt: 'Bolacha com chocolate de leite' })).toBe(
      'Bolacha com chocolate de leite',
    );
  });

  it('só usa a língua original quando não há mais nada', () => {
    expect(productName({ lang: 'fr', product_name: 'Pomme Noisette', generic_name: 'Biscuits aux pommes' })).toBe('Pomme Noisette');
    expect(productName({ lang: 'fr', generic_name: 'Biscuits aux pommes' })).toBe('Biscuits aux pommes');
    expect(productName({ product_name_pt: '', product_name: '' })).toBeUndefined();
  });

  it('marca a versão das regras nos produtos convertidos', () => {
    expect(normalizeProduct(prince, '7622210449283').nameVersion).toBe(NAME_RULES_VERSION);
  });
});

describe('normalizeProduct', () => {
  it('converte um produto completo', () => {
    const food = normalizeProduct(nutella, '3017620422003');
    expect(food).toMatchObject({
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Nutella',
      unit: 'g',
      packageSize: 400,
      source: 'off',
      per100: { kcal: 539, protein: 6.3, fat: 30.9, carbs: 57.5, sugar: 56.3, fiber: 0, satFat: 10.6, salt: 0.107 },
    });
    expect(food.incomplete).toBeUndefined();
    expect(food.servingSize).toBeUndefined();
    expect(food.imageUrl).toContain('images.openfoodfacts.org');
  });

  it('prefere o nome em português e lê a porção', () => {
    const food = normalizeProduct(skyr, '5603722519000');
    expect(food.name).toBe('Skyr Natural');
    expect(food.servingSize).toBe(125);
    expect(food.servingLabel).toBe('125 g');
  });

  it('deteta bebidas em ml', () => {
    const food = normalizeProduct(cola, '5449000000996');
    expect(food.unit).toBe('ml');
    expect(food.servingSize).toBe(330);
  });

  it('converte valores só por porção para 100 g', () => {
    const food = normalizeProduct(
      {
        product_name: 'Barra',
        serving_quantity: '40',
        nutriments: { 'energy-kcal_serving': 180, proteins_serving: 10, fat_serving: 6, carbohydrates_serving: 20 },
      },
      '12345670',
    );
    expect(food.per100.kcal).toBeCloseTo(450);
    expect(food.per100.protein).toBeCloseTo(25);
    expect(food.per100.fat).toBeCloseTo(15);
    expect(food.per100.carbs).toBeCloseTo(50);
    expect(food.incomplete).toBeUndefined();
  });

  it('calcula kcal a partir de kJ quando faltam as kcal', () => {
    const food = normalizeProduct(
      { product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 1, fat_100g: 1, carbohydrates_100g: 1 } },
      '12345670',
    );
    expect(food.per100.kcal).toBeCloseTo(100);
  });

  it('marca como incompleto quando faltam valores', () => {
    const food = normalizeProduct({ product_name: 'Sem tabela', nutriments: {} }, '5601234567890');
    expect(food.incomplete).toBe(true);
    expect(food.per100).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });

  it('usa um nome de recurso e aceita marcas em lista', () => {
    const food = normalizeProduct({ brands: ['Continente', 'Outra'], nutriments: {} }, '5601234567890');
    expect(food.name).toBe('Produto 5601234567890');
    expect(food.brand).toBe('Continente');
  });
});
