'use strict';

const chalk = require('chalk');

const colors = [
  'green',
  'yellow',
  'red',
];

class LoggerCollector {
  constructor() {
    this.clear();
  }
  error(log) {
    this.red.push(log);
  }
  warning(log) {
    this.yellow.push(log);
  }
  info(log) {
    this.green.push(log);
  }
  clear() {
    this.red = [];
    this.yellow = [];
    this.green = [];
  }
  output() {
    for (const color of colors) {
      for (const log of this[color]) {
        console.log(chalk[color](log));
      }
    }
  }
}

module.exports = LoggerCollector;
