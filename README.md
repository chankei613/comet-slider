# three-div-image-slider

各スライド（div）の直下にある img 要素「だけ」にアニメーションを適用する、最小構成のスライダーです。Three.js を用いた WebGL エフェクト（2種類）と、フォールバックのフェードを提供します。テキストや他の要素は影響を受けません。

- スライド単位は `div`（コンテナ直下）
- `div` 直下の `img` のみをアニメーション対象に
- Three.js を使ったエフェクト種類: `wave` / `ripple`（`none` でフェード）
- ES Modules、ビルド不要

## デモ

`examples/index.html` をブラウザで開いてください（ローカルファイルでOK）。モダンブラウザ推奨。

## 使い方

HTML:

```html
<link rel="stylesheet" href="./styles/slider.css">
<div id="slider">
  <div class="slide">
    <img src="./examples/img1.jpg" alt="">
    <h2>テキストはそのまま</h2>
    <p>このテキストはアニメーションの影響を受けません。</p>
  </div>
  <div class="slide">
    <img src="./examples/img2.jpg" alt="">
    <h2>2枚目</h2>
  </div>
</div>

<script type="module">
  import { Slider } from './src/index.js';
  const slider = new Slider('#slider', {
    animation: 'wave',  // 'wave' | 'ripple' | 'none'
    duration: 900,
    autoplay: true,
    interval: 4000
  });

  // API
  // slider.next();
  // slider.prev();
  // slider.show(0);
  // slider.play();
  // slider.stop();
</script>
```

Three.js はデフォルトで CDN（unpkg）から動的 import します。バンドラ環境などで自前の three を使いたい場合は `threeModuleUrl` を上書きしてください。

```js
const slider = new Slider('#slider', {
  threeModuleUrl: '/node_modules/three/build/three.module.js'
});
```

## オプション

- `animation`: `'wave' | 'ripple' | 'none'`（デフォルト: `'wave'`）
- `duration`: アニメーション時間（ms、デフォルト: `900`）
- `autoplay`: 自動再生（デフォルト: `false`）
- `interval`: 自動再生の間隔（ms、デフォルト: `4000`）
- `loop`: 最後→最初にループ（デフォルト: `true`）
- `threeModuleUrl`: Three.js の ESM URL（デフォルト: unpkg）
- `onChange(fromIndex, toIndex)`: スライド切替後に呼ばれるコールバック（任意）

## 制約と注意

- アニメーション対象は各スライド（`div`）の直下にある最初の `img` です。
- レイアウトは各スライドのテキスト等をそのまま残す想定です。`position` など個別レイアウトを組む場合は調整してください。
- 画像は `img.src` で読み込みます。`<source>` など別経路は未対応（MVP）。
- 画像の表示サイズ（ボックス）が変わると正確に合わせ直す必要があるため、レスポンシブで頻繁にサイズが変わるケースでは、リサイズ時に一旦次/前に送るなどで再計算されます（将来的に `resize` ハンドラで改善予定）。

## インストール（任意）

npm パッケージとして使う場合は、将来的に公開予定です。現時点ではリポジトリをそのままクローンしてご利用ください。

## 開発

- ビルド不要、ESM のみ
- Three.js は peerDependency として指定（CDN で自動 import するため開発では未インストールでも動作します）

## ライセンス

MIT