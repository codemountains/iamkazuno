import type { MicroCMSNamedContent, MicroCMSThing } from '../types/content';

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

export const sampleThings: MicroCMSThing[] = [
  {
    id: 'mountain-boots',
    name: 'ブーツ',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/mountain-boots.svg',
      width: 640,
      height: 640,
      alt: '靴紐と厚いソールを備えた登山用ブーツのイラスト',
    },
    description: '<p>いつもの登山道から、まだ歩いたことのない稜線へ。</p><p>土や岩の感触を確かめながら、一歩ずつ進む。山を歩く時間をともにする、<strong>足元の道具</strong>。</p>',
    ref_categories: [mountain],
  },
  {
    id: 'mountain-backpack',
    name: 'バックパック',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/mountain-backpack.svg',
      width: 640,
      height: 640,
      alt: 'ロールトップと外側ポケットのある登山用バックパックのイラスト',
    },
    description: '<p>その日に必要なものをまとめて、山へ。</p><p>荷物の居場所を決めておくと、出発前の準備も少し楽しくなる。歩く時間に寄り添うバックパック。</p><ul><li>行動食と飲み物</li><li>雨具と防寒着</li><li>景色を残すカメラ</li></ul>',
    ref_categories: [mountain],
  },
  {
    id: 'mountain-watch',
    name: '腕時計',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/mountain-watch.svg',
      width: 640,
      height: 640,
      alt: '丸い文字盤と濃い色のストラップを備えたアウトドア用腕時計のイラスト',
    },
    description: '<p>歩き始めた時間も、休憩のひとときも。</p><p>ポケットから何かを取り出すことなく、手元で時刻を確かめる。<strong>山で過ごす一日</strong>のおとも。</p>',
    ref_categories: [mountain],
  },
  {
    id: 'ski-skis',
    name: 'スキー板',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/ski-skis.svg',
      width: 640,
      height: 640,
      alt: 'ビンディングを取り付けた二枚のスキー板のイラスト',
    },
    description: '<p>冬の朝、雪の上に新しい線を描く。</p><p>板を手入れしながら、次に滑る日のことを考える。雪の季節の楽しみをつくる一組。</p>',
    ref_categories: [ski],
  },
  {
    id: 'ski-goggles',
    name: 'ゴーグル',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/ski-goggles.svg',
      width: 640,
      height: 640,
      alt: '湾曲したミラーレンズとストラップのあるスキーゴーグルのイラスト',
    },
    description: '<p>白い景色の中へ出かける日の道具。</p><p>レンズ越しに見る空と雪。滑り終えたら丁寧に拭いて、次の出番までケースへ。</p>',
    ref_categories: [ski],
  },
  {
    id: 'myog-tote',
    name: 'トートバッグ',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/myog-tote.svg',
      width: 640,
      height: 640,
      alt: '縫い目と二本の持ち手がある明るい色のトートバッグのイラスト',
    },
    description: '<p>欲しい大きさを、自分の手でつくる。</p><p>生地を選び、持ち手の長さを考え、一針ずつ縫う。少し不揃いなところも含めて愛着がわく、<strong>手づくりのトートバッグ</strong>。</p>',
    ref_categories: [myog],
  },
  {
    id: 'myog-stuff-sack',
    name: 'スタッフサック',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/myog-stuff-sack.svg',
      width: 640,
      height: 640,
      alt: 'ドローコードで口を絞ったマスタード色のスタッフサックのイラスト',
    },
    description: '<p>小さな道具に、ちょうどいい居場所を。</p><p>余った生地からつくる、軽やかな巾着袋。入れるものに合わせて寸法を決められるのも、<em>MYOGの楽しみ</em>。</p>',
    ref_categories: [myog],
  },
  {
    id: 'other-camera',
    name: 'カメラ',
    ref_brand: sampleBrands[0],
    main_image: {
      url: '/images/samples/other-camera.svg',
      width: 640,
      height: 640,
      alt: 'シルバーとチャコールのボディに大きなレンズが付いたコンパクトカメラのイラスト',
    },
    description: '<p>何でもない景色を、ひとつ持ち帰る。</p><p>街角の光や、山道で見つけた葉っぱ。<strong>足を止めた瞬間</strong>を記録するための小さなカメラ。</p>',
    ref_categories: [other],
  },
];
