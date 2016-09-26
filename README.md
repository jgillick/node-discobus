# Node Disco Bus 

[![Build Status](https://api.travis-ci.org/jgillick/node-discobus.svg?branch=master)](http://travis-ci.org//jgillick/node-discobus)

The Disco Bus protocol, is a versatile master/slave protocol well suited for multidrop networks, like RS485.
Put simply, it's an easy way to communication with many devices over two shared wires.
Read more about the [protocol spec here](https://github.com/jgillick/Disco-Bus-Protocol)

This library implements version 1.0 of the protocol spec for a master node.

[![Bus Topology](bus-topology.png)]

## Examples


### Basic Usage

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


## Use an already open serial port

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

### Get Responses

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

### Batch Messages

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

### Batch Response Messages

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

## API

TBD
