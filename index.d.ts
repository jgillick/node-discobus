declare module 'discobus' {

	/**
	 * Implments the Disco Bus protocol for the master device on the network.
	 *
	 * See more about Disco Bus: https://github.com/jgillick/Disco-Bus-Protocol
	 *
	 * See examples in README.md
	 */

	import { Observable, ConnectableObservable } from 'rxjs';

	/**
	 * Bus protocol service class
	 */
	export class DiscoBusMaster {

	  /**
		 * Number of nodes in the bus.
		 */
	  nodeNum: number;

		/**
		 * An RXJS observable use to watch the process of the current message.
		 */
	  messageSubscription: ConnectableObservable<any>;

		/**
		 * The response data from the current/last message.
		 * 
		 * @type number[]
		 */
	  messageResponse: any;

		/**
     * The bus timeout options
     */
    timeouts: {

			/**
			 * Number of milliseconds to wait for a node's response.
			 */
			nodeResponse:number,

			/**
			 * End the addressing message if we haven't received a new address in at least
       * this many milliseconds. This number needs to be sufficiently long to make up
       * for bus/processing latency.
			 */
			addressing:number
		}

	  /**
	   * Get the current message command.
	   */
	  messageCommand: number;

	  constructor();

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
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
		connectTo(port:string, options?: {}, callback?: Function): DiscoBusMaster;

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
		connectWith(port: string): DiscoBusMaster;

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
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
	  startMessage(command: number, length: number, options?: {
	    destination?: number;
	    batchMode?: boolean;
	    responseMsg?: boolean;
	    responseDefault?: number[];
	  }): DiscoBusMaster;

	  /**
		 * Start dynamically addressing all nodes
		 *
		 * @throws {Error} If a new message is started before the previous one completes
		 *
		 * @param {number} startFrom (optional) The address to start from.
		 *
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
		startAddressing (startFrom?: number): DiscoBusMaster;

		/**
		 * Subscribe to the current message observer stream. (this is a wrapper to `messageSubscription.subscribe`)
		 *
		 * @param {Function} nextCallback     Called with the next value (received data or address)
		 * @param {Function} errorCallback    Called when there is an error
		 * @param {Function} completeCallback Called when the message is complete.
		 *
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
		subscribe (nextCallback?: Function, errorCallback?: Function, completeCallback?: Function): DiscoBusMaster;

		/**
		 * Set's the outgoing daisy line to enabled or disabled, by toggling the port's RTS line.
		 * Override this method to use your own implementation.
		 *
		 * @param {boolean} enabled Set the daisy line to enabled.
		 *
		 * @return {Promise}
		 */
		setDaisyLine(enabled: boolean): Promise<void>; 

	  /**
		 * Write data to the message.
		 *
		 * @param {number[]} data An array of bytes.
		 *
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
		sendData(data): DiscoBusMaster;

	  /**
		 * Finish the message and send the CRC bytes.
		 * This will be called automatically for response messags, and should not be
		 * called directly.
		 *
		 * @param {String} error (optional) An error to send to the message observer `error` handler.
		 *
		 * @return {DiscoBusMaster} Instance to this object, for chaining
		 */
		endMessage(error=null): DiscoBusMaster;
	}

}
