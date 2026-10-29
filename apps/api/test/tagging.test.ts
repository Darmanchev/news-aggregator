import { describe, expect, it } from 'vitest';
import { assignTags } from '../src/modules/tagging/tagging.service.js';

describe('Bulgarian headline tagging', () => {
  it('assigns specific IPTC subjects and their ancestors for new topics', () => {
    expect(assignTags('Киберсигурност и изкуствен интелект')).toEqual(expect.arrayContaining(['medtop:13000000']));
    expect(assignTags('Избори за парламент')).toEqual(expect.arrayContaining(['medtop:11000000', 'medtop:20000574']));
  });
  it('maps publisher RSS categories to controlled topics without creating arbitrary tags', () => {
    expect(assignTags('', ['Technology', 'SPORTS', 'Политика', 'unknown-source-tag'])).toEqual(expect.arrayContaining(['medtop:13000000', 'medtop:15000000', 'medtop:11000000']));
    expect(assignTags('', ['unknown-source-tag'])).toEqual([]);
  });
  it.each([
    ['Столичната община ремонтира улици', ['sofia']],
    ['Изборите ще бъдат през юни', ['politics']],
    ['Парламентът прие нов закон', ['politics']],
    ['Дебат в парламента за новия закон', ['politics']],
    ['Правителството подаде оставка', ['politics']],
    ['Министърът представи новия план', ['politics']],
    ['Среща с министъра утре', ['politics']],
    ['Министрите обсъдиха предложението', ['politics']],
    ['Назначени са нови министри', ['politics']],
    ['Президентът свика среща', ['politics']],
    ['Разговор с президента за предложението', ['politics']],
    ['Министерският съвет одобри промени', ['politics']],
    ['Заседание на Министерски съвет', ['politics']],
    ['Протест пред Министерския съвет', ['politics']],
    ['Икономиката расте по-бавно', ['economy']],
    ['Инфлацията се забавя през март', ['economy']],
    ['Бюджетът предвижда повече разходи', ['economy']],
    ['Промени в бюджета за следващата година', ['economy']],
    ['Бизнесът настоява за реформи', ['economy']],
    ['Помощ за бизнеса след наводненията', ['economy']],
    ['Подготовка за еврозоната', ['economy']],
    ['Европейският съюз обяви нови мерки', ['world']],
    ['Преговори с Европейския съюз', ['world']],
    ['Футболът се завръща на стадиона', ['sport']],
    ['Нови правила във футбола', ['sport']],
    ['Тенисът привлича повече деца', ['sport']],
    ['Промени в тениса', ['sport']],
    ['Баскетболът с нов формат', ['sport']],
    ['Нови правила в баскетбола', ['sport']],
    ['Волейболът с рекордна публика', ['sport']],
    ['Промени във волейбола', ['sport']],
    ['Световното първенство започва утре', ['sport']],
    ['Подготовка за световно първенство', ['sport']],
    ['Театърът представя нов спектакъл', ['culture']],
    ['Ремонт в театъра', ['culture']],
    ['Театрите отварят врати за публика', ['culture']],
    ['Нови театри отварят врати', ['culture']],
    ['Киното отбелязва своя празник', ['culture']],
    ['Концертът започва тази вечер', ['culture']],
    ['Билети за концерта вече се продават', ['culture']],
    ['Концертите на открито започват утре', ['culture']],
    ['Концерти на открито през уикенда', ['culture']],
    ['Фестивалът открива новото си издание', ['culture']],
    ['Програмата на фестивала е готова', ['culture']],
    ['Фестивалите привличат нова публика', ['culture']],
    ['Нови фестивали през лятото', ['culture']],
    ['Изложбата показва непознати картини', ['culture']],
    ['Нови изложби през есента', ['culture']],
    ['Изложбите остават отворени до неделя', ['culture']],
  ])('assigns the topic for %s', (headline, expected) => {
    expect(assignTags(headline).filter((id) => !id.startsWith('medtop:'))).toEqual(expected);
  });

  it('normalizes case and phrase whitespace while keeping distinct topics', () => {
    expect(assignTags('МИНИСТЕРСКИЯТ\n  СЪВЕТ обсъди БЮДЖЕТА в СОФИЯ.').filter((id) => !id.startsWith('medtop:'))).toEqual(['sofia', 'politics', 'economy']);
  });

  it('returns the same ordered, distinct topics across repeated calls', () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(assignTags('София, София: избори и бюджет').filter((id) => !id.startsWith('medtop:'))).toEqual(['sofia', 'politics', 'economy']);
      expect(assignTags('Без съвпадение')).toEqual([]);
    }
  });

  it.each([
    'Софиански коментира събитията',
    'Суперконцертът ще започне утре',
    'Кинокритикът представи новата си книга',
    'Предизборите започват утре',
    'Икономиката2 и 2изборите са тестови имена',
    'Нов съвет за участниците в първенството',
    'Световната премиера на книгата е утре',
  ])('does not infer a topic from substrings or ambiguous words: %s', (headline) => {
    expect(assignTags(headline)).toEqual([]);
  });
});
