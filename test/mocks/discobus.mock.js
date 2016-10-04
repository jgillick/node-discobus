'use strict';

const sinon = require('sinon');
const EventEmitter = require('events');
const proxyquire =  require('proxyquire');

require('source-map-support').install();

// Stub out SerialPort module
class SerialPortMock extends EventEmitter {
  constructor (dev, options) {
    super();
    this.dev = dev;
    this.options = options;
    this.buffer = [];

    sinon.spy(this, 'write');
    sinon.spy(this, 'on');

    this.emit('open');
  }

  write(data, cb) {
    this.buffer.push.apply(this.buffer, data);
    cb();
  }
  drain (cb) {
    cb();
  }

  // Send data that shoudl appear to be received from a slave node
  receiveData(data) {
    this.emit('data', data);
  }
}
SerialPortMock.prototype.set = function(config, cb) {
  cb();
}

// Module updates
var DiscoBus = proxyquire('../../dist/discobus', {
  'serialport': SerialPortMock
});

module.exports = {
  DiscoBus,
  SerialPort: SerialPortMock
};