# Disco Bus communication library 

[![Build Status](https://travis-ci.org/jgillick/node-discobus.svg?branch=master)](https://travis-ci.org/jgillick/node-discobus)

The Disco Bus protocol, is a versatile master/slave protocol well suited for multidrop 
networks, like RS485. Put simply, it's an easy way to communication with many devices over 
a pair of twisted wires. For example, maybe you want to communicate with up to 254 
arduino devices.

This library implements the master device side of the communication protocol.
You can read more about the Disco Bus [protocol spec here](https://github.com/jgillick/Disco-Bus-Protocol)

![Bus Topology](bus-topology.png)

***

 * [Usage Examples](#usage-examples)
   * [Basic message](#basic-message)
   * [Use an open serial port](#use-an-open-serial-port)
   * [Addressing](#addressing)
   * [Request responses](#request-responses)
   * [Batch messages](#batch-messages)
   * [Batch response messages](#batch-response-messages)

 * [Methods](#methods)
   * [DiscoBusMaster _constructor_](#discobusmaster-constructor)
   * [connectTo](#connectto-port-options-callback)
   * [connectWith](#connectwith-port)
   * [startMessage](#startmessage-command-length-options)
   * [startAddressing](#startaddressing-startfrom)
   * [subscribe](#subscribe-nextcallback-errorcallback-completecallback)
   * [sendData](#senddata-data)
   * [endMessage](#endmessage-)
   * [setDaisyLine](#setdaisyline-enabled)
 * [Properties](#properties)
 * [License](#license)

***

## Usage Examples

### Basic message

This example simply sends a single 3-byte message to node 5 on the bus.
In this case we're sending RGB color values.

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

// Create master device and connect it to a serial port  
var master = new DiscoBusMaster();
master.on('error', console.error);
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send a message 
//  + command: 0x09 (CMD_RGB)
//  + length: 3
//  + destination node address: 0x05
//  + message data: 0x00, 0x66, 0x20
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
var port = new SerialPort("/dev/tty-usbserial1", {baudRate: 9600});

// Connect the bus with this port
var master = new DiscoBusMaster();
master.on('error', console.error);
master.connectWith(port);
```


### Addressing

Dynamically assigns an address to all the slaves on the bus.
Without slave addresses, the only messages that will be received
are broadcast messages (`destination: 0`).

```js
const DiscoBusMaster = require('discobus.js').DiscoBusMaster;

var master = new DiscoBusMaster();
master.on('error', console.error);
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
var master = new DiscoBusMaster();
master.on('error', console.error);
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Get a 2-byte response from node 0x09
const CMD_SENSORS = 0x06
master.startMessage(CMD_SENSORS, 2, { 
  destination: 0x09,
  responseMsg: true
})
.subscribe(
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
var master = new DiscoBusMaster();
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
var master = new DiscoBusMaster();
master.connectTo('/dev/ttyUSB0', {baudRate: 9600});

// Send the message to all nodes 
const CMD_SENSORS = 0x06
master.startMessage(CMD_SENSORS, 2, { 
  responseMsg: true,
  batchMode: true
})
.subscribe(
  null,
  (err) => { console.error(err); },
  () => {
    console.log('Node 1', master.messageResponse[0]);
    console.log('Node 2', master.messageResponse[1]); 
  }
);
```


***


# Methods

## DiscoBusMaster() _constructor_ 

Creates a Disco Bus Master device.


## connectTo (port, options, callback)

Connect to a serial device via [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport)

_**Parameters:**_

These are the same as passed to the [serialport contructor](https://github.com/EmergingTechnologyAdvisors/node-serialport#new_module_serialport--SerialPort_new)

 * `port`: A string to the serial port to open.
 * `options`: Port configuration options. ([options list](https://github.com/EmergingTechnologyAdvisors/node-serialport#module_serialport--SerialPort..openOptions))
 * `openCallback`: Called when a connection has been opened.

**Returns**: The DiscoBusMaster instance. 


## connectWith (port)

Connect with an existing open port connection. 

_**Parameters**_

 * `port`: A [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport) compatible port object.

The port object passed in needs to have the following methods, which behave like an open [node-serialport](https://github.com/EmergingTechnologyAdvisors/node-serialport)
port:

 * `write(number[])`
 * `drain(callback)`
 * `on('load', callback)`
 * `on('data', callback)`

**Returns**: The DiscoBusMaster instance.


## startMessage (command, length, options)

Start a new message.

_**Parameters**_

 * `command`: The message command.
 * `length`: The length of the data (per node, for batchMode) we're planning to send.
 * `options`: Message options:
   * `destination`: The node we're sending this message to (default: broadcast to all)
   * `batchMode`: Send unique data sections for all nodes in this one message. (i.e. a different RGB color for each node)
   * `responseMsg`: Ask one or more nodes to return some data.
   * `responseDefault`: If a node doesn't response, this is the default response. (used with `responseMsg`).

**Returns**: The DiscoBusMaster instance.


## startAddressing (startFrom)

Start dynamically addressing all nodes.

_**Parameters**_

  * `startFrom`: (optional) The first address to start from.

**Returns**: The DiscoBusMaster instance.


## subscribe (nextCallback, errorCallback, completeCallback)

Subscribe to the current message observer stream. (this is a wrapper to `messageSubscription.subscribe`)

_**Parameters**_

   * `nextCallback`: Called with the next value (received data or address)
   * `errorCallback`: Called when there is an error
   * `completeCallback`: Called when the message is complete.

**Returns**: The DiscoBusMaster instance.


## sendData (data)

Write bytes to the data section of the message.

_**Parameters**_

  * `data`: An array of bytes to send.

**Returns**: The DiscoBusMaster instance.


## endMessage ()

Finish the message and send the CRC bytes. This will be called automatically for response messages, 
and should not be called directly, in that case.

**Returns**: The DiscoBusMaster instance.


## setDaisyLine (enabled)

Set's the outgoing daisy line to enabled or disabled, by toggling the port's RTS line.
Override this method to use your own implementation.

_**Parameters**_

  * `enabled`: `true` to set the daisy line to enabled.

**Returns**: A promise which resolves when the daisy line has been set.


# Properties

   * **nodeNum**: Number of nodes in the bus.
   * **messageResponse**: The response data from the current/last message.
   * **messageSubscription**: An RXJS hot observable use to watch the process of the current message.
   * **messageCommand**: Get the current message command.
   * **timeouts**: The bus timeout options
     * **nodeResponse**: Number of milliseconds to wait for a node's response. After this timeout, default values will be used instead.
     * **addressing**: End the addressing message if we haven't received a new address in at least this many milliseconds.  
   
***

# License

> MIT License
> 
> Copyright (c) 2016 Jeremy Gillick
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.