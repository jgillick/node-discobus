# Node Disco Bus 

[![Build Status](https://api.travis-ci.org/jgillick/node-discobus.svg?branch=master)](http://travis-ci.org//jgillick/node-discobus)

The Disco Bus protocol, is a versatile master/slave protocol well suited for multidrop 
networks, like RS485. Put simply, it's an easy way to communication with many devices over 
a pair of twisted wires. For example, maybe you want to communicate with up to 254 
arduino devices.

This library implements the master device side of the communication protocol.
You can read more about the Disco Bus [protocol spec here](https://github.com/jgillick/Disco-Bus-Protocol)

[![Bus Topology](bus-topology.png)]

***

 * [Usage Examples](#usage-examples)
   * [Basic message](#basic-message)
   * [Use an open serial port](#use-an-open-serial-port)
   * [Addressing](#addressing)
   * [Request responses](#request-responses)
   * [Batch messages](#batch-messages)
   * [Batch response messages](#batch-response-messages)

 * [Methods](#methods)
   * [DiscoBusMaster](#api-constructor)
   * [connectTo](#api-connectTo)
   * [connectWith](#api-connectWith)
   * [startMessage](#api-startMessage)
   * [startAddressing](#api-startAddressing)
   * [subscribe](#api-subscribe)
   * [sendData](#api-sendData)
   * [endMessage](#api-endMessage)
   * [setDaisyLine](#api-setDaisyLine)
 * [Properties](#properties)

***

## Usage Examples

### Basic message

This example simply sends a single 3-byte message to node 5 on the bus.
In this case we're sending RGB color values.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send a message 
//  + command: 0x09 (CMD_RGB)
//  + length: 3
//  + destination node address: 0x05
//  + message data: 0x01, 0x02
const CMD_RGB = 0x09
master.startMessage(CMD_RGB, 3, { destination: 0x05 })
  .sendData([0x00, 0x66, 0x20])
  .endMessage();
```


## Use an open serial port

You can use an existing serial port with your master device:

```js
const DiscoBusMaster = require('discobus').DiscoBusMaster;
const SerialPort = require("serialport");

// Open serial port
let port = new SerialPort("/dev/tty-usbserial1", {baudRate: 9600});

// Connect the bus with this port
let master = new DiscoBusMaster();
master.connectWith(port);
```


### Addressing

Dynamically assigns an address to all the slaves on the bus.
Without slave addresses, the only messages that will be received
are broadcast messages (`destination: 0`).

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

bus.startAddressing()
  .subscribe(null, null, () => {
    console.log('Found nodes:', master.nodeNum);
  });

```

### Request responses

Asks node 9 to send a 3-byte response for message command `0x06`. 
(In this case we could be getting te sensor values back from the node)

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Get a 2-byte response from node 0x09
const CMD_SENSORS = 0x06
master.startMessage(CMD_SENSORS, 2, { 
    destination: 0x09,
    responseMsg: true
  }).subscribe(
    null,
    (err) => { console.error(err); },
    () => {
      console.log('Response', master.messageResponse);
    }
  );
```

### Batch messages

We can send RGB values to all two nodes on the bus at once by 
using a batch message.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send the message to all nodes 
const CMD_RGB = 0x09
master.startMessage(CMD_RGB, 3, { batchMode: true })
  .sendData([ 0x00, 0x66, 0x20 ]) // to node 1
  .sendData([ 0x00, 0x66, 0x20 ]) // to node 2
  .endMessage();
```

### Batch response messages

You can received responses from all the messages on the bus with
a batch response message.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send the message to all nodes 
const CMD_SENSORS = 0x06
master.startMessage(CMD_SENSORS, 2, { 
    responseMsg: true,
    batchMode: true
  }).subscribe(
    null,
    (err) => { console.error(err); },
    () => {
      console.log('Node 1', master.messageResponse[0]);
      console.log('Node 2', master.messageResponse[1]); 
    }
  );
```


***


### Methods

### DiscoBusMaster() _constructor_ {#api-constructor}

Creates a Disco Bus Master device.


### connectTo(port:string, options?: {}, callback?: Function) {#api-connectTo}

Connect to a serial device via [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport)

The parameters are the same as passed to the [serialport contructor](https://github.com/EmergingTechnologyAdvisors/node-serialport#new_module_serialport--SerialPort_new)

 * **port**: A string to the serial port to open.
 * **options**: Port configuration options. ([options list](https://github.com/EmergingTechnologyAdvisors/node-serialport#module_serialport--SerialPort..openOptions))
 * **openCallback**: Called when a connection has been opened.

**Returns**: The DiscoBusMaster instance. 


### connectWith(port) {#api-connectWith}

Connect with an existing open port connection. 

 * **port**: A [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport) compatible port object.

The port object passed in needs to have the following methods, which behave like an open [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport)
port:

 * `write(number[])`
 * `drain(callback)`
 * `on('load', callback)`
 * `on('data', callback)`

**Returns**: The DiscoBusMaster instance.


### startMessage (command, length, options) {#api-startMessage}

Start a new message.

 * **command**: The message command.
 * **length**: The length of the data (per node, for batchMode) we're planning to send.
 * **options**: Message options:
   * **destination**: The node we're sending this message to (default: broadcast to all)
   * **batchMode**: Send unique data sections for all nodes in this one message. (i.e. a different RGB color for each node)
   * **responseMsg**: Ask one or more nodes to return some data.
   * **responseDefault**: If a node doesn't response, this is the default response. (used with `responseMsg`).

**Returns**: The DiscoBusMaster instance.


### startAddressing (startFrom) {#api-startAddressing}

Start dynamically addressing all nodes.

  * **startFrom**: (optional) The first address to start from.

**Returns**: The DiscoBusMaster instance.


### subscribe (nextCallback, errorCallback, completeCallback) {#api-subscribe}

Subscribe to the current message observer stream. (this is a wrapper to `messageSubscription.subscribe`)

   * **nextCallback**: Called with the next value (received data or address)
   * **errorCallback**: Called when there is an error
   * **completeCallback**: Called when the message is complete.

**Returns**: The DiscoBusMaster instance.


### sendData(data) {#api-sendData}

Write bytes to the data section of the message.

  * **data**: An array of bytes to send.

**Returns**: The DiscoBusMaster instance.


### endMessage() {#api-endMessage}

Finish the message and send the CRC bytes. This will be called automatically for response messages, 
and should not be called directly, in that case.

**Returns**: The DiscoBusMaster instance.


### setDaisyLine(enabled) {#api-setDaisyLine}

Set's the outgoing daisy line to enabled or disabled, by toggling the port's RTS line.
Override this method to use your own implementation.

  * **enabled**: `true` to set the daisy line to enabled.

**Returns**: A promise which resolves when the daisy line has been set.


 ## Properties

   * **nodeNum**: Number of nodes in the bus.
   * **messageResponse**: The response data from the current/last message.
   * **messageSubscription**: An RXJS hot observable use to watch the process of the current message.
   * **messageCommand**: Get the current message command.
   * **timeouts**: The bus timeout options
     * **nodeResponse**: Number of milliseconds to wait for a node's response. After this timeout, default values will be used instead.
     * **addressing**: End the addressing message if we haven't received a new address in at least this many milliseconds.  
   