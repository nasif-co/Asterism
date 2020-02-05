# Server code <sup>[JS]</sup> 

The server is built with node.js and uses a few packages in order to control LIFX bulbs, communicate with XBee through a Serialport, host and send realtime data to a web visualization and calculate local Sunrise and Sunset times. Here you can find an *almost* line-by-line code explanation of how it works.

## Setup

### LIFX Setup

The first part of the code takes care of setting up all our modules to react to different events:

```js
//Lifx package and setup variables
var LifxClient = require('node-lifx').Client;
var client = new LifxClient();
const lifxMAC = ['d073d51375c8','d073d5139da2','d073d52bcca5']; 
//Our Lifx mac addresses in the same order as the bulbs

//Lifx Setup:: Lamp discovery and initialization
client.on('light-new', function(light){registerLights(light);}); //Register the LIFx Lights
client.init();
//End lifx Setup
```
Here we include our LIFX package, we give the server the MAC addresses of the LIFX bulbs that we are using for the project and then we tell it to constantly search for lights. Whenever a new bulb is found on the network, the *'light-new'* event will happen, which in turn will execute the *registerLights* callback function, passing the light that was found as an argument:

```js
function registerLights(light){
	if(light.id==lifxMAC[2]){
		bulb[0] = light;
		light.color(0,100,0,3500,200);
		console.log('                  LIFX::: Bulb one registered.');
	}else if(light.id==lifxMAC[1]){
		bulb[1] = light;
		light.color(0,100,0,3500,200);
		console.log('                  LIFX::: Bulb two registered');
	}else if (light.id==lifxMAC[0]) {
		bulb[2] = light;
		light.color(0,100,0,3500,200);
		console.log('                  LIFX::: Bulb three registered');
	}else{
		console.log('                  LIFX::: Unknown light in the network, id: ' + light.id)
	}
}
```

Once called, this function will compare the found light's MAC address with the ones stored in the *lifxMAC* variable. If one of these match, it will register the bulb and print a confirmation message to the console. Otherwise, it will print an 'Unknown bulb' message, as well the the bulb's MAC address, in case we want to modify the code so as to include it.

### XBee Setup

The server is connected to an XBee coordinator through serial port. Here we establish the connection:

```js
//XBee Setup
var SerialPort = require('serialport');
var xbee_api = require('xbee-api');
var C = xbee_api.constants;

var xbeeAPI = new xbee_api.XBeeAPI({
	api_mode: 2
});

var serialport = new SerialPort("/dev/cu.usbserial-A4007Uj0", { //Coordinator serial port
	baudRate: 115200.
});

serialport.pipe(xbeeAPI.parser);
xbeeAPI.builder.pipe(serialport);
//End XBee Setup
```

First we include both the serialport and xbee packages used. Once done, we set the XBee in API mode (as is required by this particular package) and we add the serial address for the XBee. In Mac, you can find this address by opening up a terminal window and typing:
```
ls /dev/tty.usb*
```
This will return the list of usb serial addresses of the devices connected to the computer. If you only have your XBee connected, that should be the one.

The final part of this code snippet sets up communication with the XBee at a 115200 baud rate on the Serialport we selected.

### Web Visualization Setup

The last part of the setup is dedicated to configuring the different dependencies required for hosting the web visualization (express), sending data to it (socket.io) and storing data in memory for relaunch even when the server is off (File System or fs):

#### Express
```js
//Express setup: Web Server
var express = require('express');
var app = express();
var webServer = app.listen(3000); //Start Web Server on port 3000
app.use(express.static('public')); //Host the files in the 'public' folder on the server
//End express setup
```
This code starts a webserver on port 3000 ([localhost:3000](http://localhost:3000)), and hosts the files located inside the *public* directory that is at the root folder in the coop_light directory.

#### JSON data storage

```js
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
```
This snippet is used to setup the file that will store the latest data from the server. We first include the fs (File System dependency) and create a variable that stores the last ten movements in JSON format. Then, we check to see if a storage file already existed. If it did, we save its contents into our *lastTen* variable as soon as we run the server. If it did not, we simply initialize our *lastTen* variable as an empty JSON object. As data comes in, this object will fil up and create a storage file that will be described in the next section.

#### Suncalc Sunrise-Sunset calculator
```js
//SunCalc setup: for sunrise-sunset times
var SunCalc = require('suncalc');
var serverTime = (('0'+(new Date()).getHours()).substr(-2)).concat(":",('0'+(new Date()).getMinutes()).substr(-2));
var sunriseTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getHours()).substr(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunrise.getMinutes()).substr(-2);
var nightTime = ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getHours()).substr(-2) + ":" + ('0'+SunCalc.getTimes(new Date(), 46.8078441, -71.22027609999999).sunset.getMinutes()).substr(-2);
console.log(sunriseTime,nightTime);
var sunDown = false;
setInterval(serverClock,60000); //Run the clock functions every minute.
//End SunCalc setup
```
This extra code is used to change the way the visualization looks in daytime and nighttime. I found it helps due to the very variable yearly sunrise and sunset times in Canada. The code first includes the SunCalc dependency. Then, it stores the *serverTime* in the format 'HH:MM', as well as both the *sunriseTime* and *nightTime* using the latitude and longitude values of the coop (or close enough). It then creates a boolean variable that keeps track of when the sun is up or down. Finally, the snippet ends by setting an interval that will call the *serverClock* function every minute:

```js
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
```

This function updates the server time, checks for the new *sunriseTime* and *nightime* at 1:00AM every day, and also keeps track of the sunDown variable, making sure it is accurate. Whenever the sun sets or rises, it also tells any open visualization that it is now daytime or nighttime (which is described below).

#### Socket.io
```js
//Socket setup: Communication with the web visualization
var socket = require('socket.io');
var io = socket(webServer); //Object that keeps track of inputs and outputs of the Web Server
io.sockets.on('connection', initVisualization); //use this to trigger a function on connection to the website. The function will take socket as argument
//End socket setup
```

Here we include the socket.io dependency and we establish that, as soon as a connection to the web visualization is established (ie. somebody enters the url), the event *'connection'* will occur, which executes the *initVisualization* callback function:

```js
function initVisualization(){
	io.sockets.emit('INIT', lastTen);
	io.sockets.emit('TIMES', {time: sunDown});
}
```
This is used to send the last information from the server to the visualization. Without it, the visualization would show no data previous to the time in which we entered the URL. With this addition, you may reload the site and still have the latest data. In terms of the code, it emits two messages to the visualization: one called 'INIT' which contains a JSON object with the last 10 movements in the system, and another one called "TIMES" which sends and creates a JSON object that tells the server if it is currently daytime or nighttime.

## Events and 'loop'

After this setup comes what I like to think of as the 'loop' code of the server. This is what keeps everything running and more-or-less repeats itself. Although, how it works is by setting up and reacting to events as they come, in an asynchronous fashion.

### Sending Messages to the Controllers

#### Serial port Begin.
```js
serialport.on("open",function(){ //Happens when we establish serial connection with the XBee Coordinator
  setInterval(sendPosition,200); //In charge of sending the new positions to the sliders
  setInterval(checkForOverflow,1700); //Regulates the send speed to avoid overflowing the microcontrollers
  setInterval(standbyUpdater,(20*60000)); //Sends the current position to the sliders every 20 min, making sure they are all in sync
});
```
This first event happens only once, when the server starts, and is in charge of establishing connection with the XBee through the serial port. However, it is here where we set up 3 important intervals for the inner-workings of the server:

##### checkForOverflow Interval
```js
function checkForOverflow(){
	if(prevRecentMessages!=recentMessages){
		prevRecentMessages = recentMessages
	}else{ //There has been a whole 1700ms w/o messages
		recentMessages = 0;
		prevRecentMessages = 0;
	}
}
```
This interval checks if any messages have been sent in the last 1700ms, clearing out the *recentMessages* variable when no messages have been sent in this timeframe. This is used in the sendPosition function to regulate how often we send messages out.

##### standbyUpdater Interval
```js
function standbyUpdater(){
	if(recentMessages==0){
		standbyUpdate = true;
		owner = "COORD";
		console.log("::::::::::::::::::::Synchronized Sliders");
	}
}
```
This function is called every 20min, and it has the role of keeping all controllers in sync even when not in use. Sometimes, one or more controllers may miss a message from the server. If this happens, this control will stay out of sync. To prevent this, the server sends the last position out every 20min. Hence, controllers already at that position won't move whilst those at another position will slide to sync up with the rest.

This function however does NOT take care of the sending of this update message. It merely sets a flag in the form of the *standbyUpdate* variable. When this variable is set to true, the sendPosition function knows it must send a sync message.

##### sendPosition Interval
```js
function sendPosition(){
	if(((globalPosition!=prevGlobalPosition)||(standbyUpdate))&&!waitingToSend){
		waitingToSend = true;
		standbyUpdate = false;

		recentMessages++;
		if(recentMessages>9) recentMessages = 9;
		console.log(recentMessages);

		setTimeout(function(){
			sendTX("CON|".concat(owner,"|",lightPositionString));
			console.log("----------------------------------------------------New Position: ".concat(lightPositionString));
			waitingToSend = false;
		},flowControl[recentMessages]);
		prevGlobalPosition=globalPosition;
	}
}
```
This function is one of the key pieces of the server, as it manages all the messages that go out from the server to the controllers, as well as the timing between each message. It is called every 200ms and the first thing it does is check if it needs to send a message. For this to be true, two conditions must be met:

  * We have received a new position from the sliders *or* the *standbyUpdate* flag is set to true.
  * We are NOT currently waiting to send a message
  
If both conditions are met, we declare we are currently waiting to send a message (*waitingToSend* = true) and we declare that the update sync has been fulfilled (*standbyUpdate* = false). After this, increment the amout of messages recently sent out (recentMessages++) but keep it at a limit of 9 messages. This counter will be used to define how much time we must wait before sending the message we are about to send. 

Now, we set a timeout. This will send out our message by calling the sendTX function, logging the message to the console, setting the waitingtoSend flag as false and establishing that the new global position of the controllers is now synchronized (*prevGlobalPosition = globalPosition;*). However, how much time we must wait to execute these operations is defined by the *flowControl* array:

```js
var flowControl = [0,100,200,300,500,1000,1700,1700,1700];
```

This variable has 9 positions, each with a different wait time in milliseconds. Which of these is used is defined by how many messages have been sent recently. Therefore is we have sent 2 messages, we must wait 100ms. If we have sent 9 or more we must wait 1700ms. These wait times were set through prototyping, trying to reach the shortest wait times that would ensure the Arduinos would receive every message. 

### Receiving and Visualizing Messages from the Controllers

After setting up the functions and interval that take care of sending the messages out, we set up how the server responds to the events that occur when receiving messages:

```js
xbeeAPI.parser.on("data", function(frame) { //Whenever data is received
	if(frame.type==0x90){ //Make sure it is a normal data packet
	   var received = frame.data.toString('utf8') //save the data
	   console.log(">>", received); //print it to console
	   var words = received.split('|'); //Split it by the delimiter (a single pipe symbol: | )

	   visualize(words[0],words[1],constrain(parseInt(words[3],10),0,500)); //Send data to web server visualization
```

This first part is called when data is received through the XBee. We first check if the frame type of this data is 0x90, the type used for messages. If it is, we save the data as a string in the *received* variable, we print it out onto the console and we then divide it into the different data points using the delimiter '|'. Once that is done, we call visualize:

```js
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
```

This function receives the 3 data values from the XBee message and builds a JSON data object that contains all important data about this last movement in the system. It then emits this JSON object to the webserver for visualization. Once done, it adds this data object to the lastTen variable and stores it in the storage file: lastTen.json.

Now back to the XBee message receiving event:

```js
if(words[0]=="FINAL"){ //If it is a message received when the user has moved the slider and stopped
	   	owner = words[1]; //Save the owner of the message 
	   	//let type = words[2]; //save message type (not being used right now)
	   	lightPositionString = words[3]; //Save the new light position in a string
	   	globalPosition = parseInt(words[3],10); //Save the new light position in an int. This will trigger sendPosition()
	   	lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
	   	moveLightObject(100); //Run function that updates the lights according to the final pot movement (argument is brightness 0-100)
	   	console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
	   }
```

In this part, we already know it is a normal message and we have divided it by the delimiter. Now we act differently depending on what kind of message it is. If it is a FINAL type message, we must update both the bulbs and the controllers. We set the globalPosition as the one received in the message, we save this also to lightPosition, constraining it between 0 and 500, and then we call the *moveLightObject* function, which animates the light bulbs:

```js
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
```
This function basically does a brightness mapping depending on the values received. This way, it maps the brightness between 3 bulbs, to achieve the movement effect. In the future, as more lights are added, this section of the code must change.

```js
}else if(words[0]=="STR"){ //If it is a message received when the user is struggling with another
	   	owner = "COORD"; //Set the owner as the coordinator so everyone receives it equally and the position is correctly set
	   	lightPositionString = words[3]; //Save the position as a string
	   	globalPosition = parseInt(words[3],10); //Save the position as an int. This will trigger sendPosition()
```

This part states that if the message is not a FINAL message but rather an 'STR' or Struggle Message, we must act the same way as if it were a FINAL message, except for the owner line. By changing the owner to COORD, the instruction will be followed by all controllers, including the original sender.

```js
else if(words[0]=="CON"){ //Else if the message is received during the movement of a slider
	   	lightPosition = constrain(parseInt(words[3],10),0,500); //Save the position as an int
	   	moveLightObject(100); //Run function that updates the lights according to current pot movement (argument is brightness 0-100)
	   	console.log("::::::::::::::::::::Updated lights to: ".concat(lightPosition));
	   }
```
Finally, if the message is a 'CON' or Control message, we only have to update the lights, so only the lightPosition variable is updated and the moveLightObject function is called.

```js
    }else{ //It was another sort of packet, print out the details for debugging:
    	console.log("********Got something odd*********");
    	console.log("Type: ".concat(frame.type));
    	console.log("Data: ".concat(frame.data.toString('utf8')));
    	console.log("********End oddity***************");
    }
});
```

This final part closes the Xbee message received event. The 'else' comes from checking if the message packet is type 0x90 (normal message type). If it is not, the code enters this section, which only prints an error message that contains both the received data and its type, for troubleshooting.

### Troubleshooting
  * If the web visualization doesn't run, it could be due to a change in the host computer's IP address. Try running it on the host computer at http://localhost:3000 and then look up the computers IP address in order to run it on other devices on the network.
  
  * If you get an error when running the server, perhaps the XBee's serial port address has changed. Check out the XBee setup section above to see how to fix it.
  
  * The server doesn't work immediately. If you start it and immediately attempt to use one of the controllers, the server may fail since it will receive a message but not know what to do with it. If this happens, reboot the server and give it a minute or two to start up.
