/*
COOP LIGHTING SERVER

XBee coordinator must be connected through a serial port (specified down below).
The PANID for the XBees is 1996.
*/

//TO DO:   Check lights are indeed updated with Final messages
//         Make '1' and '499' turn off the lights

//Global Variables
var bulb=[]; //array that holds the outdoor lights in order
var util = require('util');
var globalPosition = 0; //Global position of all potentiometers. 0-500
var prevGlobalPosition = 0; //Previously sent position of potentiometers. 0-500
var lightPositionString = "0"; //String that holds the final received position, to send it back to the pots to update global position
var lightPosition; //The position where light is, updated much faster than global position. 0-500
var owner; //String that holds the owner module of the last message received

var flowControl = [0,100,200,300,500,1000,1700,1700,1700,2000,2000]; //Array that changes the time between each message according
																	 //to how many messages have been sent in the last 1700ms
var waitingToSend = false; //True if the program is in the waiting period before sending a new global position message
var recentMessages = 0; //Keeps count of how many messages have been sent out to the modules in the last 1700ms
var prevRecentMessages = 0; //Used to compare w/ recentMessages, to see if it has changed (ie. a new message was just sent)
var standbyUpdate = false; //Used to override normal checks before sending a message, in order to synchronize lights


///////////////////////////////////////////// S E T U P ////////////////////////////////////////////////

//Lifx package and setup variables
var LifxClient = require('node-lifx').Client;
var client = new LifxClient();
const lifxMAC = ['d073d52bd838','d073d52bb7d9','d073d52bcca5']; //Our Lifx mac addresses in the same order as the bulbs

//Lifx Setup:: Lamp discovery and initialization
client.on('light-new', function(light){registerLights(light);}); //Register the LIFx Lights
client.init();
//End lifx Setup

//XBee Setup
//var SerialPort = require('serialport');
const { SerialPort } = require('serialport')
var xbee_api = require('xbee-api');
var C = xbee_api.constants;

var xbeeAPI = new xbee_api.XBeeAPI({
	api_mode: 2
});

var serialport = new SerialPort( { 
	path:"/dev/tty.usbserial-DN05LSUY",
	baudRate: 115200 //Be careful when reprogramming the coordinator, the baudRate sometimes is reset to 9600 in XCTU
});

serialport.pipe(xbeeAPI.parser);
xbeeAPI.builder.pipe(serialport);
//End XBee Setup

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

//JSON saving/reading setup
var fs = require('fs');
var lastTen;
var exists = fs.existsSync('JSON_data/lastTen.json');
if(exists){
	lastTen = JSON.parse(fs.readFileSync('JSON_data/lastTen.json','utf8'));
	console.log("Read back last ten messages received from: 'JSON_data/lastTen.json'");
}else{
	lasTen = {};
}
//End JSON setup

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

//////////////////////////////////////////// E V E N T S ///////////////////////////////////////////////

serialport.on("open",function(){ //Happens when we establish serial connection with the XBee Coordinator
  setInterval(sendPosition,200); //In charge of sending the new positions to the sliders
  setInterval(checkForOverflow,1700); //Regulates the send speed to avoid overflowing the microcontrollers
  setInterval(standbyUpdater,(20*60000)); //Sends the current position to the sliders every 20 min, making sure they are all in sync
});

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
	   	globalPosition = parseInt(words[3],10); //Save the new light position in an int. This will trigger sendPosition()
	   	lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
	   	moveLightObject(100); //Run function that updates the lights according to the final pot movement (argument is brightness 0-100)
	   	console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
	   }else if(words[0]=="STR"){ //If it is a message received when the user is struggling with another
	   	owner = "COORD"; //Set the owner as the coordinator so everyone receives it equally and the position is correctly set
	   	lightPositionString = words[3]; //Save the position as a string
	   	globalPosition = parseInt(words[3],10); //Save the position as an int. This will trigger sendPosition()
	   }else if(words[0]=="CON"){ //Else if the message is received during the movement of a slider
	   	lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
	   	moveLightObject(100); //Run function that updates the lights according to current pot movement (argument is brightness 0-100)
	   	console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
	   }
    }else{ //It was another sort of packet, print out the details for debugging:
    	console.log("********Got something odd*********");
    	console.log("Type: ".concat(frame.type));
    	console.log("Data: ".concat(frame.data.toString('utf8')));
    	console.log("********End oddity***************");
    }
});


/////////////////////////////////////////// F U N C T I O N S //////////////////////////////////////////////


//Lifx Functions
function passBy(light){
	//hue 0-360, saturation 0-100, brightness 0-100, kelvin 2500-9000 (default 3500), duration for change millis
	light.color(0,100,100,3500,200); 
	setTimeout(function(){light.color(0,100,0,3500,200)},200);
}

//XBee Functions

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

//Server control functions

function sendPosition(){
	if(((globalPosition!=prevGlobalPosition)||(standbyUpdate))&&!waitingToSend){
		waitingToSend = true;
		standbyUpdate = false;

		recentMessages++;
		if(recentMessages>9) recentMessages = 9;
		//Printed to visualize flow control
		//console.log(recentMessages);

		setTimeout(function(){
			sendTX("CON|".concat(owner,"|",lightPositionString));
			console.log("----------------------------------------------------New Position: ".concat(lightPositionString));
			waitingToSend = false;
		},flowControl[recentMessages]);
		prevGlobalPosition=globalPosition;
	}
}

function checkForOverflow(){
	if(prevRecentMessages!=recentMessages){
		prevRecentMessages = recentMessages
	}else{ //There has been a whole 1700ms w/o messages
		recentMessages = 0;
		prevRecentMessages = 0;
	}
}

function registerLights(light){
	if(light.id==lifxMAC[2]){
		bulb[0] = light;
		light.color(0,100,0,3500,200);
		console.log('                                                LIFX::: Bulb one registered.');
	}else if(light.id==lifxMAC[1]){
		bulb[1] = light;
		light.color(0,100,0,3500,200);
		console.log('                                                LIFX::: Bulb two registered');
	}else if (light.id==lifxMAC[0]) {
		bulb[2] = light;
		light.color(0,100,0,3500,200);
		console.log('                                                LIFX::: Bulb three registered');
	}else{
		console.log('                                                LIFX::: Unknown light in the network, id: ' + light.id)
	}
}

function moveLightObject(brightness){
	if(lightPosition<=125){
		if(bulb[0]!=undefined) bulb[0].color(0,0,map(lightPosition,0,125,0,brightness),3500,100);
		if(bulb[1]!=undefined) bulb[1].color(0,0,0,3500,100);
		if(bulb[2]!=undefined) bulb[2].color(0,0,0,3500,100);
	}else if(lightPosition>125&&lightPosition<=250){
		if(bulb[0]!=undefined) bulb[0].color(0,0,map(lightPosition,126,250,brightness,0),3500,100);
		if(bulb[1]!=undefined) bulb[1].color(0,0,map(lightPosition,126,250,0,brightness),3500,100);
		if(bulb[2]!=undefined) bulb[2].color(0,0,0,3500,100);
	}else if(lightPosition>250&&lightPosition<=375){
		if(bulb[0]!=undefined) bulb[0].color(0,0,0,3500,100);
		if(bulb[1]!=undefined) bulb[1].color(0,0,map(lightPosition,251,375,brightness,0),3500,100);
		if(bulb[2]!=undefined) bulb[2].color(0,0,map(lightPosition,251,375,0,brightness),3500,100);
	}else if(lightPosition>375){
		if(bulb[0]!=undefined) bulb[0].color(0,0,0,3500,100);
		if(bulb[1]!=undefined) bulb[1].color(0,0,0,3500,100);
		if(bulb[2]!=undefined) bulb[2].color(0,0,map(lightPosition,375,500,brightness,0),3500,100);
	}
}

function standbyUpdater(){
	if(recentMessages==0){
		standbyUpdate = true;
		owner = "COORD";
		console.log("::::::::::::::::::::Synchronized Sliders");
	}
}

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

//Other useful functions (ported from p5js)
function map(n, start1, stop1, start2, stop2) {
	return ((n-start1)/(stop1-start1))*(stop2-start2)+start2;
}

function constrain(n, low, high) {
	return Math.max(Math.min(n, high), low);
};
