/*eslint-disable no-var, one-var, func-names, indent, prefer-arrow-callback, object-shorthand, no-console, newline-per-chained-call, one-var-declaration-per-line, prefer-template, vars-on-top  */
var gulp               = require('gulp'),
    $                  = require('gulp-load-plugins')(),
    _orderBy           = require('lodash/orderBy'),
    _take              = require('lodash/take'),
    browserify         = require('browserify'),
    buffer             = require('vinyl-buffer'),
    browserSync        = require('browser-sync').create(),
    del                = require('del'),
    exec               = require('child_process').exec,
    fs                 = require('fs'),
    historyApiFallback = require('connect-history-api-fallback'),
    lazypipe           = require('lazypipe'),
    merge              = require('merge-stream'),
    path               = require('path'),
    runSequence        = require('run-sequence'),
    source             = require('vinyl-source-stream'),
    vinylPaths         = require('vinyl-paths'),
    watchify           = require('watchify');

var isProduction = function() {
      return process.env.NODE_ENV === 'production';
    },
    middleware   = historyApiFallback({}),
    commitMessage;

function watchifyTask(options) {
  var bundler, rebundle, iteration = 0;

  bundler = browserify({
    basedir: '.',
    entries: path.join(__dirname, '/app/scripts/main.js'),
    insertGlobals: options.watch,
    cache: {},
    debug: true,
    packageCache: {},
    fullPaths: false,
    extensions: ['.jsx']
  });

  if (options.watch) {
    bundler = watchify(bundler);
  }

  rebundle = function() {
    var stream = bundler.bundle();

    if (options.watch) {
      stream.on('error', function(err) {
        console.log(err);
      });
    }

    stream
      .pipe(source('app.js'))
      .pipe(buffer())
      .pipe(gulp.dest('.tmp/assets'))
      .pipe($.tap(function() {
        if (iteration === 0 && options.cb) {
          options.cb();
        }
        iteration++;
      }));
  };

  bundler.on('update', rebundle);
  return rebundle();
}

// Scripts
gulp.task('scripts', function(cb) {
  return watchifyTask({
    watch: !isProduction(),
    cb: cb
  });
});

gulp.task('lint', function() {
  return gulp.src('app/scripts/**/*')
    .pipe($.eslint({
      useEslintrc: true
    }))
    .pipe($.eslint.format())
    .pipe($.eslint.failOnError());
});

gulp.task('modernizr', function(cb) {
  return exec('./node_modules/.bin/modernizr -c .modernizr.json -d .tmp/assets/modernizr.js', cb);
});

gulp.task('styles', function() {
  return gulp.src('app/styles/main.scss')
    .pipe($.plumber())
    .pipe($.sourcemaps.init())
    .pipe($.sass.sync({
      precision: 4
    }).on('error', $.sass.logError))
    .pipe($.plumber.stop())
    .pipe($.autoprefixer({
      browsers: ['last 4 versions']
    }))
    .pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('.tmp/assets'))
    .pipe(browserSync.stream());
});

gulp.task('media', function() {
  return gulp.src(['**/*.{jpg,gif,png}'], { cwd: 'app/media/' })
    .pipe($.imagemin({
      verbose: true,
      progressive: true,
      interlaced: true
    }))
    .pipe(gulp.dest('dist/media'))
    .pipe($.size({
      title: 'Media'
    }));
});

gulp.task('icons', function() {
  gulp.src('**/*.svg', { cwd: 'app/media/icons' })
    .pipe($.svgSprite({
      mode: {
        symbol: {
          dest: '.',
          prefix: '',
          sprite: 'icons'
        }
      }
    }))
    .pipe($.replace(/ fill=".*?"/g, ''))
    .pipe(gulp.dest('app/media'));
});

gulp.task('readme', function() {
  var json  = JSON.parse(fs.readFileSync('./app/logos.json')),
      logos = _orderBy(json.items, ['updated', 'name'], ['desc', 'asc']);

  logos = _take(logos, 50);

  return gulp.src('app/templates/README.handlebars')
    .pipe($.compileHandlebars(logos, {
      batch: ['./app/templates']
    }))
    .pipe($.rename('README.md'))
    .pipe(gulp.dest('./'));
});

gulp.task('copy', function() {
  return gulp.src('app/media/**/*')
    .pipe(gulp.dest('.tmp'));
});

gulp.task('bundle', function() {
  var html,
      extras,
      media,
      logos;

  var compress = lazypipe()
    .pipe($.filelog)
    .pipe($.sourcemaps.init, { loadMaps: true })
    .pipe($.if, '*.js', $.uglify())
    .pipe($.if, '*.css', $.cssmin())
    .pipe($.sourcemaps.write, '.');

  html = gulp.src('app/*.html')
    .pipe($.useref())
    .pipe($.if('**/*.{css,js}', compress()))
    .pipe(gulp.dest('dist'))
    .pipe($.size({
      title: 'HTML'
    }));

  extras = gulp.src([
      'app/favicon.ico',
      'app/.htaccess'
    ])
    .pipe(gulp.dest('dist'))
    .pipe($.size({
      title: 'Extras'
    }));

  media = gulp.src([
      'app/media/*.svg'
    ])
    .pipe(gulp.dest('dist/media'))
    .pipe($.size({
      title: 'Media'
    }));

  logos = gulp.src([
      'logos/*.svg'
    ])
    .pipe(gulp.dest('dist/logos'))
    .pipe($.size({
      title: 'Logos'
    }));

  return merge(html, extras, media, logos);
});

gulp.task('sizer', function() {
  return gulp.src('dist/**/*')
    .pipe($.size({
      title: 'Build',
      gzip: true
    }));
});

gulp.task('assets', function(cb) {
  runSequence('styles', 'scripts', 'modernizr', cb);
});

gulp.task('clean', function(cb) {
  var target = ['.tmp/*'];
  if (isProduction()) {
    target.push('dist/*');
  }

  return del(target, cb);
});

gulp.task('get-commit', function(cb) {
  exec('git log -1 --pretty=%s && git log -1 --pretty=%b', function(err, stdout) {
    var parts = stdout.replace('\n\n', '').split('\n');

    commitMessage = parts[0];
    if (parts[1]) {
      commitMessage += ' — ' + parts[1];
    }

    cb(err);
  });
});

gulp.task('gh-master', function() {
  var clean,
      push;

  clean = gulp.src('.master/.DS_Store')
    .pipe(vinylPaths(del));

  push = gulp.src([
      'logos/**/*.svg',
      'README.md',
      'LICENSE.txt'
    ], { base: './' })
    .pipe($.ghPages({
      branch: 'master',
      cacheDir: '.master',
      message: commitMessage,
      force: true
    }));

  return merge(clean, push);
});

gulp.task('deploy-site', ['build'], function() {
  return gulp.src('dist/**', {
      dot: true
    })
    .pipe($.rsync({
      incremental: true,
      exclude: ['.DS_Store'],
      progress: true,
      root: 'dist',
      username: 'svgporn',
      hostname: 'svgporn.com',
      destination: '/home/svgporn/public_html'
    }));
});

gulp.task('deploy-master', function(cb) {
  runSequence(['get-commit', 'readme'], 'gh-master', cb);
});

gulp.task('serve', ['assets'], function() {
  browserSync.init({
    notify: true,
    logPrefix: 'logos',
    server: {
      baseDir: ['.tmp', 'app', './'],
      middleware: [middleware],
      routes: {
        '/bower_components': './bower_components',
        '/node_modules': 'node_modules'
      }
    }
  });

  gulp.watch('app/styles/**/*.scss', function(e) {
    if (e.type === 'changed') {
      gulp.start('styles');
    }
  });

  gulp.watch('app/logos.json', ['readme']);
  gulp.watch(['app/*.html', '.tmp/assets/app.js', 'app/media/**/*', 'app/logos.json']).on('change', function() {
    browserSync.reload();
  });
});

gulp.task('build', function(cb) {
  process.env.NODE_ENV = 'production';
  runSequence('clean', 'lint', 'readme', 'assets', ['media', 'bundle'], 'sizer', cb);
});

gulp.task('build', function(cb) {
  process.env.NODE_ENV = 'production';
  runSequence('clean', 'lint', 'readme', 'assets', ['media', 'bundle'], 'sizer', cb);
});

gulp.task('prebuild', function(cb) {
  process.env.NODE_ENV = 'production';
  runSequence('scripts', ['bundle'], cb);
});

gulp.task('default', ['serve']);
