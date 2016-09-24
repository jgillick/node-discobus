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

    let ret = bus.startMessage(0x00, 1)
              .sendData(0x00)
              .endMessage()
              .subscribe();

    expect(ret).to.be.instanceOf(DiscoBus);
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
    bus = new DiscoBus();
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
    bus = new DiscoBus();
    function startWrapper() {
      bus.startMessage(0x00, 1);
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
        responseMsg: true
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
        responseMsg: true
      });
      expect(bus._msgOptions.responseDefault).to.deep.equal([0, 0, 0, 0, 0]);
    });

    it('creates partial default response fill data', function() {
    // When length of `responseDefault` does not match the passed message length
      bus.startMessage(0x09, 5, {
        responseMsg: true,
        responseDefault: [1, 2, 3]
      });
      expect(bus._msgOptions.responseDefault).to.deep.equal([1, 2, 3, 0, 0]);
    });

    it('inserts default response when timeout occurs', function(done) {
      bus.startMessage(0x09, 5, {
        responseMsg: true
      });

      bus.subscribe(null, null, () => {
        expect(bus.messageResponse).to.have.lengthOf(5);
        expect(bus.messageResponse).to.deep.equal([0, 0, 0, 0, 0]);
        done();
      });
    });

    it('inserts partial default response when timeout occurs', function(done) {
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

    it('emits an error when prematurely ending a message', function() {
      bus.startMessage(0x09, 5, {
        responseMsg: true
      });
      bus.endMessage();
      expect(errorEmitterSpy).to.have.been.called;
    });
  });

  /**
   * Batch Messages
   */
  describe('Batch response message', function() {

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

  it('enables outgoing daisy line');

  it('confirms valid address');

  it('corrects invalid address');

  it('times out after not receiving an address in x milliseconds');

  it('cancels addressing on too many invalid addresses');

  it('ends addressing with two 0xFF and a NULL message');

  it('resets daisy line after addressing');
  
});