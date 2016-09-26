# Node Disco Bus 

[![Build Status](https://api.travis-ci.org/jgillick/node-discobus.svg?branch=master)](http://travis-ci.org//jgillick/node-discobus)

A [Disco Bus protocol](https://github.com/jgillick/Disco-Bus-Protocol) communication library 
for nodejs. At this point the library only implements the master node device.

The Disco Bus protocol, is a versatile master/slave protocol well suited for multidrop networks, like RS485.
[Read more about the protocol spec](https://github.com/jgillick/Disco-Bus-Protocol)

## Examples

### Basic Usage

This example simply sends a single message to node 5 on the bus.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send a message 
//  + command: 0x09
//  + length: 2
//  + destination node address: 0x05
//  + message data: 0x01, 0x02
master.startMessage(0x09, 2, { destination: 0x05})
  .sendData([0x01, 0x02])
  .endMessage();
```

### Get Responses

Asks node 9 to send a 3-byte response for message command `0x06`. 
(for example, this could be asking node 9 the status of it's sensors, buttons or 
current color)

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Get a 3-byte response from node 0x09
master.startMessage(0x06, 3, { 
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

### Addressing

Assigns an address to all the slaves on the bus.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

let master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

bus.startAddressing()
  .subscribe(null, null, () => {
    console.log('Found nodes:', master.nodeNum);
  });

```

## API

TBD
