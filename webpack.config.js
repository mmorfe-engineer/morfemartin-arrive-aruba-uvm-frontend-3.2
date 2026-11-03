/*
 * Arrive Aruba · e-actividad 3.2 — configuración de webpack
 * ---------------------------------------------------------
 * Empaqueta las 6 páginas del sitio en dist/:
 *   - HTML minificado (html-webpack-plugin)
 *   - CSS minificado y extraído por página (mini-css-extract-plugin + css-minimizer)
 *   - assets/ y js/ copiados tal cual (copy-webpack-plugin)
 */
const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

/* Página → hojas de estilo que usa (mismo orden que los <link> del HTML) */
const paginas = {
  index: {
    html: 'index.html',
    css: ['base', 'componentes', 'inicio', 'responsive', 'figma-hero', 'journey-organic']
  },
  catalogo: {
    html: 'catalogo.html',
    css: ['base', 'componentes', 'catalogo', 'responsive']
  },
  producto: {
    html: 'producto.html',
    css: ['base', 'componentes', 'producto', 'responsive']
  },
  formulario: {
    html: 'formulario.html',
    css: ['base', 'componentes', 'formulario', 'responsive']
  },
  nosotros: {
    html: 'nosotros.html',
    css: ['base', 'componentes', 'nosotros', 'responsive']
  },
  historial: {
    html: 'historial.html',
    css: ['base', 'componentes', 'historial', 'responsive']
  }
};

/* Entradas: cada página con sus CSS (webpack los une y los minifica en uno por página) */
const entry = {};
for (const [nombre, cfg] of Object.entries(paginas)) {
  entry[nombre] = cfg.css.map((hoja) => `./css/${hoja}.css`);
}

/*
 * Plantillas: se toma el HTML del repo y se le retiran los <link> locales de
 * css/ (los vuelve a inyectar html-webpack-plugin apuntando al CSS ya
 * minificado de dist/). Se conservan favicon, tipografías y scripts.
 */
function plantilla(htmlFile) {
  const original = fs.readFileSync(path.join(__dirname, htmlFile), 'utf8');
  return original.replace(/<link rel="stylesheet" href="css\/[^"]*">\s*/g, '');
}

module.exports = {
  mode: 'production',
  context: __dirname,
  entry,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          { loader: 'css-loader', options: { url: false } }
        ]
      }
    ]
  },
  optimization: {
    splitChunks: false,
    minimizer: [`...`, new CssMinimizerPlugin()]
  },
  plugins: [
    ...Object.entries(paginas).map(([nombre, cfg]) => new HtmlWebpackPlugin({
      templateContent: plantilla(cfg.html),
      filename: cfg.html,
      chunks: [nombre],
      minify: {
        collapseWhitespace: true,
        conservativeCollapse: true,
        removeComments: true,
        keepClosingSlash: true,
        minifyCSS: true,
        minifyJS: true
      }
    })),
    new MiniCssExtractPlugin({ filename: 'css/[name].css' }),
    new CopyPlugin({
      patterns: [{ from: 'assets', to: 'assets' }, { from: 'js', to: 'js' }]
    })
  ],
  devServer: {
    /*
     * El dev-server sirve primero los archivos compilados en memoria; como
     * respaldo sirve también el proyecto desde disco, de modo que assets/
     * (manifiesto y láminas del journey) y js/ siempre resuelven en
     * desarrollo aunque el copy no esté en memoria. No afecta al build.
     */
    static: { directory: __dirname },
    port: 9000,
    open: true,
    watchFiles: ['*.html', 'css/**', 'js/**']
  }
};
