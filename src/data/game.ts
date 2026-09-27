import catalogP5 from './catalogP5';
import catalogP4 from './catalogP4';
import { findNameBox } from '../engine/p5/findName';

export const S3_P5 = 'https://testing-s3-p5.s3.amazonaws.com/portraits';
export const S3_P4 = 'https://p4generator.s3.amazonaws.com/portraits';

export type Game = 'P5' | 'P4';

export interface FontOption {
  value: string;
  label: string;
  sub?: string;
}

export const FONTS: Record<Game, FontOption[]> = {
  P5: [
    { value: 'KoreanKRSM', label: 'KoreanKRSM', sub: 'Persona 5' },
    { value: 'Optima Nova LT', label: 'Optima Nova', sub: 'Royal' },
    { value: 'SlumpDB', label: 'Slump DB', sub: '日本語' },
    { value: 'aCinema', label: 'aCinema', sub: '한글어' },
    { value: 'DF Li Yuan', label: 'DF Li Yuan', sub: '中文' },
    { value: 'aGullimHeadB', label: 'aGullimHeadB', sub: '스크램블 한글어' },
    { value: 'DF Ping Ju', label: 'DF Ping Ju', sub: '亂戰中文' },
  ],
  P4: [
    { value: 'SkipStd-B', label: 'Skip', sub: 'Latin / 日本語' },
    { value: 'KoreanHSE', label: 'a한글세상M', sub: '한국어 · Golden' },
  ],
};

export interface BoxOption {
  value: string;
  label: string;
}

export const BOXES: Record<Game, BoxOption[]> = {
  P5: [
    { value: 'main', label: 'Persona 5 / Royal' },
    { value: 'noPortrait', label: 'P5 · No Portrait' },
    { value: 'strikers', label: 'Strikers / Scramble' },
    { value: 'dancing', label: 'Dancing in Starlight' },
  ],
  P4: [
    { value: 'golden', label: 'Persona 4 Golden' },
    { value: 'vanilla', label: 'Persona 4' },
  ],
};

const DISPLAY_NAMES_P5: Record<string, string> = {
  Akane: 'Akane Hasegawa',
  Konoe: 'Akira Konoe',
  Alice: 'Alice Hiiragi',
  Natsume: 'Ango Natsume',
  Ann: 'Ann Takamaki',
  Caroline: 'Caroline',
  Chihaya: 'Chihaya Mifune',
  Hiraguchi: 'Coach Hiraguchi',
  Futaba: 'Futaba Sakura',
  Akechi: 'Goro Akechi',
  Haru: 'Haru Okumura',
  Hifumi: 'Hifumi Togo',
  Ohya: 'Ichiko Ohya',
  Madarame: 'Ichiryusai Madarame',
  Igor: 'Igor',
  Jose: 'Jose',
  Kaneshiro: 'Junya Kaneshiro',
  Owada: 'Jyun Owada',
  Justine: 'Justine',
  Okumura: 'Kunikazu Okumura',
  Ichinose: 'Kuon Ichinose',
  Lavenza: 'Lavenza',
  Makoto: 'Makoto Niijima',
  Mariko: 'Mariko Hyodo',
  Shido: 'Masayoshi Shido',
  Mika: 'Mika',
  Kaburagi: 'Miyako Kaburagi',
  Morgana: 'Morgana',
  Hiruta: 'Mr. Hiruta',
  Inui: 'Mr. Inui',
  Ushimaru: 'Mr. Ushimaru',
  Chouno: 'Ms. Chouno',
  Usami: 'Ms. Usami',
  Iwai: 'Munehisa Iwai',
  Nakanohara: 'Natsuhiko Nakanohara',
  Principal: 'Principal Kobayakawa',
  Joker: 'Protagonist',
  Rumi: 'Rumi',
  Ryuji: 'Ryuji Sakamoto',
  Kawakami: 'Sadayo Kawakami',
  Sae: 'Sae Niijima',
  Shibusawa: 'Shibusawa',
  Shiho: 'Shiho Suzui',
  Shinichi: 'Shinichi Yoshizawa',
  Shinya: 'Shinya Oda',
  Director: 'SIU Director',
  Sojiro: 'Sojiro Sakura',
  Sophia: 'Sophia',
  Sugimura: 'Sugimura',
  Kamoshida: 'Suguru Kamoshida',
  Sumire: 'Sumire Yoshizawa',
  Takemi: 'Tae Takemi',
  Maruki: 'Takuto Maruki',
  Tanaka: 'Tanaka',
  Yoshida: 'Toranosuke Yoshida',
  Wakaba: 'Wakaba Isshiki',
  Yusuke: 'Yusuke Kitagawa',
  Mishima: 'Yuuki Mishima',
  Zenkichi: 'Zenkichi Hasegawa',
};

const DISPLAY_NAMES_P4: Record<string, string> = {
  Ai: 'Ai Ebihara',
  Ayane: 'Ayane Matsunaga',
  Chie: 'Chie Satonaka',
  Chihiro: 'Chihiro Fushimi',
  Daisuke: 'Daisuke Nagase',
  'Mr. Edogawa': 'Mr. Edogawa',
  Eri: 'Eri Minami',
  Fox: 'Fox',
  Hanako: 'Hanako Ohtani',
  Hisano: 'Hisano Kuroda',
  Igor: 'Igor',
  Izanami: 'Izanami',
  Kanji: 'Kanji Tatsumi',
  'Mr. Morooka': 'Kinshiro Morooka',
  Kou: 'Kou Ichijou',
  Margaret: 'Margaret',
  Marie: 'Marie',
  Mayumi: 'Mayumi Yamano',
  Mitsuo: 'Mitsuo Kubo',
  Nanako: 'Nanako Dojima',
  Naoto: 'Naoto Shirogane',
  Naoki: 'Naoki Konishi',
  'Ms. Kashiwagi': 'Noriko Kashiwagi',
  'Old Lady Shiroku': 'Old Lady Shiroku',
  'Old Man Daidara': 'Old Man Daidara',
  Rise: 'Rise Kujikawa',
  Dojima: 'Ryotaro Dojima',
  Saki: 'Saki Konishi',
  Shu: 'Shu Nakajima',
  Tanaka: 'Tanaka',
  Namatame: 'Taro Namatame',
  Teddie: 'Teddie',
  Adachi: 'Tohru Adachi',
  Sayoko: 'Uehara Sayoko',
  Yosuke: 'Yosuke Hanamura',
  Yukiko: 'Yukiko Amagi',
  Yumi: 'Yumi Ozawa',
  Yu: 'Yu Narukami',
};

export const catalogOf = (game: Game) =>
  (game === 'P5' ? catalogP5 : catalogP4) as Record<string, Record<string, string[]>>;

export const charListOf = (game: Game) => Object.keys(catalogOf(game)).sort((a, b) => a.localeCompare(b));

export const displayNameOf = (game: Game, char: string) => {
  const map = game === 'P5' ? DISPLAY_NAMES_P5 : DISPLAY_NAMES_P4;
  return map[char] ?? char;
};

export const defaultOf = (game: Game) =>
  game === 'P5'
    ? { char: 'Ann', emote: 'Happy', costume: 'Gym Clothes', name: 'Ann', font: 'KoreanKRSM', box: 'main' }
    : { char: 'Chie', emote: 'Happy', costume: 'Spring Uniform', name: 'Chie', font: 'SkipStd-B', box: 'golden' };

export const portraitUrl = (game: Game, char: string, emote: string, costume: string) => {
  const base = game === 'P5' ? S3_P5 : S3_P4;
  const enc = (s: string) => encodeURIComponent(s);
  return `${base}/${enc(char)}/${enc(emote)}/${enc(`${char}-${emote}-${costume}.png`)}`;
};

/** Local name-box art for P5 (per-character, Optima/KRSM). Null when no dedicated art. */
export const nameBoxUrl = (font: string, name: string, boxType: string): string | null => {
  const enc = (s: string) => encodeURIComponent(s);
  if (boxType === 'noPortrait') return `boxes/p5/${enc('db-noPortrait.png')}`;
  if (boxType === 'dancing') return `boxes/p5/${enc('db-dancing.png')}`;
  if (boxType === 'strikers') return `boxes/p5/${enc('db-strikers.png')}`;
  const mapped = findNameBox(name);
  if (mapped && (font === 'KoreanKRSM' || font === 'Optima Nova LT')) {
    const face = font === 'KoreanKRSM' ? 'KoreanKRSM' : 'Optima nova LT';
    return `boxes/p5/${enc(`db-${mapped}-${face}.png`)}`;
  }
  return null;
};
