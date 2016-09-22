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

/**
 * General object construction
 */
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

  it('removes port listeners when connecting to new port');
});

/**
 * Messaging protocol
 */
describe('Messaging', function() {
  let bus;

  beforeEach(function(){ 
    bus = new DiscoBus();
    bus.connectWith(new SerialPort());
    bus.nodeNum = 5;
    bus.timeouts.addressing = 1;
    bus.timeouts.nodeResponse = 1;
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

  it('creates default fill data for response message', function() {
  // When no `responseDefault` is set in message options
    bus.startMessage(0x09, 5, {
      responseMsg: true 
    });
    expect(bus._msgOptions.responseDefault).to.deep.equal([0, 0, 0, 0, 0]);
  });

  it('creates partial default fill data for response message', function() {
  // When length of `responseDefault` does not match message length
    bus.startMessage(0x09, 5, {
      responseMsg: true,
      responseDefault: [1, 2, 3]
    });
    expect(bus._msgOptions.responseDefault).to.deep.equal([1, 2, 3, 0, 0]);
  });

  it('inserts default response when response timeout occurs', function(done) {
    bus.startMessage(0x09, 5, {
      responseMsg: true 
    });

    bus.port.buffer = []; // clear header bytes
    
    bus.subscribe(null, null, () => {
      expect(bus.port.buffer).to.have.lengthOf(7);
      expect(bus.port.buffer.slice(0, 5)).to.deep.equal([0, 0, 0, 0, 0]);
      done();
    });
  });

  it('inserts partial default response when response timeout occurs', function(done) {
    bus.startMessage(0x09, 5, {
      responseMsg: true 
    });

    // Send a few bytes 
    bus.port.receiveData(Buffer.from([1, 2, 3])); 
    
    bus.subscribe(null, null, () => {
      expect(bus.messageResponse).to.deep.equal([1, 2, 3, 0, 0]);
      done();
    });
  });

  it('creates a message observer', function(done) {
    let nextSpy = sinon.spy();
    let completeSpy = sinon.spy();

    bus.startMessage(0x09, 2, {
      responseMsg: true 
    }); 

    bus.subscribe(nextSpy, null, completeSpy);
    bus.subscribe(null, null, () => {
      expect(nextSpy).to.have.been.calledTwice;
      expect(completeSpy).to.have.been.calledOnce;
      done();
    });
    
    bus.port.receiveData(Buffer.from([1, 2])); 
  });

  it('fills in data when prematurely ending a message', function(done) {
    let errorSpy = sinon.spy();

    bus.on('error', errorSpy);
    bus.startMessage(0x09, 5, {
      responseMsg: true 
    });

    bus.subscribe(null, null, () => {
      expect(errorSpy).to.have.been.called;
      expect(bus.messageResponse).to.deep.equal([0, 0, 0, 0, 0]);
      done();
    });

    bus.endMessage();
  });

  it('gets responses from nodes'); 

  it('times out responding nodes');
});

/**
 * Addressing
 */
describe('Addressing', function() {

  it('enables outgoing daisy line');

  it('confirms valid address');

  it('corrects invalid address');

  it('times out after not receiving an address in x milliseconds');

  it('cancels addressing on too many invalid addresses');

  it('ends addressing with two 0xFF and a NULL message');

  it('resets daisy line after addressing');
});