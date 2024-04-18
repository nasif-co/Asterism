/*
Asterism

XBee coordinator must be connected through a serial port (specified down below).
The PANID for the XBees is 1996.
*/


/*---------------------------------------------------------------------------------------------------------------------------------
--Variables------------------------------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------------------------------------*/
//Options variables-----------------------------------------------------------------------
/* Variables that can be manually changed to tweak the system */
const controllerList = {
	red: "C59",
	green: "DD3",
	blue: "C5E",
}
//IDs of active controllers and their colors

const lifxMAC = [
	'd073d52bb7d9', 
	'd073d52c02ee', 
	'd073d52bcca5', 
	'd073d52bdb86', 
	'd073d52bea9c', 
	'd073d52bd838',
	'd073d52c14e1',
	'd073d52bea32',
	'd073d52bd3bb',
	'd073d52be27f',
];
//MAC addresses of all bulbs used in the program, in their physical order

const maxBrightness = 255;
//Max value of brightness that the bulbs should reach. 0-255.

const minBrightness = 0;
//Min value of brightness that the bulbs should be at. 0-255

const maxSaturation = 0.1;
//Max saturation of LIFX colors. 0-1 (decimals)

const bulbFrameRate = 8;
//Animation framerate for the bulbs. Larger means more bandwidth.

const xbeePort = "/dev/tty.usbserial-DN05LSUY";
//Seria port path for the coordinator XBee connected to the computer
//When in raspberry pi use "/dev/ttyUSB0"

const finalSyncDelay = 800;
//Milliseconds before a new light position is sync'ed to all colors.


//System variables------------------------------------------------------------------------
/* Internal variables and objects not meant to be changed */
var util = require('util');



/*---------------------------------------------------------------------------------------------------------------------------------
--LIFX and Controllers-------------------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------------------------------------*/
//JSON memory-----------------------------------------------------------------------------
var fs = require('fs');
var lastTen;
var exists = fs.existsSync('JSON_data/lastTen.json');
if(exists){
	lastTen = JSON.parse(fs.readFileSync('JSON_data/lastTen.json','utf8'));
	console.log("Read back last ten messages received from: 'JSON_data/lastTen.json'");
}else{
	lastTen = {
		"message": []
	};
}


//LIFX Setup------------------------------------------------------------------------------
//Lifx package
var LifxClient = require('lifx-lan-client').Client;
var client = new LifxClient();

//System variables
var bulbs = [];
//array that holds the outdoor lights in order

//Lifx bulb discovery and initialization
client.on('light-new', function(light){registerLights(light);}); //Register the LIFx Lights
client.on('light-online', function(light){registerLights(light);}); //Register the LIFx Lights
client.on('light-offline', function(light){deRegisterLights(light);}); //Register the LIFx Lights
client.init();

function registerLights(light){
	if( lifxMAC.includes( light.id ) ){
		let position = lifxMAC.findIndex( element => element == light.id );
		light.colorRgb( minBrightness, minBrightness, minBrightness, 200 );

		bulbs.push( {
			idealPosition: position,
			lifx: light,
			color: [ minBrightness, minBrightness, minBrightness ],
		} );
		bulbs.sort(function(a, b){return a.idealPosition - b.idealPosition});

		console.log('                                                LIFX::: Bulb ' + (position + 1) + ' registered.');
	}else{
		console.log('                                                LIFX::: Unknown light in the network, id: ' + light.id)
	}
}

function deRegisterLights(light) {
	let currentKey = null;
	for (let i = 0; i < bulbs.length; i++) {
		if( light.id == bulbs[i].lifx.id ) {
			currentKey = i;
			break;
		}
	}
	if( currentKey != null ){
		console.log('                                                LIFX::: Bulb ' + (bulbs[currentKey].idealPosition + 1) + ' disconnected.');
		bulbs.splice(currentKey, 1);
	}
}


//XBee Setup------------------------------------------------------------------------------
const { SerialPort } = require('serialport')
var xbee_api = require('xbee-api');
var C = xbee_api.constants;

var xbeeAPI = new xbee_api.XBeeAPI({
	api_mode: 2
});

var serialport = new SerialPort( { 
	path: xbeePort,
	baudRate: 115200 //Be careful when reprogramming the coordinator, the baudRate sometimes is reset to 9600 in XCTU
});
serialport.pipe(xbeeAPI.parser);
xbeeAPI.builder.pipe(serialport);


function sendTX(payload){
	var frameToSend = {
		type: 0x10,
		id: 0x00,
		options: 0x01,
		destination64: "000000000000FFFF", //broadcast //Add this as an argument.
		destination16: "FFFE",
		data: payload,
	};
	xbeeAPI.builder.write(frameToSend);
}


//Main program----------------------------------------------------------------------------

/**** Initialize program on establishing serial connection with XBee ****/

serialport.on("open",function(){
	xbeeAPI.parser.on("data", xbeeHandleMessage);
	//Attaches the message handler to the message received event

	setInterval(sendPosition,200);
	//In charge of sending the new positions to the sliders

	setInterval(checkForOverflow,1700); 
	//Regulates the send speed to avoid overflowing the microcontrollers with messages

	setInterval(standbyUpdater,(20*60000)); 
	//Sends the current position to the sliders every 20 min, making sure they are all in sync
});



/****** Function that sends out data to controllers when available ******/

var waitingToSend = false; 
//True if the program is in the waiting period before sending a new global position message

function sendPosition(){
	if( ( ( sliderPosition.current != sliderPosition.previous ) || ( standbyUpdate ) ) && !waitingToSend ){
		waitingToSend = true;
		standbyUpdate = false;

		recentMessages++;
		if(recentMessages>9) recentMessages = 9;
		//Printed to visualize flow control
		//console.log(recentMessages);

		setTimeout( 
			function(){
				sendTX("CON|".concat(owner,"|",sliderPosition.current));
				console.log("----------------------------------------------------New Position: ".concat(sliderPosition.current));
				waitingToSend = false;
			},
			flowControl[recentMessages]
		);
		sliderPosition.previous = sliderPosition.current;
	}
}



/********* Control the frequency of messages to the controllers *********/

var flowControl = [0,100,200,300,500,1000,1700,1700,1700,2000,2000]; 
//Array that changes the time between each message according
//to how many messages have been sent in the last 1700ms

var recentMessages = 0; 
//Keeps count of how many messages have been sent out to the modules in the last 1700ms

var prevRecentMessages = 0; 
//Used to compare w/ recentMessages, to see if it has changed (ie. a new message was just sent)

function checkForOverflow(){
	if( prevRecentMessages != recentMessages ){
		prevRecentMessages = recentMessages
	}else{ //There has been a whole 1700ms w/o messages
		recentMessages = 0;
		prevRecentMessages = 0;
	}
}



/****** Periodically synchronize all slider positions just in case ******/

var standbyUpdate = false; 
//Used to override normal checks before sending a message, in order to synchronize lights

function standbyUpdater(){
	if( recentMessages == 0 ){
		standbyUpdate = true;
		owner = "COORD";
		console.log("::::::::::::::::::::Synchronized Sliders");
	}
}



/*********************** Process incoming messages **********************/

var finalSyncTimeout = null;
//Identifier for the final sync event that synchronizes all controllers after
//one stopped moving. Keeping it in a variable allows to overwrite it.

var owner; 
//String that holds the owner module of the last "FINAL" message received

var sliderPosition = {
	current: 0,
	previous: 0,
	next: 0,
}
//Position of the controllers' potentiometers (both current and last received). 0-500.

function xbeeHandleMessage(frame) { //Whenever data is received
	if(frame.type==0x90){ //Make sure it is a normal data packet
		var received = frame.data.toString('utf8') //save the data
		console.log(">>", received); //print it to console
		var words = received.split('|'); //Split it by the delimiter (a single pipe symbol: | )

		visualize(words[0],words[1],constrain(parseInt(words[3],10),0,500)); //Send data to web server visualization

		if(words[0]=="FINAL"){ //If it is a message received when the user has moved the slider and stopped
			owner = words[1]; //Save the owner of the message 
			sliderPosition.next = parseInt( words[3] ,10);

			clearTimeout(finalSyncTimeout);
			finalSyncTimeout = setTimeout( function(){
				sliderPosition.current = sliderPosition.next; //Save the new light position in an int. This will trigger sendPosition()
				for (const key in sublights) {
					sublights[key].position = constrain(sliderPosition.current,0,500);
				}
				moveLightObject(); //Run function that updates the lights according to the final pot movement (argument is brightness 0-100)
			}, finalSyncDelay);
		}else if(words[0]=="STR"){ //If it is a message received when the user is struggling with another
			owner = "COORD"; //Set the owner as the coordinator so everyone receives it equally and the position is correctly set
			sender = words[1]; //Save the owner of the message 
			for (const key in sublights) {
				if(sublights[key].owner == sender){
					sublights[key].position = constrain(parseInt(words[3],10),0,500);
				}
			}
			moveLightObject();
			sliderPosition.current = parseInt(words[3], 10); //Save the position as an int. This will trigger sendPosition()

			clearTimeout(finalSyncTimeout);
			finalSyncTimeout = setTimeout( function(){
				for (const key in sublights) {
					sublights[key].position = constrain(sliderPosition.current,0,500);
				}
				moveLightObject(); //Run function that updates the lights according to the final pot movement (argument is brightness 0-100)
			}, 1000);

		}else if(words[0]=="CON"){ //Else if the message is received during the movement of a slider
			//lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
			let sender = words[1];
			for (const key in sublights) {
				if(sublights[key].owner == sender){
					sublights[key].position = constrain(parseInt(words[3],10),0,500);
				}
			}
			moveLightObject(); //Run function that updates the lights according to current pot movement (argument is brightness 0-100)
		}
	}else{ //It was another sort of packet, print out the details for debugging:
		console.log("********Got something odd*********");
		console.log("Type: ".concat(frame.type));
		console.log("Data: ".concat(frame.data.toString('utf8')));
		console.log("********End oddity***************");
	}
}



/**************** Animate the light motion with the bulbs ***************/

//Detailed data for each color of light
var sublights = {
    red: {
        owner: controllerList.red,
        position: 0,
		smoothedPos: 0,
		vel: 0,
    },
    green: {
        owner: controllerList.green,
        position: 0,
		smoothedPos: 0,
		vel: 0,
    },
    blue: {
        owner: controllerList.blue,
        position: 0,
		smoothedPos: 0,
		vel: 0,
    },
}

//Smoothing algorithm from https://www.youtube.com/watch?v=VWfXiSUDquw
let drag = 0.1; //0.75
let strength = 0.5; //0.05

let animationInterval = null;
  
function moveLightObject(){
	//The position of each light comes in between 0 and 500
	if( animationInterval == null && ( Math.abs( sublights.red.smoothedPos - sublights.red.position) > 0 || Math.abs( sublights.green.smoothedPos - sublights.green.position) > 0 || Math.abs( sublights.blue.smoothedPos - sublights.blue.position) > 0  ) ){
		animationInterval = setInterval( function(){
			//Move lights
			for (const key in sublights) {
				sublights[key];

				let force = sublights[key].position - sublights[key].smoothedPos;
				force *= strength;
				sublights[key].vel *= drag;
				sublights[key].vel += force;
				sublights[key].smoothedPos += sublights[key].vel;
			}

			//Calculate bulb colors according to light positions
			for (const key of bulbs.keys()) {
				let intervalSize = 500/(bulbs.length - 1);
				let bulbColor = [];
				let colorCounter = 0;
				for (const color in sublights) {
					bulbColor[colorCounter] = Math.floor( constrain( constrain(map(sublights[color].smoothedPos, intervalSize*(key-1), intervalSize*key,0,1),0,1)*maxBrightness - constrain(map(sublights[color].smoothedPos,intervalSize*key,intervalSize*(key+1),0,1),0,1)*maxBrightness, minBrightness, maxBrightness) );
					colorCounter++;
				}

				//Send values to bulb only if they are different from the last sent values
				if( !arraysAreEqual(bulbColor, bulbs[key].color) ){
					//Previously used line that set the color directly
					//bulbs[key].lifx.colorRgb(bulbColor[0],bulbColor[1],bulbColor[2],1000/bulbFrameRate);
					
					//New method allos for independent control over the color saturation
					const filteredColor = rgbLimitSaturation(bulbColor[0], bulbColor[1], bulbColor[2], maxSaturation);
					bulbs[key].lifx.colorRgb(filteredColor[0], filteredColor[1], filteredColor[2], 1000/bulbFrameRate);

					bulbs[key].color = bulbColor;
				}
			}

			//Check if bulbs reached final destination and end animation if so
			if( Math.abs( sublights.red.smoothedPos - sublights.red.position) < 0 && Math.abs( sublights.green.smoothedPos - sublights.green.position) < 0 && Math.abs( sublights.blue.smoothedPos - sublights.blue.position) < 0 ){
				//Arrived at destination
				clearInterval(animationInterval);
				animationInterval = null;
			}

		}, 1000/bulbFrameRate);
	}
}



/*---------------------------------------------------------------------------------------------------------------------------------
--Web visualizer-------------------------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------------------------------------*/
//Express setup: Web Server
var express = require('express');
var app = express();
var webServer = app.listen(3000); //Start Web Server on port 3000
app.use(express.static('public')); //Host the files in the 'public' folder on the server
//End express setup

//Socket setup: Communication with the web visualization
var socket = require('socket.io');
var io = socket(webServer); //Object that keeps track of inputs and outputs of the Web Server
io.sockets.on('connection', initVisualization); //use this to trigger a function on connection to the website. The function will take socket as argument
//socket.on('name of message', <insertfunctionhere>); //used to receive messages. The function will take data as argument
//End socket setup

//SunCalc setup: for sunrise-sunset times
var SunCalc = require('suncalc');
var serverTime = (('0'+(new Date()).getHours()).substring(-2)).concat(":",('0'+(new Date()).getMinutes()).substring(-2));
var sunriseTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getHours()).substring(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getMinutes()).substring(-2);
var nightTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getHours()).substring(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getMinutes()).substring(-2);
console.log(sunriseTime,nightTime);
var sunDown = false;
serverClock(); //Run the clock functions immediately to accurately display the visualization from the start
setInterval(serverClock,60000); //Run the clock functions every minute.
//End SunCalc setup

//Function to send data to the visualization site through a websocket
function visualize(messageName,ownedBy,value){
	let date = new Date();
	let currentDate = (('0'+date.getDate()).substr(-2)).concat("/",('0'+(date.getMonth()+1)).substr(-2),"/",('0'+date.getFullYear()).substr(-2));
	let currentTime = ('0'+date.getHours()).substr(-2).concat(":",('0'+date.getMinutes()).substr(-2),":",('0'+date.getSeconds()).substr(-2));
	let messageTypeId;
	if(messageName=='CON'){messageTypeId=0;}else if(messageName=='FINAL'){messageTypeId=1;}else{messageTypeId=2;}
	let data = { //create JSON with the data to send
		own: ownedBy,
		type: messageName,
		typeId: messageTypeId,
		pos: value,
		timeStamp: currentTime,
		dateStamp: currentDate
	}
	io.sockets.emit(messageName, data); //send 3 types of messages: CON, FINAL and STR
	lastTen.message.unshift(data);
	lastTen.message.length = constrain(lastTen.message.length,0,10);
	fs.writeFile('JSON_data/lastTen.json',JSON.stringify(lastTen,null,2),function(){}); //the arguments in stringify are to make the JSON indented and human readable
}

function initVisualization(){
	io.sockets.emit('INIT', lastTen);
	io.sockets.emit('TIMES', {time: sunDown});
}

//Function that keeps track of time/sunlight phases
function serverClock(){
	serverTime = (('0'+(new Date()).getHours()).substr(-2)).concat(":",('0'+(new Date()).getMinutes()).substr(-2)); //update Time

	if(serverTime=="01:00"){
		sunriseTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getHours()).substr(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getMinutes()).substr(-2);
		nightTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getHours()).substr(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getMinutes()).substr(-2);
		console.log("updated times");
	}

	//Check if the sun is up or down
	if((serverTime>sunriseTime)&&(serverTime<nightTime)&&sunDown){
		sunDown = false;
		console.log("Day.");
		io.sockets.emit('TIMES', {time: sunDown});
	}else if(((serverTime>nightTime)||(serverTime<sunriseTime))&&!sunDown){
		sunDown = true;
		console.log("Night:",serverTime);
		io.sockets.emit('TIMES', {time: sunDown});
	}
}



/*---------------------------------------------------------------------------------------------------------------------------------
--General use functions------------------------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------------------------------------------*/

//Map function (ported from p5js)
function map(n, start1, stop1, start2, stop2) {
	return ((n-start1)/(stop1-start1))*(stop2-start2)+start2;
}

//Constrain function (ported from p5js)
function constrain(n, low, high) {
	return Math.max(Math.min(n, high), low);
};

//Array comparison from https://www.freecodecamp.org/news/how-to-compare-arrays-in-javascript/
const arraysAreEqual = (a, b) => {
	if (a.length !== b.length) return false;
	else {
	  // Comparing each element of your array
	  for (var i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
		  return false;
		}
	  }
	  return true;
	}
};

function rgbLimitSaturation(r, g, b, satLimit) {
	//Part 1: Convert to HSL
	//RGB to HSL converter modified from https://gist.github.com/mjackson/5311256
	r /= 255, g /= 255, b /= 255;
  
	var max = Math.max(r, g, b), min = Math.min(r, g, b);
	var h, s, l = (max + min) / 2;
  
	if (max == min) {
	  h = s = 0; // achromatic
	} else {
	  var d = max - min;
	  s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
	  switch (max) {
		case r: h = (g - b) / d + (g < b ? 6 : 0); break;
		case g: h = (b - r) / d + 2; break;
		case b: h = (r - g) / d + 4; break;
	  }
  
	  h /= 6;
	}
	
	//Part 2: Limit saturation
	s = constrain(s, 0, satLimit);

	//Part 3: Convert back to RGB and return
	//HSL to RGB converter modified from https://gist.github.com/mjackson/5311256
	r = null;
	g = null; 
	b = null;

	if (s == 0) {
		r = g = b = l; // achromatic
	} else {
		function hue2rgb(p, q, t) {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1/6) return p + (q - p) * 6 * t;
		if (t < 1/2) return q;
		if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
		return p;
		}

		var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		var p = 2 * l - q;

		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}

	return [ Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255) ];
}  