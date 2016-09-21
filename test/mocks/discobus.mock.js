const sinon = require('sinon');
const proxyquire =  require('proxyquire');

// Stub out SerialPort module 
var SerialPortMock = function(dev, options) {
  this.dev = dev;
  this.options = options;
  this.buffer = [];
  sinon.spy(this, 'write');
}
SerialPortMock.prototype.on = sinon.spy();
SerialPortMock.prototype.drain = sinon.spy();
SerialPortMock.prototype.write = function(data){
  this.buffer.push(...data);
};

// Module updates
var DiscoBus = proxyquire('../../dist/discobus', { 
  'serialport': SerialPortMock
});

module.exports = {
  DiscoBus,
  SerialPort: SerialPortMock
};