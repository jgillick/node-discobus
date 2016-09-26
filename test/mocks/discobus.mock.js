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
  }

  write(data) {
    this.buffer.push.apply(this.buffer, data); 
  }
  drain (cb) {
    cb();
  }
  receiveData(data) {
    this.emit('data', data);
  }
}

// Module updates
var DiscoBus = proxyquire('../../dist/discobus', { 
  'serialport': SerialPortMock
});

module.exports = {
  DiscoBus,
  SerialPort: SerialPortMock
};