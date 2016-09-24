'use strict';

/**
 * Implments the Disco Bus protocol for the master device on the network.
 *
 * See more about Disco Bus: https://github.com/jgillick/Disco-Bus-Protocol
 *
 * Connect to a bus
 * ----------------
 * ```
 *  const DiscoBus = require('discobus');
 *
 *  var bus = new DiscoBus();
 *
 *  // Connect to the '/dev/tty-usbserial1' serial device
 *  bus.connectTo("/dev/tty-usbserial1", {
 *    baudRate: 9600
 *  });
 * ```
 *
 * SENDING A STANDARD MESSAGE
 * ===========================
 * ```
 *  // Send RGB color values to node 2
 *  const CMD_SET_COLOR = 0xA1;
 *  bus.startMessage(CMD_SET_COLOR, 3, {
 *    destination: 2
 *  });
 *  bus.sendData([ 0xFF, 0x00, 0x99 ]);
 *  bus.endMessage();
 * ```
 *
 * BROADCASTING MESSAGES TO ALL NODES
 * ==================================
 * ```
 *  // Send RGB color values to all node
 *  const CMD_SET_COLOR = 0xA1;
 *  bus.startMessage(CMD_SET_COLOR, 3, {
 *    batchMode: true
 *  });
 *  bus.sendData([ 0xFF, 0x00, 0x99 ]); // node 1
 *  bus.sendData([ 0x00, 0x66, 0x20 ]); // node 2
 *  // ...
 *  bus.endMessage();
 * ```
 *
 * ASKING FOR A RESPONSE FROM ALL NODES
 * ====================================
 * ```
 *  // Get the sensor value
 *  const CMD_GET_VALUE = 0xA2;
 *  let source = bus.startMessage(CMD_GET_VALUE, 1, {
 *    batchMode: true,
 *    responseDefault: [0]
 *  });
 *
 *  // Subscribe to responses
 *  source.subscribe(
 *    (resp) => console.log('Real-time response from a single node', resp);
 *    (err) => console.error('ERROR: ', err);
 *    () => console.log('All responses', bus.messageResponse);
 *  )
 * ```
 *
 * NOTE ABOUT SUBSCRIBING
 * ======================
 * The observable that is returned is "hot", meaning it has started by the time
 * you have already started subscribing to it. So the first `next` value you
 * received might not be the first that has been sent.
 *
 * To get all the response values, look at the `messageResponse` property.
 */

import crc from 'crc';
import { Observable, Observer, ConnectableObservable } from 'rxjs';
import EventEmitter from 'events';

const BROADCAST_ADDRESS = 0;
const RESPONSE_TIMEOUT = 20;
const ADDR_RESPONSE_TIMEOUT = 30;
const MAX_ADDRESS_CORRECTIONS = 10;

// Reserved Commands
const CMD = {
  RESET:   0xFA,
  ADDRESS: 0xFB,
  NULL:    0xFF,
};

// Message flags
const FLAGS = {
  BATCH:    0x01,
  RESPONSE: 0x02
};

/**
 * Bus protocol service class
 */
class DiscoBus extends EventEmitter {

  constructor() {
    super();

    ////////////////////////////////////////////
    // Public members
    ////////////////////////////////////////////

    /**
     * Number of nodes in the bus.
     *
     * @type {int}
     */
    this.nodeNum = 0;

    /**
     * The response data from the current/last message.
     *
     * @type {int[]} Array of bytes
     */
    this.messageResponse = [];

    /**
     * An RXJS observable use to watch the process of the current message.
     *
     * @type ConnectableObservable
     */
    this.messageSubscription = null;

    /**
     * The bus timeout options
     *
     * @type {Object}
     */
    this.timeouts = {

      /**
       * A node should respond in this many milliseconds to a response message,
       * otherwise, default values will be used instead.
       *
       * @type {int}
       */
      nodeResponse: RESPONSE_TIMEOUT,

      /**
       * End the addressing message if we haven't received a new address in at least
       * this many milliseconds. This number needs to be sufficiently long to make up
       * for bus/processing latency.
       */
      addressing: ADDR_RESPONSE_TIMEOUT
    }

    ////////////////////////////////////////////
    // Private members
    ////////////////////////////////////////////
    this._crc = [];

    this._msgOptions = {};
    this._msgCommand = 0;
    this._msgDone = true;
    this._dataLen = 0;
    this._fullDataLen = 0;
    this._sentLen = 0;

    this._responseDefault = [0x00];
    this._responseTimer = null;
    this._responseCount = 0;

    this._promiseResolvers = null;

    this._messageObserver = null;
    this._addressCorrections = 0;
    this._addressing = false;
  }

  /**
   * Connect to a serial device via node-serialport.
   *
   * ```
   *  bus.connectTo("/dev/tty-usbserial1", {
   *    baudRate: 9600
   *  });
   * ```
   *
   * @param {String}   port     Serial device port name or path
   * @param {Object}   options  The same options used to open a port with node-serialport
   *                            https://github.com/EmergingTechnologyAdvisors/node-serialport/blob/4.0.1/README.md#usage
   * @param {Function} callback A callback called after the port has been opened (or returns an error)
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  connectTo(port, options, callback) {
    var SerialPort = require("serialport");
    this.port = new SerialPort(port, options, callback);
    this.connectWith(this.port);

    return this;
  }

  /**
   * Pass an already connected device port to read and write from.
   *
   * This port needs to follow the same object interface as node-serialport's SerialPort object.
   * Most importantly, it needs to have the following:
   *    + port.on('data', function(){});
   *    + port.write(data)
   *    + port.drain()
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  connectWith(port) {

    // Create handlers
    if (!this.__onData) {
      this.__onData = function(d) {
        this._handleData(d);
      }.bind(this);
    }
    if (!this.__onOpen) {
      this.__onOpen = function() {
        this._serial.setDaisy(false); 
      }.bind(this);
    }

    // Detach from previous port
    if (this.port) {
      this.port.removeListener('data', this.__onData);
      this.port.removeListener('open', this.__onOpen);
    }

    // Add handlers
    port.on('data', this.__onData);
    port.on('open', this.__onOpen);

    this.port = port;
  }

  /**
   * Get the current message command.
   */
  get messageCommand() {
    return this._msgCommand;
  }


  /**
   * Start a new message.
   * Unless it is a response message, it will need to be closed with `endMessage()`.
   *
   * @throws {Error} If a new message is started before the previous one completes
   *
   * @param {number} command The message command.
   * @param {number} length The length of the data (per node, for batchMode) we're planning to send.
   * @param {Object} options Other message options (see section below.)
   *
   * MESSAGE OPTIONS
   *  + destination {number}       - The node we're sending this message to (default: broadcast to all)
   *  + batchMode   {boolean}      - True if we're sending data for each node in this one message.
   *                                 (only for broadcast messages)
   *  + responseMsg {boolean}      - True if we are asking nodes for a response.
   *  + responseDefault {number[]} - If a node doesn't response, this is the default response.
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  startMessage (command, length, options={}) {

    // ERROR. Previous message hasn't finished
    if (!this._msgDone) {
      throw new Error('Previous message has not finished.');
    }

    // Check that we have a port object
    if (!this.port) {
      throw new Error('No output port has been defined. See "connectTo()" and "connectWith()"');
    }

    const defaultOptions = {
      destination: BROADCAST_ADDRESS,
      batchMode: false,
      responseMsg: false,
      responseDefault:[0]
    };

    let flags = 0;
    let header = [];

    options = Object.assign({}, defaultOptions, options);

    this._msgDone = false;
    this._crc = [];
    this._msgOptions = options;
    this._msgCommand = command;
    this._dataLen = length;
    this._fullDataLen = this._dataLen;
    this._responseCount = 0;
    this._sentLen = 0;
    this._promiseResolvers = [];

    this.messageResponse = [];

    this._createMessageObserver();

    // Default response values
    if (options.responseMsg) {
      if (!options.responseDefault) {
        options.responseDefault = [];
      }
      options.responseDefault.splice(this._dataLen); // cut down to the right size

      // Fill rest of array with zeros
      if (options.responseDefault.length < this._dataLen) {
        let start = options.responseDefault.length;
        options.responseDefault[this._dataLen - 1] = 0;
        options.responseDefault.fill(0, start);
      }
    }

    // Set flags
    if (options.batchMode) {
      flags |= FLAGS.BATCH;
    }
    if (options.responseMsg) {
      flags |= FLAGS.RESPONSE;
    }

    // Header
    header = [
      flags,
      options.destination,
      command
    ];

    // Lengths
    if (options.batchMode) {
      header.push(this.nodeNum);
      this._fullDataLen = length * this.nodeNum;
    } else {
      header.push(1);
    }
    header.push(length);

    // Send header
    this._sendBytes([0xFF, 0xFF], false)
    this._sendBytes(header);

    // Start response timer
    if (options.responseMsg && command !== CMD.ADDRESS) {
      this._startResponseTimer();
    }

    // Message observer
    return this;
  }

  /**
   * Start dynamically addressing all nodes
   *
   * @throws {Error} If a new message is started before the previous one completes
   *
   * @param {number} startFrom (optional) The address to start from.
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  startAddressing (startFrom=0) {

    // ERROR. Previous message hasn't finished
    if (!this._msgDone) {
      throw new Error('Previous message has not finished.');
    }

    // Check that we have a port object
    if (!this.port) {
      throw new Error('No output port has been defined. See "connectTo()" and "connectWith()"');
    }

    this.nodeNum = startFrom;
    this.messageResponse = [];

    this._msgDone = false;
    this._crc = [];
    this._msgOptions = {};
    this._msgCommand = CMD.ADDRESS;
    this._sentLen = 0;
    this._dataLen = 0;
    this._fullDataLen = 0;
    this._addressing = true;
    this._addressCorrections = 0;
    this._promiseResolvers = [];

    this._createMessageObserver();
    this.setDaisyLine(false);

    // Start address message
    this.startMessage(CMD.ADDRESS, 2, { batchMode: true, responseMsg: true });

    // Set daisy and send first address
    this.port.drain(() => {
      this.setDaisyLine(true);
      this._sendBytes(startFrom);

      this._startResponseTimer(); // timeout counter
    });

    return this;
  }

  /**
   * Subscribe to the current message observer stream. (this is a wrapper to `messageSubscription.subscribe`)
   *
   * @param {Function} nextCallback     Called with the next value (received data or address)
   * @param {Function} errorCallback    Called when there is an error
   * @param {Function} completeCallback Called when the message is complete.
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  subscribe (nextCallback, errorCallback, completeCallback) {
    this.messageSubscription.subscribe(nextCallback, errorCallback, completeCallback);
    return this;
  }

  /**
   * Set's the outgoing daisy line to enabled or disabled, by toggling the port's RTS line.
   * Override this method to use your own implementation.
   *
   * @param {boolean} enabled Set the daisy line to enabled.
   *
   * @return {Promise}
   */
  setDaisyLine(enabled) {
    return new Promise ( (resolve, reject) => {
      if (!this.port) {
        reject('There is no open connection');
      }

      this.port.set({rts:enabled}, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Write data to the message.
   *
   * @param {number[]} data An array of bytes.
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  sendData(data) {
    if (this._msgDone) {
      this.emit('error', 'There is no message to put data in. Call "startMessage()" first.');
      return;
    }

    if (typeof data.length === 'undefined') {
      data = [data];
    }

    this._sentLen += data.length;

    if (this._sentLen > this._fullDataLen) {
      this._messageObserver.error('Cannot send more data than the defined length ('+ this._fullDataLen +')');
      return;
    }

    this._sendBytes(data);

    return this;
  }

  /**
   * Finish the message and send the CRC bytes.
   * This will be called automatically for response messags, and should not be
   * called directly.
   *
   * @param {String} error (optional) An error to send to the message observer `error` handler.
   *
   * @return {DiscoBus} Instance to this object, for chaining
   */
  endMessage(error=null) {

    if (this._msgDone) {
      this.emit('error', 'There is no message to end. Call "startMessage()" first.');
      return;
    }


    // End addressing message
    if (this._addressing) {
      this._addressing = false;

      // Send 0xFF twice, if not already
      if (this.nodeNum < 255) {
        this._sendBytes([0xFF, 0xFF]);
      }

      // Send null message to wrap things up (in case the double 0xFF are seen as a start of a message)
      this._crc = [];
      this._sendBytes([
        0x00,     // flags
        0x00,     // broadcast address
        CMD.NULL, // NULL command
        0,        // length
      ]);
    }
    
    // Can't end response message until all responses have been received
    if(this._msgOptions.responseMsg && this._responseCount < this._fullDataLen) {
      this.emit('error', 'Cannot end the message until all responses have been received.');
      return;
    }
    
    // Fill in missing data 
    if (!this._msgOptions.responseMsg && this._sentLen < this._fullDataLen) {
      let missingLen = this._fullDataLen - this._sentLen;
      let fill = new Array(missingLen).fill(0);
      this.sendData(fill);
    }

    // Send CRC
    let crcValue = crc.crc16modbus(this._crc, 0xFFFF);
    let crcBytes = this._convert16bitTo8(crcValue);
    this._sendBytes(crcBytes, false);

    // Reset daisy and end message
    this.setDaisyLine(false);
    this._msgDone = true;

    // Resolve message observer
    if (this._messageObserver) {

      if (error) {
        this._messageObserver.error(error);
        return;
      }

      this.port.drain( (err) => {
        if (err) {
          this._messageObserver.error(err);
        }
        this._messageObserver.complete();
      });
    }

    return this;
  }

  /**
   * Create a hot observer for the current message
   */
  _createMessageObserver() {
    let source = Observable.create( (obs) => {
      this._messageObserver = obs;
    });

    this.messageSubscription = source.publish();
    this.messageSubscription.connect();

    return this.messageSubscription;
  }


  /**
   * Handle new data returned from the bus
   *
   * @param {Buffer} data A buffer of new data from the serial connection
   */
  _handleData(data) {
    if (this._msgDone) return;

    this._restartResponseTimer();

    // Address responses
    if (this._addressing) {
      let addr = data.readUInt8(data.length - 1); // We only care about the last byte received

      // Verify it's 1 larger than the last address
      if (addr == this.nodeNum + 1) {
        this.nodeNum++;
        this._addressCorrections = 0;
        this._sendBytes(this.nodeNum); // confirm address
        this._messageObserver.next(this.nodeNum);
      }
      // Invalid address
      else {
        this._addressCorrections++;

        // Max tries, end in error
        if (this._addressCorrections > MAX_ADDRESS_CORRECTIONS) {
          this.endMessage('maximum address corrections');
        }
        // Address correction: send 0x00 followed by last valid address
        else {
          this._sendBytes(0x00);
          this._sendBytes(this.nodeNum);
        }
      }
    }
    // Response data
    else if (this._msgOptions.responseMsg) {
      this._pushDataToResponse(data);

      // End message if we've received everything
      if (this._responseCount >= this._fullDataLen) {
        this.endMessage();
      }
    }
  }

  /**
   * The timeout fired while waiting for a node to respond to the message
   */
  _handleResponseTimeout() {
    if (this._msgDone) return;

    // Addressing timeout
    if (this._addressing) {
      this.endMessage();
    }
    // Response message
    else if (this._msgOptions.responseMsg) {
      let dataDone = this._fillNextResponse();
      if (dataDone) {
        this.endMessage();
      } else {
        this.port.drain(() => {
          this._restartResponseTimer();
        });
      }
    }
  }

  /**
   * Fill in the next section of response data with default response data.
   *
   * For a batch response message, it fills in the missing data for the current responding node.
   * For a standard response message, if fills in the rest of the data section.
   *
   * @returns {Boolean} Returns `true` if all the data sections for this message has been sent.
   */
  _fillNextResponse() {
    let buff = this.messageResponse;

    if (this._msgOptions.batchMode) {
      let index = this._getResponseNodeIndex();
      buff = this.messageResponse[index] || [];
    }

    // Fill in missing node message data
    let fill = this._msgOptions.responseDefault.slice(buff.length);
    if (fill.length > 0) {
      this._pushDataToResponse(Buffer.from(fill));
      this._sendBytes(fill);
    }

    return (this._responseCount >= this._fullDataLen);
  }

  /**
   * Push received data to the proper sections in the reponse object
   *
   * @param {Buffer} data The data to push to the response arrays
   */
  _pushDataToResponse(data) {
    if (this._msgDone) return;

    // Break it up across node arrays
    if (this._msgOptions.batchMode) {
      for (let i = 0; i < data.length; i++) {
        let buff;
        let byte = data.readUInt8(i);
        let n = this._getResponseNodeIndex();

        if (n === -1) return; // Response buffer full)
        buff = this.messageResponse[n];
        buff.push(byte);

        // Full node message, inform the observable
        if (buff.length === this._dataLen) {
          this._messageObserver.next({
            node: n,
            data: buff
          });
        }

        this._responseCount++;
      }

    } else {
      let lenLeft = this._fullDataLen - this.messageResponse.length;

      if (lenLeft > 0) {
        data = data.slice(0, lenLeft);

        for (let i = 0; i < data.length; i++) {
          let byte = data.readUInt8(i);
          this.messageResponse.push(byte);
          this._messageObserver.next(byte);
          this._responseCount++;
        }
      }
    }
  }

  /**
   * Return the message response node index we're currently processing.
   * For messages that are not batch mode (single message responses) this will always be 0.
   * This returns -1 when all data has been received.
   *
   * @return {number}
   */
  _getResponseNodeIndex() {
    if (this._msgOptions.batchMode && this._msgOptions.responseMsg) {
      let i = this.messageResponse.length - 1;

      if (i < 0) {
        i = 0;
      }
      // This node's response is full, move to the next node
      else if (this.messageResponse[i] && this.messageResponse[i].length === this._dataLen) {
        i++;
      }

      // All nodes have returned, return -1
      if (i > this.nodeNum) {
        return -1;
      }

      // Init the next response group
      if (typeof this.messageResponse[i] === 'undefined') {
        this.messageResponse[i] = [];
      }
      return i;
    }
    else {
      // If all data has been received, return -1
      if (this.messageResponse[0] && this.messageResponse[0].length >= this._dataLen) {
        return -1;
      }
    }
    return 0;
  }

  /**
   * Start the timeout counter for addressing or node responses.
   */
  _startResponseTimer() {
    this._stopResponseTimer();

    if (this._msgDone) return;

    // Start timer once data has sent
    this.port.drain(() => {
      let timeout = (this._addressing) ? this.timeouts.addressing : this.timeouts.nodeResponse;
      this._responseTimer = setTimeout(this._handleResponseTimeout.bind(this), timeout);
    });
  }

  /**
   * Resets the message response timeout timer.
   */
  _restartResponseTimer() {
    this._startResponseTimer();
  }

  /**
   * Stop the timeout counter for addressing or node responses.
   */
  _stopResponseTimer() {
    if (this._responseTimer) {
      clearTimeout(this._responseTimer);
      this._responseTimer = null;
    }
  }

  /**
   * Send multiple bytes (or a single byte) to the serial connection and update the CRC value.
   *
   * @param {number[]} values The byte or bytes to send.
   * @param {boolean} updateCRC Set this to false to not update the CRC with this byte
   */
  _sendBytes(values, updateCRC=true) {
    let buff;

    if (typeof values.length !== 'undefined') {
      buff = Buffer.from(values);
    }
    else {
      buff = Buffer.from([values]);
    }

    this.port.write(buff);

    if (updateCRC) {
      for (let i = 0; i < buff.length; i++) {
        this._crc.push(buff.readUInt8(i));
      }
    }
  }

  /**
   * Split a 16-bit number into two 8-bit numbers.
   *
   * Tip: you can then use `num.toString(16)` to get the hex value.
   *
   * @param {number} value The 16-bit number to split
   *
   * @return {Array} An array of two 8-bit numbers.
   */
  _convert16bitTo8 (value) {
    return [
        (value >> 8) & 0xFF,
        value & 0xFF,
    ];
  }
}

module.exports = DiscoBus;
