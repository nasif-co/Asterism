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
	green: "",
	blue: "",
}
//IDs of active controllers and their colors

const lifxMAC = [
	'd073d52bb7d9', 
	'd073d52c02ee', 
	'd073d52bcca5', 
	'd073d52bdb86', 
	'd073d52bea9c', 
	'd073d52bd838'
];
//MAC addresses of all bulbs used in the program, in their physical order

const maxBrightness = 100;
//Max value of brightness that the bulbs should reach. 0-255.

const minBrightness = 0;
//Min value of brightness that the bulbs should be at. 0-255

const bulbFrameRate = 8;
//Animation framerate for the bulbs. Larger means more bandwidth.

const xbeePort = "/dev/tty.usbserial-DN05LSUY";
//Seria port path for the coordinator XBee connected to the computer

const finalSyncDelay = 800;
//Milliseconds before a new light position is sync'ed to all colors.


//System variables------------------------------------------------------------------------
/* Internal variables and objects not meant to be changed */
var util = require('util');
var globalPosition = 0; //Global position of all potentiometers. 0-500
var prevGlobalPosition = 0; //Previously sent position of potentiometers. 0-500
var lightPositionString = "0"; //String that holds the final received position, to send it back to the pots to update global position



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
var bulb=[]; //array that holds the outdoor lights in order

//Lifx bulb discovery and initialization
client.on('light-new', function(light){registerLights(light);}); //Register the LIFx Lights
client.init();

function registerLights(light){
	if( lifxMAC.includes( light.id ) ){
		let position = lifxMAC.findIndex( element => element == light.id );
		bulb[ position ] = light;
		light.color(0,100,0,3500,200);
		console.log('                                                LIFX::: Bulb ' + (position + 1) + ' registered.');
	}else{
		console.log('                                                LIFX::: Unknown light in the network, id: ' + light.id)
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
	if( ( ( globalPosition != prevGlobalPosition ) || ( standbyUpdate ) ) && !waitingToSend ){
		waitingToSend = true;
		standbyUpdate = false;

		recentMessages++;
		if(recentMessages>9) recentMessages = 9;
		//Printed to visualize flow control
		//console.log(recentMessages);

		setTimeout( 
			function(){
				sendTX("CON|".concat(owner,"|",lightPositionString));
				console.log("----------------------------------------------------New Position: ".concat(lightPositionString));
				waitingToSend = false;
			},
			flowControl[recentMessages]
		);
		prevGlobalPosition = globalPosition;
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

xbeeAPI.parser.on("data", function(frame) { //Whenever data is received
	if(frame.type==0x90){ //Make sure it is a normal data packet
		var received = frame.data.toString('utf8') //save the data
		console.log(">>", received); //print it to console
		var words = received.split('|'); //Split it by the delimiter (a single pipe symbol: | )

		visualize(words[0],words[1],constrain(parseInt(words[3],10),0,500)); //Send data to web server visualization

		if(words[0]=="FINAL"){ //If it is a message received when the user has moved the slider and stopped
			owner = words[1]; //Save the owner of the message 
			//let type = words[2]; //save message type (not being used right now)
			lightPositionString = words[3]; //Save the new light position in a string
			

			clearTimeout(finalSyncTimeout);
			finalSyncTimeout = setTimeout( function(){
			globalPosition = parseInt(lightPositionString,10); //Save the new light position in an int. This will trigger sendPosition()
			for (const key in sublights) {
				sublights[key].position = constrain(parseInt(words[3],10),0,500);
			}
			moveLightObject(100); //Run function that updates the lights according to the final pot movement (argument is brightness 0-100)
		}, finalSyncDelay);
		
//console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
		}else if(words[0]=="STR"){ //If it is a message received when the user is struggling with another
			clearTimeout(finalSyncTimeout);
			owner = "COORD"; //Set the owner as the coordinator so everyone receives it equally and the position is correctly set
			lightPositionString = words[3]; //Save the position as a string
			globalPosition = parseInt(words[3],10); //Save the position as an int. This will trigger sendPosition()
		}else if(words[0]=="CON"){ //Else if the message is received during the movement of a slider
			//lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
			let sender = words[1];
			for (const key in sublights) {
				if(sublights[key].owner == sender){
					sublights[key].position = constrain(parseInt(words[3],10),0,500);
				}
			}
			moveLightObject(100); //Run function that updates the lights according to current pot movement (argument is brightness 0-100)
//console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
		}
	}else{ //It was another sort of packet, print out the details for debugging:
		console.log("********Got something odd*********");
		console.log("Type: ".concat(frame.type));
		console.log("Data: ".concat(frame.data.toString('utf8')));
		console.log("********End oddity***************");
	}
});



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
let currentBulbsColor = [[],[],[],[],[],[]]
  
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
			for (const key of bulb.keys()) {
				let intervalSize = 500/(bulb.length - 1);
				let bulbColor = [];
				let colorCounter = 0;
				for (const color in sublights) {
					bulbColor[colorCounter] = constrain( constrain(map(sublights[color].smoothedPos, intervalSize*(key-1), intervalSize*key,0,1),0,1)*maxBrightness - constrain(map(sublights[color].smoothedPos,intervalSize*key,intervalSize*(key+1),0,1),0,1)*maxBrightness, minBrightness, maxBrightness);
					colorCounter++;
				}

				//Send values to bulb only if they are different from the last sent values
				if( !arraysAreEqual(bulbColor, currentBulbsColor[key]) ){
					bulb[key].colorRgb(bulbColor[0],bulbColor[1],bulbColor[2],1000/bulbFrameRate);
					currentBulbsColor[key] = bulbColor;
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