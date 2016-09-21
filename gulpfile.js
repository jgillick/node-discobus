var gulp = require('gulp');
const babel = require('gulp-babel');
const mocha = require('gulp-mocha');
const changed = require('gulp-changed');

const SRC = './src/**/*.js';
const DIST = './dist/';
const TEST = './test/*.js';

gulp.task('default', ['build'], function() {});

gulp.task('watch', ['build', 'test'], function() {
  gulp.watch(SRC, ['build']);
  gulp.watch([TEST, DIST +'/**/*.js'], ['test']);
});

gulp.task('test', ['build'], function() {
   gulp.src(TEST, {read: false})
        .pipe(mocha({reporter: 'spec'}));
});

gulp.task('build', function() {
  return gulp.src(SRC)
        .pipe(changed(DIST))
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(gulp.dest(DIST));
});