# Web Visualizer Code <sup>[P5.JS][JS]</sup> 
The web visualizer code is hosted using the express dependency in the node.js server. It is built using mostly p5.js. Here you can find an *almost* line-by-line code explanation of how it works.

## Setup and Callbacks
```js
function setup() {
	orange = color(255,103,0);
	blue = color(0,0,99);
	bgColor = orange;
	browserColor = select('#browserColor');
	var canvas = createCanvas(windowWidth, windowHeight);	
	background(255,103,0);
	socket = io.connect(window.location.pathname); //connect to the socket
	socket.on('CON', controllerMessage);
	socket.on('FINAL', controllerMessage);
	socket.on('STR', controllerMessage);
	socket.on('INIT', initializeVisualization);
	socket.on('TIMES', catchTimes);
}
```
The setup functions starts by defining certain colors that are used in the visualization, as well as creating a canvas with the size of the browser window that has been opened. However, the most important part is the definition of the socket events that takes place at the end of the function.

Here we define 5 types of data messages that may be received from the server: (The names of these messages is defined in the server code)

* CON :: A controller message, contains data from a continuous movement from a particular controller.
* FINAL :: A final message, contains data from the last position reached at the end of a continuous movement.
* STR :: Struggle message, contains the data of controller fighting to keep its position.
* INIT :: The initial message sent from the server to start the visualization
* TIMES :: Carries a boolean data value telling the visualization if it is nighttime or daytime.

In order to react to each message, callbacks are attached to them depending on the type of information they give:

### InitVisualization
This is the first function called once communication is established with the server. It is meant to fill up the *message* arrays, which store each of the JSON properties of the last 10 messages.

```js
function initializeVisualization(data){
	if(millis()<3000){
		for(let i = 0 ; i < data.message.length ; i++){
			messageOwner[i] = data.message[i].own;
			messageType[i] = data.message[i].typeId;
			messageValue[i] = data.message[i].pos;
			messageTime[i] = data.message[i].timeStamp;
			messageDate[i] = data.message[i].dateStamp;
		}
		pos = messageValue[0];
		smoothPos = pos;
	}
}
```
Therefore, this code runs a for loop that fills up the *message* arrays with the respective properties of each of the received JSON objects. Each message has an owner name, a message type, a position value, a time it arrived to the server and a date. Hence, to find the owner name of the first message you have to call *messageOwner[0]*, or to get that same messages time you must call *messageTime[0]*. The index value corresponds to the ranking of the messages.

After filling out the arrays, the *pos* variable is set equal to the *messageValue* in position 0 of the array, the most recent message. This defines the current position of the 'light-object'.

### catchTimes
This function is called at the beginning of the visualization and then at sunrise and sunset. It serves to change the visualization depending on the current position of the sun: if it is daytime or nighttime.

```js
function catchTimes(data){
	sunDown = data.time;

	if(prevSunDown!=sunDown){
		if(millis()<3000){
			prevSunDown=sunDown;
			if(sunDown){
				bgColor = blue;
			}else{
				bgColor = orange;
			}
			browserColor.attribute('content',bgColor.toString('#rrggbb'));
		}else{
			if(sunDown){
				for(let i = 0; i < 10000; i+=100){
					setTimeout(function(){bgColor=lerpColor(orange,blue,i/10000);browserColor.attribute('content',bgColor.toString('#rrggbb'));},i);
				}
			}else{
				for(let i = 0; i < 10000; i+=100){
					setTimeout(function(){bgColor=lerpColor(blue,orange,i/10000);browserColor.attribute('content',bgColor.toString('#rrggbb'));},i);
				}
			}
		}
	}

	prevSunDown = sunDown;
}
```

We first set sunDown (boolean) equal to the data received. Then, if the visualization has just started (millis()<3000), we immediately set the visualization background to blue for nighttime or orange for daytime. If, on the contrary, the visualization has already been running for a while, we do a gradual 'sunrise' or 'sunset' effect. To achieve this, we do a for loop with 100 steps. Inside it, we set 100 timeouts, each separated by 100ms and each setting a gradually increasing color in the range from blue to orange (sunrise) or orange to blue (sunset). Therefore, we get an animated gradient with 100 frames and a duration of 10 seconds (10fps).

Once the changes have been executed, we update prevSunDown to equal the current sunDown value.

### controllerMessage
This is the general function whenever a JSON object arrives containing the data of a single movement in the network. What it does is erase the last data point in the *message* arrays, and shift the whole list downward, adding the new data in position 0. This way, the data contained in index 0 of all of the *message* arrays corresponds to the data of the most recent message, while the data contained in index 9 corresponds to the data of the oldest message that we have stored.

```js
function controllerMessage(data){
	console.log('owner: '+data.own+' position: '+data.pos);
	pos = data.pos;
	messageOwner.unshift(data.own);
	messageType.unshift(data.typeId);
	messageValue.unshift(data.pos);
	messageTime.unshift(data.timeStamp);
	messageDate.unshift(data.dateStamp);

	if(messageType.length>10){
		messageType.length=10;
		messageOwner.length=10;
		messageValue.length=10;
		messageDate.length=10;
		messageTime.length=10;
	}
}
```

To achieve this, we use the *unshift* function. This automatically adds the latest data point on the 0 position, shifting everything downward. Then, we make sure the length of the each of the *message* stays at 10, which deletes the data of the previous 10th position.

Also, this functions updates the current position of the ligh-object, making sure it coincides with the position value of the message in index 0.

## Draw
```js
function draw() {
	smoothPosition();
	background(bgColor);
```

The draw begins by setting the background color and making a call to the smoothPosition function:

```js
function smoothPosition(){
	let force = pos - smoothPos;
	force *= strength;
	vel *= drag;
	vel += force;
	smoothPos += vel;
}
```
This is a function taken from [this Val Head video about spring animations in p5.js](https://www.youtube.com/watch?v=VWfXiSUDquw&t=463s). It sort of simulates a believable spring system that smooths out the change of the light-object's position from the last message's position value to the new one. The video explains it much better than I ever could.

Next comes this:
```js
if(smoothPos<125){
		alph=map(smoothPos,0,124,0,255);
	}else if(smoothPos>375){
		alph=map(smoothPos,376,500,255,0);
	}else{
		alph=255;
	}
	lightObject(map(smoothPos,0,500,width,4*width/8),height/5,alph)
```
Here we control the fill of the light-object, the little ball moving from left to right. The three 'if's set the alpha value:

* Slowly maps out to 0 if it is in the corners, disappearing.
* Stays at full brightness if it is inside the range of the bulbs.

Once that is calculated, we call the lightObject function that has the required geometric instructions for drawing the shape of the ball. These instructions are modificed using the parameters the function is called with (1st parameter is x position, 2nd is y position and 3rd is the alpha value).

After this, we draw the bulbs as they react to the movement of the light-object:

```js
if(smoothPos>=-3&&smoothPos<=125){
		bulb(7*width/8,height/5,2,map(smoothPos,0,125,0,255));
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,0);
	}else if(smoothPos>125&&smoothPos<=250){
		bulb(7*width/8,height/5,2,map(smoothPos,126,250,255,0));
		bulb(6*width/8,height/5,2,map(smoothPos,126,250,0,255));
		bulb(5*width/8,height/5,2,0);
	}else if(smoothPos>250&&smoothPos<=375){
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,map(smoothPos,251,375,255,0));
		bulb(5*width/8,height/5,2,map(smoothPos,251,375,0,255));
	}else if(smoothPos>375){
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,map(smoothPos,376,500,255,0));
	}else{
		bulb(7*width/8,height/5,2,0);
		bulb(6*width/8,height/5,2,0);
		bulb(5*width/8,height/5,2,0);
	}
```
This series of 'if's take care of how much brightness to draw each bulb with. Inside it you find 3 bulbs in each, because 3 bulbs are always drawn. The first 3 parameters are always the same because they don't change in the visualization:

  * X position
  * Y position
  * Scale factor
  
However, the 4th value does change, as it takes care of the brightness of the bulb. For this one we map smoothPos: when the light-object is in the same zone as a bulb, the smoothPos maps out to a brightness value that spans from 0 at one end of the zone to 255 just on top of the bulb and back to 0 at the other end of its zone. Evidently, some half zones cross, which results in having two bulbs on at the same time. 

Once the whole calculation is done, the call to the *bulb* function takes care of the geometry of drawing the bulb in the precies location that was selected.

Finally, we display the text data of the last 10 messages/movements in the network:

```js
  //Show last 10 messages from controllers:
  for(var i = 0;i<messageType.length;i++){
  	fill(255,255-(i*25.5));
  	textFont(monoSp);
  	textSize(15);
  	text(messageOwner[i],width/6,(height/2-35)+(35*i));

  	textSize(11);
  	text(messageDate[i],width/6+100,(height/2-48)+(35*i));
  	text(messageTime[i],width/6+100,(height/2-35)+(35*i));
  	

  	textSize(31)
  	textFont(sansSer);
  	text(messageValue[i],width/6+35,(height/2-35)+(35*i));

  	tint(255,255-(i*25.5))
  	image(icns[messageType[i]],width/6,((height/2-35)-25)+35*i,25,11.635);
  }
}
```
This part runs through a 10 step for loop. In each step it draws text for the messageOwner, the date, time and the position value, as well as one of 3 icons that denotes if it was a CON, FINAL or STR message. The code always draws the message at index 0 at the same position, and spans down the rest of the messages from there. However, because the list is always shifting, the data for each position always changes. This is not controlled here but rather in the *controllerMessage* callback. One last effect that allows us to know which message is more recent and which one is older is the fact that the messages are drown in decreasing opacity. Hence, the newset message is the most opaque whilst the oldest is barely visible. This is achieved in this line:
```js
fill(255,255-(i*25.5));
```
Where the opacity value is a function of the step in the for loop. In step 1, i = 0, hence opacity = 255. In contrast, in step 10, i = 9, so opacity = 25.5.

## Notes
* In retrospect, the *message* arrays don't seem like the clearest way to achieve this. A future iteration could create a message Class that contains all of these properties of messages inside it.
