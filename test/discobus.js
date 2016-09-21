'use strict';

const crc = require('crc');
const sinon = require('sinon');
const chai = require('chai');
const expect = require('chai').expect;
const sinonChai = require("sinon-chai");

chai.use(sinonChai);

const DiscoBusMocks = require('./mocks/discobus.mock.js');
const DiscoBus = DiscoBusMocks.DiscoBus;
const SerialPort = DiscoBusMocks.SerialPort;

describe('DiscoBus Object', function() {
  let bus;
  beforeEach(function(){ 
    bus = new DiscoBus();
  });

  it('creates an instance of DiscoBus Object', function() {
    expect(bus).to.be.a('object');
    expect(bus.nodeNum).to.equal(0);
  });

  it('connects to a device', function() {
    bus.connectWith = sinon.spy();
    bus.connectTo('/dev/port', {baudRate: 9600});

    expect(bus.port.dev).to.equal('/dev/port');
    expect(bus.connectWith).to.be.calledWith();
  });

  it('sets up serial device listeners', function() {
    let port = new SerialPort();
    bus.connectWith(port);
    
    expect(bus.port).to.equal(port);
    expect(port.on).to.be.calledWith('data');
    expect(port.on).to.be.calledWith('open'); 
  });

  it('supports chaining methods', function() {
    let port = new SerialPort();
    bus.connectWith(port);

    function chainTest() {
      bus.startMessage(0x00, 1)
        .sendData(0x00)
        .endMessage()
        .subscribe();
    }
    expect(chainTest).to.not.throw(Error);
  });
});

describe('Messaging', function() {
  let bus;

  beforeEach(function(){ 
    bus = new DiscoBus();
    bus.nodeNum = 5;
    bus.connectTo('/dev/port', {baudRate: 9600});
  });

  it('throws an exception if another message is being sent', function() {
    function startWrapper() {
      bus.startMessage(0x00, 1);
    }

    startWrapper();
    expect(startWrapper).to.throw(Error);
  });

  it('throws an exception no port has been connected', function() {
    bus = new DiscoBus();
    function startWrapper() {
      bus.startMessage(0x00, 1);
    }
    expect(startWrapper).to.throw(Error);
  });

  it('throws an exception when trying send data to a message that doesn\'t exist', function() {
    expect(() => bus.sendData([1,2,3]) ).to.throw(Error);
  });

  it('throws an exception when trying to end a message that doesn\'t exist', function() {
    expect(() => bus.endMessage() ).to.throw(Error);
  });

  it('sends a standard message', function() {
    let expectedData = [
      0xFF, 0xFF, 0x00, 0x05, 0x09, 0x01, 0x02, // Header
      0x01, 0x02, // Data
      57, 231     // CRC
    ];

    // var data = [0x00, 0x05, 0x09, 0x01, 0x02, 0x01, 0x02];
    // var c = crc.crc16modbus(data, 0xFFFF);
    // console.log(bus._convert16bitTo8(c));

    bus.startMessage(0x09, 2, { destination: 0x05});
    bus.sendData([0x01, 0x02]);
    bus.endMessage();

    expect(bus.port.write).to.be.called;
    expect(bus.port.buffer).to.deep.equal(expectedData);
  });

  it('sends a batch message header', function() {
    let expectedData = [0xFF, 0xFF, 0x01, 0x00, 0x09, 0x05, 0x02];
    bus.startMessage(0x09, 2, { batchMode: true });
    expect(bus.port.buffer).to.deep.equal(expectedData);
  });

  it('sends a response batch message header', function() {
    let expectedData = [0xFF, 0xFF, 0x03, 0x00, 0x09, 0x05, 0x02];
    bus.startMessage(0x09, 2, { 
      batchMode: true,
      responseMsg: true 
    });
    expect(bus.port.buffer).to.deep.equal(expectedData);
  });

  it('creates default fill data for response message');

  it('creates a message observer');

  it('fills in data when prematurely ending a message');

  it('receives responses from nodes');

  it('times out slow responding nodes');
});

describe('Addressing', function() {

  it('enables outgoing daisy line');

  it('confirms valid address');

  it('corrects invalid address');

  it('times out after not receiving an address in x milliseconds');

  it('cancels addressing on too many invalid addresses');

  it('ends addressing with two 0xFF and a NULL message');

  it('resets daisy line after addressing');
});