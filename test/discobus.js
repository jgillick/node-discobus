'use strict';

const crc = require('crc');
const sinon = require('sinon');
const chai = require('chai');
const expect = require('chai').expect;
const sinonChai = require("sinon-chai");

chai.use(sinonChai);

const DiscoBusMocks = require('./mocks/discobus.mock.js');
const DiscoBusMaster = DiscoBusMocks.DiscoBus.DiscoBusMaster;
const SerialPort = DiscoBusMocks.SerialPort;
 

/**
 * General object construction
 */
describe('DiscoBus Object', function() {
  let bus;
  
  beforeEach(function(){
    bus = new DiscoBusMaster();
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

    let ret = bus.startMessage(0x00, 1)
              .sendData(0x00)
              .endMessage()
              .subscribe();

    expect(ret).to.be.instanceOf(DiscoBusMaster);
  });

  it('removes port listeners when connecting to new port', function() {
    let port1 = new SerialPort();
    let port2 = new SerialPort();
    let removeSpy = sinon.spy(port1, 'removeListener');

    bus.connectWith(port1);
    bus.connectWith(port2);

    expect(removeSpy).to.have.been.called;
    expect(port1.listenerCount('open')).to.be.equal(0);
    expect(port1.listenerCount('data')).to.be.equal(0);
  });
});

/**
 * Messaging protocol
 */
describe('Messaging', function() {
  let bus;
  let errorEmitterSpy = sinon.spy();

  beforeEach(function(){
    bus = new DiscoBusMaster();
    bus.connectWith(new SerialPort());
    bus.on('error', errorEmitterSpy);

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

  it('throws an exception when no port has been connected', function() {
    bus = new DiscoBusMaster();
    function startWrapper() {
      bus.startMessage(0x00, 1);
    }
    expect(startWrapper).to.throw(Error);
  });

  it('throws error if batch mode has a destination address', function() {
    function startWrapper() {
      bus.startMessage(0x01, 1, {
        batchMode: true,
        destination: 1
      });
    }
    expect(startWrapper).to.throw(Error);
  });

  it('emits an error when trying send data to a message that doesn\'t exist', function() {
    bus.sendData([1,2,3]);
    bus.endMessage();
    expect(errorEmitterSpy).to.have.been.called;
  });

  it('emits an error when trying to end a message that doesn\'t exist', function() {
    bus.endMessage();
    expect(errorEmitterSpy).to.have.been.called;
  });

  it('emits error drain errors to subscriber', function(done) {
    bus.startMessage(0x01, 1)
    .subscribe(null, () => {
      expect(errorEmitterSpy).to.have.been.called;
      done();
    });
    bus.port.drain = function(cb) {
      cb('Error thing');
    }
    bus.endMessage();
  });

  it('emits error when sending too much data', function() {
    bus.startMessage(0x09, 1)
    .subscribe(null, (err) => {
      expect(errorEmitterSpy).to.have.been.called;
      done();
    });

    // Send too many bytes
    bus.port.receiveData(Buffer.from([1, 2, 3, 4]));
  });

  it('returns current command', function() {
    bus.startMessage(0x09, 2, { destination: 0x05});
    expect(bus.messageCommand).to.equal(0x09);
  });

  it('sends a standard message', function() {
    let expectedData = [
      0xFF, 0xFF, 0x00, 0x05, 0x09, 0x01, 0x02, // Header
      0x01, 0x02, // Data
      57, 231     // CRC
    ];

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

  it('fills in missing data when prematurely ending a message', function(done) {
    bus.startMessage(0x09, 5);
    bus.port.buffer = [];

    bus.subscribe(null, null, () => {
      expect(errorEmitterSpy).to.have.been.called;
      expect(bus.port.buffer.slice(0, 5)).to.deep.equal([1, 2, 0, 0, 0]);
      done();
    });

    bus.sendData([1, 2])
    bus.endMessage();
  });

  it('creates a message observer', function(done) {
    let nextSpy = sinon.spy();
    let completeSpy = sinon.spy();

    bus.startMessage(0x09, 2, {
      destination: 1,
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

  /**
   * Response messages
   */
  describe('Response message', function() {

    it('gets responses from nodes', function(done) {
      bus.startMessage(0x09, 3, {
        responseMsg: true,
        destination: 1
      })
      .subscribe(null, null, () => {
        expect(bus.messageResponse).to.deep.equal([1, 2, 3]);
        done();
      });

      // Send bytes from nodes
      bus.port.receiveData(Buffer.from([1, 2, 3]));
    });

    it('creates default response fill data', function() {
    // When no `responseDefault` is set in message options
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        destination: 1
      });
      expect(bus._msgOptions.responseDefault).to.deep.equal([0, 0, 0, 0, 0]);
    });

    it('creates partial default response fill data', function() {
    // When length of `responseDefault` does not match the passed message length
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        destination: 1,
        responseDefault: [1, 2, 3]
      });
      expect(bus._msgOptions.responseDefault).to.deep.equal([1, 2, 3, 0, 0]);
    });

    it('inserts default response when timeout occurs', function(done) {
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        destination: 1
      });

      bus.subscribe(null, null, () => {
        expect(bus.messageResponse).to.have.lengthOf(5);
        expect(bus.messageResponse).to.deep.equal([0, 0, 0, 0, 0]);
        done();
      });
    });

    it('inserts partial default response when timeout occurs', function(done) {
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        destination: 1
      });

      // Send a few bytes
      bus.port.receiveData(Buffer.from([1, 2, 3]));

      bus.subscribe(null, null, () => {
        expect(bus.messageResponse).to.deep.equal([1, 2, 3, 0, 0]);
        done();
      });
    });

    it('emits an error when prematurely ending a message', function() {
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        destination: 1
      });
      bus.endMessage();
      expect(errorEmitterSpy).to.have.been.called;
    });
  });

  /**
   * Batch Messages
   */
  describe('Batch response message', function() {

    it('implies batch response mode, if asking for a broadcast response', function() {
      bus.startMessage(0x09, 2, {
        destination: 0,
        responseMsg: true
      });
      expect(bus._msgOptions.batchMode).to.be.true;
    });

    it('sends a response batch message header', function() {
      let expectedData = [0xFF, 0xFF, 0x03, 0x00, 0x09, 0x05, 0x02];
      bus.startMessage(0x09, 2, {
        batchMode: true,
        responseMsg: true
      });
      expect(bus.port.buffer).to.deep.equal(expectedData);
    });

    it('gets responses from multiple nodes', function(done) {
      // 1st node respond
      // 2nd node sends 1 byte and times out
      // 3nd node times out
      // 4th node times out
      // 5th node repsponds

      bus.startMessage(0x09, 2, {
        batchMode: true,
        responseMsg: true
      })
      .subscribe(
        (n) => { // 5th node does not time out
          if (n.node == 3) {
            bus.port.receiveData(Buffer.from([8, 9]));
          }
        }, null, 
        () => { // complete
          expect(bus.messageResponse).to.have.lengthOf(5);
          expect(bus.messageResponse[0]).to.deep.equal([1, 2]);
          expect(bus.messageResponse[1]).to.deep.equal([3, 0]);
          expect(bus.messageResponse[2]).to.deep.equal([0, 0]);
          expect(bus.messageResponse[3]).to.deep.equal([0, 0]);
          expect(bus.messageResponse[4]).to.deep.equal([8, 9]);
          done();
        });
      
      // Send data for first 1.5 node sections
      bus.port.receiveData(Buffer.from([1, 2, 3]));
    });
  });
});

/**
 * Addressing
 */
describe('Addressing', function() {
  let bus;
  let errorEmitterSpy = sinon.spy();

  beforeEach(function(){
    bus = new DiscoBusMaster();
    bus.connectWith(new SerialPort());
    bus.on('error', errorEmitterSpy);

    bus.timeouts.addressing = 1;
    bus.timeouts.nodeResponse = 1;
  });

  it('toggles daisy line before and after addressing', function() {
    let daisySpy = sinon.spy(bus, 'setDaisyLine');
    let portSpy = sinon.spy(bus.port, 'set');

    bus.startAddressing()
    .subscribe(null, null, () => {
      expect(portSpy).to.have.been.calledWith({ rts:false });  
    });
    expect(daisySpy).to.have.been.called;
    expect(portSpy).to.have.been.calledWith({ rts:true });
  });

  it('should reset nodes first', function() {
    bus.startAddressing();
    expect(bus.port.buffer).to.deep.equal([
      0xFF, 0xFF, 0, 0, 0xFA, 1, 0, 161, 5, // Reset message
      0xFF, 0xFF, 3, 0, 0xFB, 0, 2, 0       // Addressing header
    ])
  });

  it('confirms valid address', function() {
    bus.startAddressing();

    let addr = 1;
    bus.port.buffer = [];
    bus.port.receiveData(Buffer.from([addr]));
    expect(bus.port.buffer).to.deep.equal([addr]);

    addr++
    bus.port.buffer = [];
    bus.port.receiveData(Buffer.from([addr]));
    expect(bus.port.buffer).to.deep.equal([addr]);
  });

  it('corrects invalid address', function() {
    bus.startAddressing();

    // Incorrect
    let addr = 5;
    bus.port.buffer = [];
    bus.port.receiveData(Buffer.from([addr]));
    expect(bus.port.buffer).to.deep.equal([0, 0]);

    // Correct
    addr = 1;
    bus.port.buffer = [];
    bus.port.receiveData(Buffer.from([addr]));
    expect(bus.port.buffer).to.deep.equal([1]);

    // Incorrect
    addr = 10;
    bus.port.buffer = [];
    bus.port.receiveData(Buffer.from([addr]));
    expect(bus.port.buffer).to.deep.equal([0, 1]);
  });

  it('times out after not receiving an address in x milliseconds', function(done) {
    let lastNodeTime;

    bus.timeouts.addressing = 500;
    bus.startAddressing()
    .subscribe(null, null, () => {
      expect(bus.nodeNum).to.be.equal(1);
      expect(Date.now() - lastNodeTime).to.be.at.least(bus.timeouts.addressing);
      done();
    });

    // Register 1 node
    bus.port.receiveData(Buffer.from([1]));
    lastNodeTime = Date.now();
  });

  it('passes new node address the subscribers next callback', function(done) {
    let lastAddr = 1;

    bus.startAddressing()
    .subscribe((n) => {
      expect(n.value).to.be.equal(lastAddr);
    }, null, done);

    for (let i = 0; i < 2; i++) {
      bus.port.receiveData(Buffer.from([lastAddr]));
      lastAddr++;
    }
  });

  it('sends an error to subscriber for invalid address', function(done){
    bus.startAddressing()
    .subscribe((n) => {
      expect(n.type).to.be.equal('error');
    }, null, done);

    bus.port.receiveData(Buffer.from([5]));
    expect(errorEmitterSpy).to.have.been.called;
  });

  it('cancels addressing on too many invalid addresses', function(done) {
    let tries,
        finished = false;

    bus.startAddressing()
    .subscribe(null, (err) => {
      expect(tries).to.be.equal(10);
      done();
    });

    for (tries = 0; !finished && tries < 100; tries++) {
      bus.port.receiveData(Buffer.from([5]));
    }
  });

  it('ends addressing with two 0xFF and a NULL message', function(done) {
    bus.startAddressing()
    .subscribe(null, null, () => {
      expect(bus.port.buffer).to.deep.equal([
        0xFF, 0xFF,    // end of addressing 
        0, 0, 0xFF, 0, // null message header
        212, 65]       // CRC
      );
      done();
    });

    // Register 1 node
    bus.port.receiveData(Buffer.from([1]));
    bus.port.buffer = [];
  });

});