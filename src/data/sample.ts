import type { MicroCMSNamedContent, MicroCMSThing, PickImage } from '../types/content';

// These are illustrative objects, not the site owner's possessions or reviews.
export const sampleBrands: MicroCMSNamedContent[] = [
  { id: 'sample-objects', name: 'SAMPLE OBJECTS' },
];

export const sampleCategories: MicroCMSNamedContent[] = [
  { id: 'mountain', name: 'mountain' },
  { id: 'ski', name: 'ski' },
  { id: 'myog', name: 'myog' },
  { id: 'other', name: 'other' },
];

const [mountain, ski, myog, other] = sampleCategories;

const sampleImage: PickImage = {
  url: '/images/samples/sample.svg',
  width: 640,
  height: 640,
  alt: 'サンプル画像',
};

const sampleTemplates: MicroCMSThing[] = [
  {
    id: 'mountain-boots',
    name: 'ブーツ',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>いつもの登山道から、まだ歩いたことのない稜線へ。</p><p>土や岩の感触を確かめながら、一歩ずつ進む。山を歩く時間をともにする、<strong>足元の道具</strong>。</p>',
    ref_categories: [mountain],
  },
  {
    id: 'mountain-backpack',
    name: 'バックパック',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>その日に必要なものをまとめて、山へ。</p><p>荷物の居場所を決めておくと、出発前の準備も少し楽しくなる。歩く時間に寄り添うバックパック。</p><ul><li>行動食と飲み物</li><li>雨具と防寒着</li><li>景色を残すカメラ</li></ul>',
    ref_categories: [mountain],
  },
  {
    id: 'mountain-watch',
    name: '腕時計',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>歩き始めた時間も、休憩のひとときも。</p><p>ポケットから何かを取り出すことなく、手元で時刻を確かめる。<strong>山で過ごす一日</strong>のおとも。</p>',
    ref_categories: [mountain],
  },
  {
    id: 'ski-skis',
    name: 'スキー板',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>冬の朝、雪の上に新しい線を描く。</p><p>板を手入れしながら、次に滑る日のことを考える。雪の季節の楽しみをつくる一組。</p>',
    ref_categories: [ski],
  },
  {
    id: 'ski-goggles',
    name: 'ゴーグル',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>白い景色の中へ出かける日の道具。</p><p>レンズ越しに見る空と雪。滑り終えたら丁寧に拭いて、次の出番までケースへ。</p>',
    ref_categories: [ski],
  },
  {
    id: 'myog-tote',
    name: 'トートバッグ',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>欲しい大きさを、自分の手でつくる。</p><p>生地を選び、持ち手の長さを考え、一針ずつ縫う。少し不揃いなところも含めて愛着がわく、<strong>手づくりのトートバッグ</strong>。</p>',
    ref_categories: [myog],
  },
  {
    id: 'myog-stuff-sack',
    name: 'スタッフサック',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>小さな道具に、ちょうどいい居場所を。</p><p>余った生地からつくる、軽やかな巾着袋。入れるものに合わせて寸法を決められるのも、<em>MYOGの楽しみ</em>。</p>',
    ref_categories: [myog],
  },
  {
    id: 'other-camera',
    name: 'カメラ',
    ref_brand: sampleBrands[0],
    main_image: sampleImage,
    description: '<p>何でもない景色を、ひとつ持ち帰る。</p><p>街角の光や、山道で見つけた葉っぱ。<strong>足を止めた瞬間</strong>を記録するための小さなカメラ。</p>',
    ref_categories: [other],
  },
];

// 既存8件のURLを保ち、90件以上ある本番と同程度の一覧・スクロールを再現する。
// 各カテゴリを均等に増やし、画像は1枚の汎用サンプルSVGを共用する。
const templatesByCategory = [
  sampleTemplates.slice(0, 3),
  sampleTemplates.slice(3, 5),
  sampleTemplates.slice(5, 7),
  sampleTemplates.slice(7, 8),
];

const sampleVariations: MicroCMSThing[] = Array.from({ length: 87 }, (_, index) => {
  const templates = templatesByCategory[index % templatesByCategory.length];
  const template = templates[Math.floor(index / templatesByCategory.length) % templates.length];
  const number = String(index + 1).padStart(3, '0');
  return {
    ...template,
    id: `sample-${number}`,
    name: `${template.name}（サンプル ${number}）`,
  };
});

export const sampleThings: MicroCMSThing[] = [
  ...sampleTemplates,
  ...sampleVariations,
  // 任意フィールドや複数カテゴリの表示も、実際の画面で確認できるようにする。
  {
    ...sampleTemplates[1],
    id: 'sample-multi-category',
    name: '複数カテゴリのサンプル',
    ref_categories: [mountain, myog],
  },
  {
    ...sampleTemplates[3],
    id: 'sample-no-image',
    name: '画像未設定のサンプル',
    main_image: null,
  },
  {
    ...sampleTemplates[5],
    id: 'sample-no-brand',
    name: 'ブランド未設定のサンプル',
    ref_brand: null,
  },
  {
    ...sampleTemplates[7],
    id: 'sample-no-description',
    name: '説明未設定のサンプル',
    description: null,
  },
  {
    ...sampleTemplates[6],
    id: 'sample-uncategorized',
    name: 'カテゴリ未設定のサンプル',
    ref_categories: [],
  },
];
